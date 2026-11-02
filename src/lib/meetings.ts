import { and, asc, eq, isNull } from "drizzle-orm";
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
        await db.update(bots).set({ status: rejected ? "create_failed" : "creation_unknown", active: !rejected,
            sub_code: rejected ? `recall_http_${error.status}` : "create_response_unconfirmed" })
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

/** Reserve every selected room before dispatch. The partial unique index is the final duplicate guard. */
export async function queue_room_bots(args: { meeting_id: string; room_ids: string[] }) {
    return db.transaction(async (tx) => {
        const meeting = await tx.query.meetings.findFirst({ where: eq(meetings.id, args.meeting_id) });
        const main = await tx.query.bots.findFirst({ where: and(eq(bots.meeting_id, args.meeting_id), isNull(bots.room_id)) });
        if (!meeting || !main?.active || main.status === "leaving") {
            throw new UserFacingError("Keep the main-room bot connected before dispatching room bots.");
        }
        let queued = 0;
        let skipped = 0;
        for (const room_id of new Set(args.room_ids)) {
            const room = await tx.query.rooms.findFirst({ where: eq(rooms.key, `${meeting.id}:${room_id}`) });
            if (!room?.open) throw new UserFacingError("This room is no longer available. Refresh the room list.");
            const inserted = await tx.insert(bots).values({
                id: crypto.randomUUID(), meeting_id: meeting.id, room_id,
                name: `${meeting.bot_name} · ${room.name}`.slice(0, 100),
                status: "queued", created_at: Date.now(),
            }).onConflictDoNothing().returning();
            if (inserted.length) queued++;
            else skipped++;
        }
        return { queued, skipped };
    });
}

const dispatch_state = globalThis as unknown as { dispatch_job?: Promise<void>; dispatch_again?: boolean };

/** Two concurrent Create Bot requests, in one local Next.js process. No queue service is needed. */
export async function process_dispatch_queue(): Promise<void> {
    dispatch_state.dispatch_again = true;
    if (dispatch_state.dispatch_job) return dispatch_state.dispatch_job;
    dispatch_state.dispatch_job = (async () => {
        do {
            dispatch_state.dispatch_again = false;
            for (;;) {
                const pending = await db.select().from(bots).where(eq(bots.status, "queued")).orderBy(asc(bots.created_at)).limit(2);
                if (!pending.length) break;
                const ready: { bot: BotType; meeting_url: string }[] = [];
                // Serialize SQLite claims; only the remote requests need concurrency.
                for (const bot of pending) {
                    // Conditional claim prevents two drainers from sending the same reservation.
                    const claimed = await db.update(bots).set({ status: "creating" })
                        .where(and(eq(bots.id, bot.id), eq(bots.status, "queued"))).returning();
                    if (!claimed.length) continue;
                    const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, bot.meeting_id) });
                    const room = await db.query.rooms.findFirst({ where: eq(rooms.key, `${bot.meeting_id}:${bot.room_id}`) });
                    const main = await db.query.bots.findFirst({ where: and(eq(bots.meeting_id, bot.meeting_id), isNull(bots.room_id)) });
                    if (!meeting || !room?.open || !main?.active || main.status === "leaving") {
                        await db.update(bots).set({ status: "cancelled", active: false, sub_code: "room_unavailable" }).where(eq(bots.id, bot.id));
                        continue;
                    }
                    ready.push({ bot, meeting_url: meeting.meeting_url });
                }
                await Promise.all(ready.map(async ({ bot, meeting_url }) => {
                    try { await dispatch(bot, meeting_url); }
                    catch (error) {
                        // One rejected room must not abort the remaining batch. dispatch saved its result.
                        console.warn(error instanceof Error ? error.message : "Room dispatch failed");
                    }
                }));
            }
        } while (dispatch_state.dispatch_again);
    })().finally(() => { dispatch_state.dispatch_job = undefined; });
    return dispatch_state.dispatch_job;
}

/** Awaited convenience for scripts/tests; the UI acknowledges reservations before draining. */
export async function join_room(args: { meeting_id: string; room_id: string }) {
    const result = await queue_room_bots({ meeting_id: args.meeting_id, room_ids: [args.room_id] });
    if (!result.queued) throw new UserFacingError("A bot is already joining or recording this room.");
    await process_dispatch_queue();
}

export async function leave_bot(local_id: string) {
    const bot = await db.query.bots.findFirst({ where: eq(bots.id, local_id) });
    if (!bot?.recall_id || !bot.active) throw new UserFacingError("This bot is not connected.");
    if (bot.status === "leaving") throw new UserFacingError("This bot is already leaving. Waiting for its webhook.");
    await bot_leave({ bot_id: bot.recall_id });
    // Wait for a terminal webhook to release the room reservation.
    await db.update(bots).set({ status: "leaving" }).where(and(eq(bots.id, bot.id), eq(bots.active, true)));
}
