import type { BotType, EventType, RoomType } from "@/db/schema";

const labels: Record<string, string> = {
    "bot.joining_call": "Joining meeting",
    "bot.in_waiting_room": "Waiting for admission",
    "bot.in_call_not_recording": "Admitted / in meeting, not recording",
    "bot.in_call_recording": "Recording started or resumed",
    "bot.recording_permission_allowed": "Recording permission allowed",
    "bot.recording_permission_denied": "Recording permission denied",
    "bot.breakout_room_entered": "Room entry confirmed",
    "bot.breakout_room_left": "Left breakout room",
    "bot.breakout_room_opened": "Room discovered open",
    "bot.breakout_room_closed": "Room closed",
    "bot.call_ended": "Bot left the call",
    "bot.fatal": "Bot failed",
    "bot.done": "Bot finished",
};

export function build_room_timeline(room: RoomType, bots: BotType[], events: EventType[]) {
    const bot_ids = new Set(bots.map((bot) => bot.id));
    const entries = bots.map((bot) => ({
        id: `dispatch:${bot.id}`, at: bot.created_at, label: "Dispatch requested", bot: bot.name, detail: null as string | null,
    }));
    for (const event of events) {
        const is_room_event = event.event === "bot.breakout_room_opened" || event.event === "bot.breakout_room_closed";
        // Scope observer events by the Recall room ID, not its potentially duplicate display name.
        const payload = event.payload ? JSON.parse(event.payload) : null;
        const observer_match = event.meeting_id === room.meeting_id && is_room_event
            && (payload?.data?.data?.breakout_room?.id === room.room_id || event.id === room.source_event_id);
        if (!bot_ids.has(event.bot_id) && !observer_match) continue;
        entries.push({ id: event.id, at: event.happened_at, label: labels[event.event] ?? event.event,
            bot: bots.find((bot) => bot.id === event.bot_id)?.name ?? "Main-room observer", detail: event.detail,
        });
    }
    return entries.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
