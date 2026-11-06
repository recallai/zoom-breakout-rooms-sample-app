import { z } from "zod";

const StatusSchema = z.object({
  code: z.string(),
  sub_code: z.string().nullish(),
  updated_at: z.string().datetime({ offset: true }),
});
const ArtifactSchema = z.object({
  id: z.string().uuid(),
  status: StatusSchema.nullish(),
  format: z.string().optional(),
  data: z
    .object({
      download_url: z
        .string()
        .url()
        .refine((url) => new URL(url).protocol === "https:")
        .nullish(),
    })
    .nullish(),
});

/** Fields used from the v1.11 Bot.recordings embeds; no lifecycle polling is needed. */
export const CaptureSchema = z.object({
  id: z.string().uuid(),
  status: StatusSchema.nullish(),
  expires_at: z.string().nullish(),
  media_shortcuts: z
    .object({
      video_mixed: ArtifactSchema.nullish(),
      audio_mixed: ArtifactSchema.nullish(),
      transcript: ArtifactSchema.nullish(),
    })
    .nullish(),
});
export const BotCapturesSchema = z.object({ recordings: z.array(CaptureSchema) });
export type CaptureType = z.infer<typeof CaptureSchema>;
export type ArtifactType = z.infer<typeof ArtifactSchema>;
