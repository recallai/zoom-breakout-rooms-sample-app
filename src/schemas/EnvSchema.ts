import { z } from "zod";

export const EnvSchema = z.object({
  RECALL_API_KEY: z.string().min(1),
  RECALL_REGION: z.enum(["us-east-1", "us-west-2", "eu-central-1", "ap-northeast-1"]),
  RECALL_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
});
