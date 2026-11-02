import { z } from "zod";

export const MeetingSchema = z.object({
    meeting_url: z.string().trim().url().refine((value) => {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password
            && /(^|\.)zoom\.(us|com)$/.test(url.hostname)
            && /^\/(j|my)\//.test(url.pathname);
    }, "Enter a Zoom meeting join link (https://…zoom.us/j/… or /my/…)."),
    bot_name: z.string().trim().min(1, "Enter a bot name.").max(75),
});
