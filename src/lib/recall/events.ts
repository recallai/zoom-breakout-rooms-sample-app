import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { save_capture_event } from "@/lib/recall/captures";
import { write_db } from "@/db/write";
import { bots, events, rooms, meetings } from "@/db/schema";
import type { WebhookType } from "@/schemas/WebhookSchema";
import { can_apply_status, lifecycle_events, room_events, location_events, capture_events, terminal_statuses } from "@/lib/bot_state";

/** Persist synchronously before acknowledging. A failed transaction returns 500 so Recall retries. */
export async function handle_webhook(delivery_id: string, webhook: WebhookType) {
    if (![lifecycle_events, room_events, location_events, capture_events].some((set) => set.has(webhook.event))) return;
    return write_db(() => db.transaction(async (tx) => {
        const { bot: remote, data } = webhook.data;
        let bot = await tx.query.bots.findFirst({ where: eq(bots.recall_id, remote.id) });
        // A webhook can arrive before Create Bot returns. The local reservation already exists.
        if (!bot && remote.metadata?.sample_app === "zoom-breakout-rooms" && typeof remote.metadata.local_bot_id === "string") {
            bot = await tx.query.bots.findFirst({ where: eq(bots.id, remote.metadata.local_bot_id) });
            if (bot?.recall_id && bot.recall_id !== remote.id) return;
        }
        if (!bot) return; // Ignore other sample apps' bots in the same workspace.
        const meeting = await tx.query.meetings.findFirst({ where: eq(meetings.id, bot.meeting_id) });
        const inserted = await tx.insert(events).values({
            id: delivery_id, meeting_id: bot.meeting_id, bot_id: bot.id, event: webhook.event,
            detail: data.breakout_room?.name ?? data.sub_code ?? null,
            payload: JSON.stringify(webhook),
            happened_at: Date.parse(data.updated_at), received_at: Date.now(),
        }).onConflictDoNothing().returning();
        if (!inserted.length) return bot.meeting_id;
        await tx.update(bots).set({ recall_id: remote.id }).where(eq(bots.id, bot.id));
        const at = Date.parse(data.updated_at);
        if (capture_events.has(webhook.event)) {
            await save_capture_event(tx, bot.id, webhook);
        } else if (room_events.has(webhook.event) && bot.room_id === null && data.breakout_room) {
            const room = data.breakout_room;
            const key = `${bot.meeting_id}:${room.id}`;
            const existing = await tx.query.rooms.findFirst({ where: eq(rooms.key, key) });
            if (!existing || at >= existing.updated_at) {
                await tx.insert(rooms).values({ key, meeting_id: bot.meeting_id, room_id: room.id,
                    name: room.name, open: webhook.event === "bot.breakout_room_opened" && !meeting?.stopped_at, updated_at: at,
                    source_event_id: webhook.event === "bot.breakout_room_opened" ? delivery_id : null,
                }).onConflictDoUpdate({ target: rooms.key, set: {
                    name: room.name, open: webhook.event === "bot.breakout_room_opened" && !meeting?.stopped_at, updated_at: at,
                    ...(webhook.event === "bot.breakout_room_opened" ? { source_event_id: delivery_id } : {}),
                } });
            }
        } else if (location_events.has(webhook.event) && bot.active && data.breakout_room && at >= bot.location_at) {
            await tx.update(bots).set({
                location_id: webhook.event === "bot.breakout_room_entered" ? data.breakout_room.id : null,
                location: webhook.event === "bot.breakout_room_entered" ? data.breakout_room.name : null,
                location_at: at,
            }).where(eq(bots.id, bot.id));
        } else if (lifecycle_events.has(webhook.event)) {
            const status = webhook.event.slice(4);
            if (can_apply_status(bot, at, status)) {
                await tx.update(bots).set({ status, sub_code: data.sub_code ?? (status === "done" ? bot.sub_code : null), status_at: at,
                    active: !terminal_statuses.has(status),
                    ...(terminal_statuses.has(status) ? { stop_error: null } : {}),
                    ...(terminal_statuses.has(status) ? { location: null, location_id: null, location_at: Math.max(at, bot.location_at) } : {}),
                }).where(eq(bots.id, bot.id));
                if (bot.room_id === null && terminal_statuses.has(status)) {
                    // Once the observer has left, its old room list is no longer authoritative.
                    await tx.update(rooms).set({ open: false, updated_at: at })
                        .where(and(eq(rooms.meeting_id, bot.meeting_id), lte(rooms.updated_at, at)));
                }
            }
        }
        return bot.meeting_id;
    }));
}
