import { z } from "zod";

export const MainRoomModeSchema = z.enum(["join_main_room", "auto_accept_all_invites"]);
export type MainRoomMode = z.infer<typeof MainRoomModeSchema>;

export const MeetingSchema = z.object({
  main_mode: MainRoomModeSchema.default("join_main_room"),
  transcribe: z.boolean().default(false),
  meeting_url: z
    .string()
    .trim()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        /(^|\.)zoom\.(us|com)$/.test(url.hostname) &&
        /^\/(j|my)\//.test(url.pathname)
      );
    }, "Enter a Zoom meeting join link (https://…zoom.us/j/… or /my/…)."),
  bot_name: z.string().trim().min(1, "Enter a bot name.").max(75),
});
