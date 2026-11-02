import { EnvSchema } from "@/schemas/EnvSchema";

// Imported only by server modules. Never expose these with NEXT_PUBLIC_ variables.
export const env = EnvSchema.parse(process.env);
