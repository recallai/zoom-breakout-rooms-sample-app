import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { bots, meetings, rooms, type BotType } from "@/db/schema";
import { bot_create, bot_create_payload, bot_leave } from "@/lib/recall/bot";
import { RecallApiError } from "@/lib/recall/client";

export class UserFacingError extends Error {}

async function dispatch(bot: BotType, meeting_url: string) {
    const payload = bot_create_payload({ meeting_url, name: bot.name, local_id: bot.id, room_id: bot.room_id });
    await db.update(bots).set({ create_payload: JSON.stringify(payload) }).where(eq(bots.id, bot.id));
    try {
        const remote = await bot_create(payload);
        // Do not overwrite status if an early webhook has already advanced it.
        await db.update(bots).set({ recall_id: remote.id }).where(eq(bots.id, bot.id));
        await db.update(bots).set({ status: "joining_call" }).where(and(eq(bots.id, bot.id), eq(bots.status, "creating")));
    } catch (error) {
        // A timeout/5xx could mean Recall created the bot. Keep the reservation until a webhook
        // resolves it; blindly retrying could send a second bot. Explicit 4xx/507 responses are safe to retry.
        const rejected = error instanceof RecallApiError && (error.status < 500 || error.status === 507);
        await db.update(bots).set({ status: rejected ? "create_failed" : "creation_unknown", active: !rejected })
            .where(and(eq(bots.id, bot.id), eq(bots.status, "creating")));
        throw new UserFacingError(rejected
            ? `Recall rejected bot creation (${error.status}). Check your credentials, region, meeting URL, and available bot capacity.`
            : "Bot creation could not be confirmed. Check the Recall dashboard before trying again; a bot may still be joining.");
    }
}

export async function start_meeting(args: { meeting_url: string; bot_name: string }) {
    const id = crypto.randomUUID();
    const bot = await db.transaction(async (tx) => {
        await tx.insert(meetings).values({ id, ...args, created_at: Date.now() });
        return (await tx.insert(bots).values({ id: crypto.randomUUID(), meeting_id: id,
            name: `${args.bot_name} · Main room`, created_at: Date.now(),
        }).returning())[0];
    });
    await dispatch(bot, args.meeting_url);
}

export async function join_room(args: { meeting_id: string; room_id: string }) {
    const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, args.meeting_id) });
    const room = await db.query.rooms.findFirst({ where: eq(rooms.key, `${args.meeting_id}:${args.room_id}`) });
    const main = await db.query.bots.findFirst({ where: and(eq(bots.meeting_id, args.meeting_id), isNull(bots.room_id)) });
    if (!meeting || !room?.open || !main?.active || main.status === "leaving") {
        throw new UserFacingError("This room is no longer available. Keep the main-room bot connected and reopen the room in Zoom.");
    }
    const existing = await db.query.bots.findFirst({ where: and(eq(bots.meeting_id, args.meeting_id), eq(bots.room_id, args.room_id), eq(bots.active, true)) });
    if (existing) throw new UserFacingError("A bot is already joining or recording this room.");
    let bot: BotType;
    try {
        [bot] = await db.insert(bots).values({ id: crypto.randomUUID(), meeting_id: meeting.id, room_id: room.room_id,
            name: `${meeting.bot_name} · ${room.name}`.slice(0, 100), created_at: Date.now(),
        }).returning();
    } catch {
        throw new UserFacingError("Couldn't reserve this room. Refresh to check whether another request already sent a bot.");
    }
    await dispatch(bot, meeting.meeting_url);
}

export async function leave_bot(local_id: string) {
    const bot = await db.query.bots.findFirst({ where: eq(bots.id, local_id) });
    if (!bot?.recall_id || !bot.active) throw new UserFacingError("This bot is not connected.");
    if (bot.status === "leaving") throw new UserFacingError("This bot is already leaving. Waiting for its webhook.");
    await bot_leave({ bot_id: bot.recall_id });
    // Wait for a terminal webhook to release the room reservation.
    await db.update(bots).set({ status: "leaving" }).where(and(eq(bots.id, bot.id), eq(bots.active, true)));
}
