import type { BotType, CaptureRowType } from "@/db/schema";
import { capture_download_url } from "@/lib/recall/captures";
import { CaptureSchema, type ArtifactType, type CaptureType } from "@/schemas/CaptureSchema";
import { ClientTime } from "@/components/ClientTime";
import { RefreshCapturesButton } from "@/components/RefreshCapturesButton";

function Artifact({ label, artifact, kind, unavailable, recording }: { label: string; artifact?: ArtifactType | null; kind: "video" | "audio" | "transcript"; unavailable: boolean; recording: CaptureType }) {
    const state = unavailable ? "Unavailable / expired" : artifact?.status?.code?.replaceAll("_", " ") ?? "No artifact details loaded / returned yet";
    const url = capture_download_url(recording, artifact);
    return <div className="grid min-w-0 gap-2">
        <p className="text-xs"><strong>{label}:</strong> {state}{artifact?.status?.sub_code ? ` · ${artifact.status.sub_code}` : ""}
            {!unavailable && artifact?.status?.code === "done" && !url && " · Refresh captures to fetch the download link"}</p>
        {url && <>
            {kind === "video" && <video controls preload="none" className="max-h-72 w-full rounded-md bg-black" aria-label={`${label} playback`} src={url} />}
            {kind === "audio" && artifact?.format === "mp3" && <audio controls preload="none" className="w-full" aria-label={`${label} playback`} src={url} />}
            <a className="w-fit text-xs underline" href={url} target="_blank" rel="noreferrer" download>{kind === "transcript" ? "Open / download transcript JSON" : `Open / download ${label.toLowerCase()}`} ↗</a>
        </>}
    </div>;
}

export function CaptureResults({ bot, rows, transcribe }: { bot: BotType; rows: CaptureRowType[]; transcribe: boolean }) {
    return <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Capture results · {bot.name}</summary>
        <div className="mt-3 grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
                {bot.recall_id && <RefreshCapturesButton botId={bot.id} />}
                {bot.capture_checked_at && <span className="text-xs text-muted-foreground">Last loaded <ClientTime value={bot.capture_checked_at} /></span>}
            </div>
            {bot.capture_error && <p role="alert" className="text-xs text-destructive">{bot.capture_error} Previously loaded details may be out of date.</p>}
            {!rows.length && <p className="text-xs text-muted-foreground">{!bot.recall_id ? "Awaiting a confirmed bot ID." : !bot.capture_checked_at ? "Load captures to see recording and transcript results." : bot.active ? "No recordings returned yet. This bot may not have started recording." : "No recordings returned. This bot may not have recorded, or its media may no longer be available."}</p>}
            {rows.map((row) => {
                const recording = CaptureSchema.parse(JSON.parse(row.snapshot));
                const expired = !!recording.expires_at && Date.parse(recording.expires_at) <= Date.now();
                const unavailable = expired || ["deleted", "unavailable"].includes(recording.status?.code ?? "");
                return <div key={row.id} className="grid gap-3 border-t pt-3">
                    <p className="break-all text-xs"><strong>Recording:</strong> {row.id}<br />Status: {expired ? "expired" : recording.status?.code ?? "Not loaded"}{recording.status?.sub_code ? ` · ${recording.status.sub_code}` : ""}</p>
                    <Artifact label="Full bot recording" artifact={recording.media_shortcuts?.video_mixed} kind="video" unavailable={unavailable} recording={recording} />
                    {recording.media_shortcuts?.audio_mixed && <Artifact label="Mixed audio" artifact={recording.media_shortcuts.audio_mixed} kind="audio" unavailable={unavailable} recording={recording} />}
                    {!transcribe && !recording.media_shortcuts?.transcript ? <p className="text-xs text-muted-foreground">Transcription was not enabled for this session.</p>
                        : <Artifact label="Transcript" artifact={recording.media_shortcuts?.transcript} kind="transcript" unavailable={unavailable} recording={recording} />}
                </div>;
            })}
            <p className="text-xs text-muted-foreground">The recording follows this bot and can include time in the main meeting before room entry. Transcript readiness is tracked independently. Refresh captures if a signed download link expires.</p>
        </div>
    </details>;
}
