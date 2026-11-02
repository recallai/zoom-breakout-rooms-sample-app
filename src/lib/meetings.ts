import { and, asc, eq, isNull, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import { write_db } from "@/db/write";
import { bots, meetings, rooms, type BotType } from "@/db/schema";
import { bot_create, bot_create_payload, bot_leave } from "@/lib/recall/bot";
import { RecallApiError } from "@/lib/recall/client";

export class UserFacingError extends Error {}

async function dispatch(bot: BotType, meeting_url: string) {
    const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, bot.meeting_id) });
    if (meeting?.stopped_at) {
        await write_db(() => db.update(bots).set({ status: "cancelled", active: false, sub_code: "session_stopped" }).where(eq(bots.id, bot.id)));
        return;
    }
    const payload = bot_create_payload({ meeting_url, name: bot.name, local_id: bot.id, room_id: bot.room_id, transcribe: meeting?.transcribe ?? false });
    await write_db(() => db.update(bots).set({ create_payload: JSON.stringify(payload) }).where(eq(bots.id, bot.id)));
    try {
        const remote = await bot_create(payload);
        // Do not overwrite status if an early webhook has already advanced it.
        await write_db(() => db.update(bots).set({ recall_id: remote.id }).where(eq(bots.id, bot.id)));
        await write_db(() => db.update(bots).set({ status: "joining_call" }).where(and(eq(bots.id, bot.id), eq(bots.status, "creating"))));
    } catch (error) {
        // A timeout/5xx could mean Recall created the bot. Keep the reservation until a webhook
        // resolves it; blindly retrying could send a second bot. Explicit 4xx/507 responses are safe to retry.
        const rejected = error instanceof RecallApiError && (error.status < 500 || error.status === 507);
        await write_db(() => db.update(bots).set({ status: rejected ? "create_failed" : "creation_unknown", active: !rejected,
            sub_code: rejected ? `recall_http_${error.status}` : "create_response_unconfirmed" })
            .where(and(eq(bots.id, bot.id), eq(bots.status, "creating"))));
        throw new UserFacingError(rejected
            ? `Recall rejected bot creation (${error.status}). Check your credentials, region, meeting URL, and available bot capacity.`
            : "Bot creation could not be confirmed. Check the Recall dashboard before trying again; a bot may still be joining.");
    }
    await cleanup_stopped_session(bot.meeting_id);
}

export async function start_meeting(args: { meeting_url: string; bot_name: string; transcribe?: boolean }) {
    const id = crypto.randomUUID();
    const bot = await write_db(() => db.transaction(async (tx) => {
        await tx.insert(meetings).values({ id, ...args, created_at: Date.now() });
        return (await tx.insert(bots).values({ id: crypto.randomUUID(), meeting_id: id,
            name: `${args.bot_name} · Main room`, created_at: Date.now(),
        }).returning())[0];
    }));
    await dispatch(bot, args.meeting_url);
}

/** Reserve every selected room before dispatch. The partial unique index is the final duplicate guard. */
export async function queue_room_bots(args: { meeting_id: string; room_ids: string[] }) {
    return write_db(() => db.transaction(async (tx) => {
        const meeting = await tx.query.meetings.findFirst({ where: eq(meetings.id, args.meeting_id) });
        const main = await tx.query.bots.findFirst({ where: and(eq(bots.meeting_id, args.meeting_id), isNull(bots.room_id)) });
        if (!meeting || meeting.stopped_at || !main?.active || main.stop_requested) {
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
    }));
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
                    const claimed = await write_db(() => db.update(bots).set({ status: "creating" })
                        .where(and(eq(bots.id, bot.id), eq(bots.status, "queued"))).returning());
                    if (!claimed.length) continue;
                    const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, bot.meeting_id) });
                    const room = await db.query.rooms.findFirst({ where: eq(rooms.key, `${bot.meeting_id}:${bot.room_id}`) });
                    const main = await db.query.bots.findFirst({ where: and(eq(bots.meeting_id, bot.meeting_id), isNull(bots.room_id)) });
                    if (!meeting || meeting.stopped_at || !room?.open || !main?.active || main.stop_requested) {
                        await write_db(() => db.update(bots).set({ status: "cancelled", active: false, sub_code: "room_unavailable" }).where(eq(bots.id, bot.id)));
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

/** Claim the leave request before the API call; terminal webhooks, not this response, mark completion. */
export async function leave_bot(local_id: string) {
    const [bot] = await write_db(() => db.update(bots).set({ stop_requested: true, stop_error: null, status: "leaving" })
        .where(and(eq(bots.id, local_id), eq(bots.active, true), isNotNull(bots.recall_id),
            or(eq(bots.stop_requested, false), isNotNull(bots.stop_error)))).returning());
    if (!bot) return; // Already finished, leaving, or still waiting for a creation response.
    try {
        await bot_leave({ bot_id: bot.recall_id! });
    } catch (error) {
        const message = error instanceof RecallApiError ? `Recall returned ${error.status}` : "Leave response not confirmed";
        await write_db(() => db.update(bots).set({ status: "stop_failed", stop_error: message }).where(and(eq(bots.id, bot.id), eq(bots.active, true))));
        throw new UserFacingError(`${message}. Retry stopping this bot or check its Recall dashboard.`);
    }
}

/** Stop is durable before any remote work, so queued and in-flight dispatches can see it. */
export async function stop_session(meeting_id: string) {
    await write_db(() => db.transaction(async (tx) => {
        const meeting = await tx.query.meetings.findFirst({ where: eq(meetings.id, meeting_id) });
        if (!meeting) throw new UserFacingError("Meeting session not found.");
        await tx.update(meetings).set({ stopped_at: meeting.stopped_at ?? Date.now() }).where(eq(meetings.id, meeting_id));
        await tx.update(bots).set({ status: "cancelled", active: false, sub_code: "session_stopped" })
            .where(and(eq(bots.meeting_id, meeting_id), eq(bots.status, "queued")));
        await tx.update(rooms).set({ open: false }).where(eq(rooms.meeting_id, meeting_id));
    }));
}

type CleanupJob = { again: boolean; promise: Promise<void> };
const cleanup_state = globalThis as unknown as { cleanup_jobs?: Map<string, CleanupJob> };
const cleanup_jobs = cleanup_state.cleanup_jobs ??= new Map();

/** Called after Stop, after creation returns, and after a webhook identifies a late-created bot. */
export async function cleanup_stopped_session(meeting_id: string): Promise<void> {
    const existing = cleanup_jobs.get(meeting_id);
    if (existing) { existing.again = true; return existing.promise; }
    const job: CleanupJob = { again: false, promise: Promise.resolve() };
    cleanup_jobs.set(meeting_id, job);
    job.promise = (async () => {
        do {
            job.again = false;
            const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, meeting_id) });
            if (!meeting?.stopped_at) return;
            const remaining = await db.select().from(bots).where(and(eq(bots.meeting_id, meeting_id), eq(bots.active, true)));
            for (const bot of remaining) {
                if (!bot.recall_id || (bot.stop_requested && !bot.stop_error)) continue;
                try { await leave_bot(bot.id); }
                catch { /* Saved per bot; other room bots still need their leave requests. */ }
            }
        } while (job.again);
    })().finally(() => { cleanup_jobs.delete(meeting_id); });
    return job.promise;
}
