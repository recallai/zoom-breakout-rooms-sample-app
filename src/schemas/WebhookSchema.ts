import { z } from "zod";

const timestamp = z.string().datetime({ offset: true });
export const WebhookSchema = z.object({
    event: z.string(),
    data: z.object({
        bot: z.object({ id: z.string().uuid(), metadata: z.record(z.string(), z.unknown()).optional() }),
        data: z.object({
            updated_at: timestamp,
            code: z.string().optional(),
            sub_code: z.string().nullish(),
            breakout_room: z.object({ id: z.string().uuid(), name: z.string() }).optional(),
        }),
    }),
}).superRefine((value, ctx) => {
    if (value.event.startsWith("bot.breakout_room_") && !value.data.data.breakout_room) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Missing breakout room" });
    }
});
export type WebhookType = z.infer<typeof WebhookSchema>;
