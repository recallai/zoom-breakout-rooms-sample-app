import { ClientTime } from "@/components/ClientTime";
import { RefreshCapturesButton } from "@/components/RefreshCapturesButton";
import type { BotType, CaptureRowType } from "@/db/schema";
import { capture_download_url, capture_unavailable } from "@/lib/capture_state";
import { env } from "@/lib/env";
import { type ArtifactType, CaptureSchema, type CaptureType } from "@/schemas/CaptureSchema";

function Artifact({
  label,
  artifact,
  kind,
  unavailable,
  recording,
}: {
  label: string;
  artifact?: ArtifactType | null;
  kind: "video" | "audio" | "transcript";
  unavailable: boolean;
  recording: CaptureType;
}) {
  const state = unavailable
    ? "Unavailable / expired"
    : (artifact?.status?.code?.replaceAll("_", " ") ?? "No artifact details loaded / returned yet");
  const url = capture_download_url(recording, artifact);
  return (
    <div className="grid min-w-0 gap-2">
      {!(kind === "video" && url && !artifact?.status?.sub_code) && (
        <p className="text-xs">
          <strong>{label}:</strong> {state}
          {artifact?.status?.sub_code ? ` · ${artifact.status.sub_code}` : ""}
          {!unavailable &&
            artifact?.status?.code === "done" &&
            !url &&
            " · Refresh captures to fetch the download link"}
        </p>
      )}
      {url && (
        <>
          {kind === "video" && (
            // biome-ignore lint/a11y/useMediaCaption: Capture artifacts provide transcript JSON, not a WebVTT caption track.
            <video
              controls
              preload="none"
              className="max-h-72 w-full rounded-md bg-black"
              aria-label={`${label} playback`}
              src={url}
            />
          )}
          {kind === "audio" && artifact?.format === "mp3" && (
            // biome-ignore lint/a11y/useMediaCaption: Capture artifacts provide transcript JSON, not a WebVTT caption track.
            <audio
              controls
              preload="none"
              className="w-full"
              aria-label={`${label} playback`}
              src={url}
            />
          )}
          {kind === "transcript" && (
            <a
              className="w-fit text-xs underline"
              href={url}
              target="_blank"
              rel="noreferrer"
              download
            >
              Open / download transcript JSON ↗
            </a>
          )}
        </>
      )}
    </div>
  );
}

export function CaptureRefreshControl({ bot, rows }: { bot: BotType; rows: CaptureRowType[] }) {
  // Fetch media links when completion arrives via webhooks, rather than polling Recall.
  const ready = rows
    .map((row) => CaptureSchema.parse(JSON.parse(row.snapshot)))
    .filter((recording) => recording.status?.code === "done")
    .map(
      (recording) =>
        `${recording.id}:${recording.media_shortcuts?.transcript?.status?.code === "done" ? "transcript-done" : "recording-done"}`,
    )
    .sort()
    .join(",");
  return bot.recall_id ? <RefreshCapturesButton botId={bot.id} autoLoadKey={ready} /> : null;
}

export function CaptureResults({
  bot,
  rows,
  transcribe,
}: {
  bot: BotType;
  rows: CaptureRowType[];
  transcribe: boolean;
}) {
  return (
    <section aria-label={`Capture results · ${bot.name}`} className="text-sm">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {bot.capture_checked_at && (
            <span className="text-xs text-muted-foreground">
              Last loaded <ClientTime value={bot.capture_checked_at} />
            </span>
          )}
          {bot.recall_id && (
            <a
              className="text-xs underline"
              href={`https://${env.RECALL_REGION}.recall.ai/dashboard/explorer/bot/${bot.recall_id}`}
              target="_blank"
              rel="noreferrer"
            >
              Open bot in Recall dashboard ↗
            </a>
          )}
        </div>
        {bot.capture_error && (
          <p role="alert" className="text-xs text-destructive">
            {bot.capture_error} Previously loaded details may be out of date.
          </p>
        )}
        {!rows.length && (
          <p className="text-xs text-muted-foreground">
            {!bot.recall_id
              ? "Awaiting a confirmed bot ID."
              : !bot.capture_checked_at
                ? "Load captures to see recording and transcript results."
                : bot.active
                  ? "No recordings returned yet. This bot may not have started recording."
                  : "No recordings returned. This bot may not have recorded, or its media may no longer be available."}
          </p>
        )}
        {rows.map((row) => {
          const recording = CaptureSchema.parse(JSON.parse(row.snapshot));
          const expired = !!recording.expires_at && Date.parse(recording.expires_at) <= Date.now();
          const unavailable = capture_unavailable(recording);
          return (
            <div key={row.id} className="grid gap-3 border-t pt-3">
              {(expired || recording.status?.code !== "done" || recording.status?.sub_code) && (
                <p className="text-xs">
                  Status: {expired ? "expired" : (recording.status?.code ?? "Not loaded")}
                  {recording.status?.sub_code ? ` · ${recording.status.sub_code}` : ""}
                </p>
              )}
              <Artifact
                label="Full bot recording"
                artifact={recording.media_shortcuts?.video_mixed}
                kind="video"
                unavailable={unavailable}
                recording={recording}
              />
              {recording.media_shortcuts?.audio_mixed && (
                <Artifact
                  label="Mixed audio"
                  artifact={recording.media_shortcuts.audio_mixed}
                  kind="audio"
                  unavailable={unavailable}
                  recording={recording}
                />
              )}
              {(transcribe || recording.media_shortcuts?.transcript) && (
                <Artifact
                  label="Transcript"
                  artifact={recording.media_shortcuts?.transcript}
                  kind="transcript"
                  unavailable={unavailable}
                  recording={recording}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
