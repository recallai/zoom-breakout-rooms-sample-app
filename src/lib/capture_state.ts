import type { ArtifactType, CaptureType } from "@/schemas/CaptureSchema";

const media_kinds = ["video_mixed", "audio_mixed", "transcript"] as const;
function at(status: { updated_at: string } | null | undefined) {
  return status ? Date.parse(status.updated_at) : 0;
}

/** An API read can race a newer webhook. Preserve the newer status per resource. */
export function merge_capture(
  current: CaptureType | undefined,
  incoming: CaptureType,
): CaptureType {
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

export function capture_unavailable(recording: CaptureType, now = Date.now()): boolean {
  return (
    (!!recording.expires_at && Date.parse(recording.expires_at) <= now) ||
    ["deleted", "unavailable"].includes(recording.status?.code ?? "")
  );
}

export function capture_download_url(
  recording: CaptureType,
  artifact: ArtifactType | null | undefined,
  now = Date.now(),
): string | null {
  if (capture_unavailable(recording, now) || artifact?.status?.code !== "done") return null;
  return artifact.data?.download_url ?? null;
}
