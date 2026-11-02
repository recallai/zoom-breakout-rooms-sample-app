import { eq } from "drizzle-orm";
import { db } from "@/db";
import { write_db } from "@/db/write";
import { bots, captures } from "@/db/schema";
import { BotCapturesSchema, CaptureSchema, type CaptureType, type ArtifactType } from "@/schemas/CaptureSchema";
import type { WebhookType } from "@/schemas/WebhookSchema";
import { recall_fetch, RecallApiError } from "./client";

const media_kinds = ["video_mixed", "audio_mixed", "transcript"] as const;
function at(status: { updated_at: string } | null | undefined) { return status ? Date.parse(status.updated_at) : 0; }

/** An API read can race a newer webhook. Preserve the newer status per resource. */
export function merge_capture(current: CaptureType | undefined, incoming: CaptureType): CaptureType {
    current ??= { id: incoming.id };
    const merged = { ...incoming, media_shortcuts: { ...incoming.media_shortcuts } };
    if (at(current.status) > at(incoming.status)) merged.status = current.status;
    for (const kind of media_kinds) {
        const previous = current.media_shortcuts?.[kind];
        const next = incoming.media_shortcuts?.[kind];
        if (previous && at(previous.status) > at(next?.status)) merged.media_shortcuts[kind] = previous;
    }
    if (merged.status?.code === "deleted" || merged.status?.code === "unavailable") {
        for (const kind of media_kinds) {
            const artifact = merged.media_shortcuts[kind];
            if (artifact) merged.media_shortcuts[kind] = { ...artifact, data: null };
        }
    }
    return merged;
}

// Use the caller's webhook transaction; do not reacquire the local write lock here.
export async function save_capture_event(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], bot_id: string, webhook: WebhookType) {
    const recording_id = webhook.data.recording!.id;
    const existing = await tx.select().from(captures).where(eq(captures.id, recording_id));
    if (existing[0] && existing[0].bot_id !== bot_id) return;
    const current = existing[0] ? CaptureSchema.parse(JSON.parse(existing[0].snapshot)) : undefined;
    const incoming: CaptureType = { ...(current ?? { id: recording_id }), media_shortcuts: { ...current?.media_shortcuts } };
    const [kind, code] = webhook.event.split(".");
    const status = { code, sub_code: webhook.data.data.sub_code, updated_at: webhook.data.data.updated_at };
    if (kind === "recording") incoming.status = status;
    else {
        const key = "transcript";
        const resource = webhook.data.transcript!;
        const previous = current?.media_shortcuts?.[key];
        incoming.media_shortcuts![key] = { id: resource.id, status,
            data: code === "done" && previous?.id === resource.id && previous.status?.code === "done" ? previous.data : null,
        };
    }
    const snapshot = JSON.stringify(merge_capture(current, incoming));
    await tx.insert(captures).values({ id: recording_id, bot_id, snapshot }).onConflictDoUpdate({ target: captures.id, set: { snapshot } });
}

/** Explicit user-triggered media lookup. The regular page refresh only reads SQLite. */
export async function refresh_captures(local_id: string) {
    const bot = await db.query.bots.findFirst({ where: eq(bots.id, local_id) });
    if (!bot?.recall_id) throw new Error("This bot has no confirmed Recall ID yet.");
    try {
        const response = BotCapturesSchema.parse(await recall_fetch({ path: `/api/v1/bot/${bot.recall_id}/` }));
        await write_db(() => db.transaction(async (tx) => {
            const previous = await tx.select().from(captures).where(eq(captures.bot_id, bot.id));
            for (const recording of response.recordings) {
                const row = previous.find((value) => value.id === recording.id);
                const current = row ? CaptureSchema.parse(JSON.parse(row.snapshot)) : undefined;
                const snapshot = JSON.stringify(merge_capture(current, recording));
                await tx.insert(captures).values({ id: recording.id, bot_id: bot.id, snapshot, checked_at: Date.now() })
                    .onConflictDoUpdate({ target: captures.id, set: { snapshot, checked_at: Date.now() } });
            }
            // Don't keep presenting old links if Recall no longer returns the recording.
            for (const row of previous.filter((value) => !response.recordings.some((recording) => recording.id === value.id))) {
                const old = CaptureSchema.parse(JSON.parse(row.snapshot));
                const snapshot = merge_capture(undefined, { ...old, status: { code: "unavailable", sub_code: "not_returned_by_recall", updated_at: new Date().toISOString() } });
                await tx.update(captures).set({ snapshot: JSON.stringify(snapshot), checked_at: Date.now() }).where(eq(captures.id, row.id));
            }
            await tx.update(bots).set({ capture_error: null, capture_checked_at: Date.now() }).where(eq(bots.id, bot.id));
        }));
    } catch (error) {
        const message = error instanceof RecallApiError ? `Recall returned ${error.status}.` : "Couldn't load capture details from Recall.";
        await write_db(() => db.update(bots).set({ capture_error: message }).where(eq(bots.id, bot.id)));
        throw new Error(message);
    }
}

export function capture_download_url(recording: CaptureType, artifact: ArtifactType | null | undefined, now = Date.now()): string | null {
    const expired = !!recording.expires_at && Date.parse(recording.expires_at) <= now;
    if (expired || ["deleted", "unavailable"].includes(recording.status?.code ?? "") || artifact?.status?.code !== "done") return null;
    return artifact.data?.download_url ?? null;
}
