"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { refresh_captures } from "@/lib/recall/captures";
import { MeetingSchema, type MainRoomMode } from "@/schemas/MeetingSchema";
import { start_meeting, queue_room_bots, process_dispatch_queue, leave_bot, stop_session, cleanup_stopped_session, UserFacingError } from "@/lib/meetings";

export type ActionResult = { error?: string; meeting_id?: string };

async function run_action(fn: () => Promise<void>): Promise<ActionResult> {
    try {
        await fn();
        return {};
    } catch (error) {
        if (error instanceof UserFacingError) return { error: error.message, meeting_id: error.meeting_id };
        console.error("Breakout room action failed:", error instanceof Error ? error.message : "Unknown error");
        return { error: "Couldn't complete this request. Check the server logs and try again." };
    } finally {
        revalidatePath("/", "layout");
    }
}

export async function start_meeting_action(values: { meeting_url: string; bot_name: string; transcribe?: boolean; main_mode?: MainRoomMode }): Promise<ActionResult> {
    const input = MeetingSchema.safeParse(values);
    if (!input.success) return { error: input.error.issues[0].message };
    let meeting_id: string | undefined;
    const result = await run_action(async () => { meeting_id = await start_meeting(input.data); });
    return { ...result, meeting_id: meeting_id ?? result.meeting_id };
}

export async function queue_rooms_action(meeting_id: string, room_ids: string[]): Promise<ActionResult & { queued?: number; skipped?: number }> {
    const input = z.object({ meeting_id: z.string().uuid(), room_ids: z.array(z.string().uuid()).min(1).max(100) }).safeParse({ meeting_id, room_ids });
    if (!input.success) return { error: "Select between 1 and 100 valid rooms." };
    try {
        const result = await queue_room_bots(input.data);
        after(async () => {
            try { await process_dispatch_queue(); }
            catch (error) { console.error("Dispatch queue interrupted:", error instanceof Error ? error.message : "Unknown error"); }
            revalidatePath("/", "layout");
        });
        revalidatePath("/", "layout");
        return result;
    } catch (error) {
        return { error: error instanceof UserFacingError ? error.message : "Couldn't queue these rooms. Refresh and try again." };
    }
}

export async function resume_dispatch_action(): Promise<ActionResult> {
    after(async () => {
        try { await process_dispatch_queue(); }
        catch { console.error("Couldn't resume dispatch queue"); }
        revalidatePath("/", "layout");
    });
    return {};
}

export async function join_room_action(meeting_id: string, room_id: string): Promise<ActionResult> {
    const result = await queue_rooms_action(meeting_id, [room_id]);
    if (result.skipped && !result.queued) return { error: "A bot is already joining or recording this room." };
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
        after(async () => {
            try { await cleanup_stopped_session(meeting_id); }
            catch { console.error("Session cleanup interrupted; retry Stop all session bots."); }
            revalidatePath("/", "layout");
        });
    });
}

export async function refresh_captures_action(local_id: string): Promise<ActionResult> {
    if (!z.string().uuid().safeParse(local_id).success) return { error: "Invalid bot ID." };
    return run_action(() => refresh_captures(local_id));
}
