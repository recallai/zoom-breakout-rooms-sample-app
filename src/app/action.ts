"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MeetingSchema } from "@/schemas/MeetingSchema";
import { start_meeting, join_room, leave_bot, UserFacingError } from "@/lib/meetings";

export type ActionResult = { error?: string };

async function run_action(fn: () => Promise<void>): Promise<ActionResult> {
    try {
        await fn();
        return {};
    } catch (error) {
        if (error instanceof UserFacingError) return { error: error.message };
        console.error("Breakout room action failed:", error instanceof Error ? error.message : "Unknown error");
        return { error: "Couldn't complete this request. Check the server logs and try again." };
    } finally {
        revalidatePath("/");
    }
}

export async function start_meeting_action(values: { meeting_url: string; bot_name: string }): Promise<ActionResult> {
    const input = MeetingSchema.safeParse(values);
    if (!input.success) return { error: input.error.issues[0].message };
    return run_action(() => start_meeting(input.data));
}

export async function join_room_action(meeting_id: string, room_id: string): Promise<ActionResult> {
    const input = z.object({ meeting_id: z.string().uuid(), room_id: z.string().uuid() }).safeParse({ meeting_id, room_id });
    if (!input.success) return { error: "Invalid meeting or room ID." };
    return run_action(() => join_room(input.data));
}

export async function leave_bot_action(local_id: string): Promise<ActionResult> {
    if (!z.string().uuid().safeParse(local_id).success) return { error: "Invalid bot ID." };
    return run_action(() => leave_bot(local_id));
}
