import { z } from "zod";
import { recall_fetch } from "./client";

export async function bot_create(args: { meeting_url: string; name: string; local_id: string; room_id: string | null }) {
    return z.object({ id: z.string().uuid() }).parse(await recall_fetch({
        path: "/api/v1/bot/",
        method: "POST",
        body: {
            meeting_url: args.meeting_url,
            bot_name: args.name,
            breakout_room: args.room_id
                ? { mode: "join_specific_room", room_id: args.room_id }
                : { mode: "join_main_room" },
            metadata: { sample_app: "zoom-breakout-rooms", local_bot_id: args.local_id },
        },
    }));
}

export async function bot_leave(args: { bot_id: string }) {
    await recall_fetch({ path: `/api/v1/bot/${args.bot_id}/leave_call/`, method: "POST" });
}
