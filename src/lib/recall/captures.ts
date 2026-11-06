import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bots, captures } from "@/db/schema";
import { write_db } from "@/db/write";
import { merge_capture } from "@/lib/capture_state";
import { BotCapturesSchema, CaptureSchema, type CaptureType } from "@/schemas/CaptureSchema";
import type { WebhookType } from "@/schemas/WebhookSchema";
import { RecallApiError, recall_fetch } from "./client";

// Use the caller's webhook transaction; do not reacquire the local write lock here.
export async function save_capture_event(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  bot_id: string,
  webhook: WebhookType,
) {
  const recording_id = webhook.data.recording?.id;
  if (!recording_id) throw new Error("Capture event is missing its recording ID.");
  const existing = await tx.select().from(captures).where(eq(captures.id, recording_id));
  if (existing[0] && existing[0].bot_id !== bot_id) return;
  const current = existing[0] ? CaptureSchema.parse(JSON.parse(existing[0].snapshot)) : undefined;
  const incoming = {
    ...(current ?? { id: recording_id }),
    media_shortcuts: { ...current?.media_shortcuts },
  } satisfies CaptureType;
  const [kind, code] = webhook.event.split(".");
  const status = {
    code,
    sub_code: webhook.data.data.sub_code,
    updated_at: webhook.data.data.updated_at,
  };
  if (kind === "recording") incoming.status = status;
  else {
    const key = "transcript";
    const resource = webhook.data.transcript;
    if (!resource) throw new Error("Transcript event is missing its artifact ID.");
    const previous = current?.media_shortcuts?.[key];
    incoming.media_shortcuts[key] = {
      id: resource.id,
      status,
      data:
        code === "done" && previous?.id === resource.id && previous.status?.code === "done"
          ? previous.data
          : null,
    };
  }
  const snapshot = JSON.stringify(merge_capture(current, incoming));
  await tx
    .insert(captures)
    .values({ id: recording_id, bot_id, snapshot })
    .onConflictDoUpdate({ target: captures.id, set: { snapshot } });
}

/** Explicit user-triggered media lookup. The regular page refresh only reads SQLite. */
export async function refresh_captures(local_id: string) {
  const bot = await db.query.bots.findFirst({ where: eq(bots.id, local_id) });
  if (!bot?.recall_id) throw new Error("This bot has no confirmed Recall ID yet.");
  try {
    const response = BotCapturesSchema.parse(
      await recall_fetch({ path: `/api/v1/bot/${bot.recall_id}/` }),
    );
    await write_db(() =>
      db.transaction(async (tx) => {
        const previous = await tx.select().from(captures).where(eq(captures.bot_id, bot.id));
        const previous_by_id = new Map(previous.map((row) => [row.id, row]));
        const returned_ids = new Set(response.recordings.map((recording) => recording.id));
        for (const recording of response.recordings) {
          const row = previous_by_id.get(recording.id);
          const current = row ? CaptureSchema.parse(JSON.parse(row.snapshot)) : undefined;
          const snapshot = JSON.stringify(merge_capture(current, recording));
          await tx
            .insert(captures)
            .values({ id: recording.id, bot_id: bot.id, snapshot, checked_at: Date.now() })
            .onConflictDoUpdate({ target: captures.id, set: { snapshot, checked_at: Date.now() } });
        }
        // Don't keep presenting old links if Recall no longer returns the recording.
        for (const row of previous.filter((value) => !returned_ids.has(value.id))) {
          const old = CaptureSchema.parse(JSON.parse(row.snapshot));
          const snapshot = merge_capture(undefined, {
            ...old,
            status: {
              code: "unavailable",
              sub_code: "not_returned_by_recall",
              updated_at: new Date().toISOString(),
            },
          });
          await tx
            .update(captures)
            .set({ snapshot: JSON.stringify(snapshot), checked_at: Date.now() })
            .where(eq(captures.id, row.id));
        }
        await tx
          .update(bots)
          .set({ capture_error: null, capture_checked_at: Date.now() })
          .where(eq(bots.id, bot.id));
      }),
    );
  } catch (error) {
    const message =
      error instanceof RecallApiError
        ? `Recall returned ${error.status}.`
        : "Couldn't load capture details from Recall.";
    await write_db(() =>
      db.update(bots).set({ capture_error: message }).where(eq(bots.id, bot.id)),
    );
    throw new Error(message);
  }
}
