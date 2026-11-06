// Keep lifecycle and room-location clocks separate: entering a room is not a recording status.
export const lifecycle_events = new Set([
  "bot.joining_call",
  "bot.in_waiting_room",
  "bot.in_call_not_recording",
  "bot.recording_permission_allowed",
  "bot.recording_permission_denied",
  "bot.in_call_recording",
  "bot.call_ended",
  "bot.done",
  "bot.fatal",
]);
export const room_events = new Set(["bot.breakout_room_opened", "bot.breakout_room_closed"]);
export const location_events = new Set(["bot.breakout_room_entered", "bot.breakout_room_left"]);
export const terminal_statuses = new Set(["call_ended", "done", "fatal"]);

export function can_apply_status(
  current: { status_at: number; active: boolean },
  timestamp: number,
  status: string,
) {
  return timestamp >= current.status_at && (current.active || terminal_statuses.has(status));
}

export const capture_events = new Set([
  "recording.processing",
  "recording.done",
  "recording.failed",
  "recording.deleted",
  "transcript.processing",
  "transcript.done",
  "transcript.failed",
  "transcript.deleted",
]);

/** Shared eligibility rules used by the server and controls. */
export function can_dispatch_rooms(
  meeting: { main_mode: string; stopped_at: number | null },
  main: { active: boolean; stop_requested: boolean } | undefined,
): boolean {
  return (
    meeting.main_mode === "join_main_room" &&
    !meeting.stopped_at &&
    !!main?.active &&
    !main.stop_requested
  );
}

export function can_leave_bot(bot: {
  active: boolean;
  recall_id: string | null;
  stop_requested: boolean;
  stop_error: string | null;
}): boolean {
  return bot.active && !!bot.recall_id && (!bot.stop_requested || !!bot.stop_error);
}

export function is_supported_event(event: string): boolean {
  return [lifecycle_events, room_events, location_events, capture_events].some((events) =>
    events.has(event),
  );
}
