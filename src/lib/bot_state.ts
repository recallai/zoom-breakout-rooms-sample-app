// Keep lifecycle and room-location clocks separate: entering a room is not a recording status.
export const lifecycle_events = new Set([
    "bot.joining_call", "bot.in_waiting_room", "bot.in_call_not_recording",
    "bot.recording_permission_allowed", "bot.recording_permission_denied",
    "bot.in_call_recording", "bot.call_ended", "bot.done", "bot.fatal",
]);
export const room_events = new Set(["bot.breakout_room_opened", "bot.breakout_room_closed"]);
export const location_events = new Set(["bot.breakout_room_entered", "bot.breakout_room_left"]);
export const terminal_statuses = new Set(["call_ended", "done", "fatal"]);

export function can_apply_status(current: { status_at: number; active: boolean }, timestamp: number, status: string) {
    return timestamp >= current.status_at && (current.active || terminal_statuses.has(status));
}
