"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import {
  cleanup_stopped_session,
  leave_bot,
  process_dispatch_queue,
  queue_room_bots,
  start_meeting,
  stop_session,
  UserFacingError,
} from "@/lib/meetings";
import { refresh_captures } from "@/lib/recall/captures";
import { type MainRoomMode, MeetingSchema } from "@/schemas/MeetingSchema";

export type ActionResult = { error?: string; meeting_id?: string };

async function run_action(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return {};
  } catch (error) {
    if (error instanceof UserFacingError)
      return { error: error.message, meeting_id: error.meeting_id };
    console.error(
      "Breakout room action failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return { error: "Couldn't complete this request. Check the server logs and try again." };
  } finally {
    revalidatePath("/", "layout");
  }
}

function schedule_action(task: () => Promise<void>, failure_message: string) {
  after(async () => {
    try {
      await task();
    } catch (error) {
      console.error(failure_message, error instanceof Error ? error.message : "Unknown error");
    } finally {
      revalidatePath("/", "layout");
    }
  });
}

export async function start_meeting_action(values: {
  meeting_url: string;
  bot_name: string;
  transcribe?: boolean;
  main_mode?: MainRoomMode;
}): Promise<ActionResult> {
  const input = MeetingSchema.safeParse(values);
  if (!input.success) return { error: input.error.issues[0].message };
  let meeting_id: string | undefined;
  const result = await run_action(async () => {
    meeting_id = await start_meeting(input.data);
  });
  return { ...result, meeting_id: meeting_id ?? result.meeting_id };
}

export async function queue_rooms_action(
  meeting_id: string,
  room_ids: string[],
): Promise<ActionResult & { queued?: number; skipped?: number }> {
  const input = z
    .object({ meeting_id: z.string().uuid(), room_ids: z.array(z.string().uuid()).min(1).max(100) })
    .safeParse({ meeting_id, room_ids });
  if (!input.success) return { error: "Select between 1 and 100 valid rooms." };
  try {
    const result = await queue_room_bots(input.data);
    schedule_action(process_dispatch_queue, "Dispatch queue interrupted:");
    revalidatePath("/", "layout");
    return result;
  } catch (error) {
    return {
      error:
        error instanceof UserFacingError
          ? error.message
          : "Couldn't queue these rooms. Refresh and try again.",
    };
  }
}

export async function resume_dispatch_action(): Promise<ActionResult> {
  schedule_action(process_dispatch_queue, "Couldn't resume dispatch queue:");
  return {};
}

export async function join_room_action(meeting_id: string, room_id: string): Promise<ActionResult> {
  const result = await queue_rooms_action(meeting_id, [room_id]);
  if (result.skipped && !result.queued)
    return { error: "A bot is already joining or recording this room." };
  return result;
}

export async function leave_bot_action(local_id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(local_id).success) return { error: "Invalid bot ID." };
  return run_action(() => leave_bot(local_id));
}

export async function stop_session_action(meeting_id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(meeting_id).success) return { error: "Invalid meeting ID." };
  return run_action(async () => {
    await stop_session(meeting_id);
    schedule_action(
      () => cleanup_stopped_session(meeting_id),
      "Session cleanup interrupted; retry Stop all session bots.",
    );
  });
}

export async function refresh_captures_action(local_id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(local_id).success) return { error: "Invalid bot ID." };
  return run_action(() => refresh_captures(local_id));
}
