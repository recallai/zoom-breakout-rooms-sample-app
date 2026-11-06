"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { start_meeting_action } from "@/app/action";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import type { MainRoomMode } from "@/schemas/MeetingSchema";

export function MeetingForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [meetingUrl, setMeetingUrl] = useState("");
  const [botName, setBotName] = useState("Breakout Demo");
  const [mainMode, setMainMode] = useState<MainRoomMode>("auto_accept_all_invites");
  const [transcribe, setTranscribe] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a meeting session</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-[1fr_220px_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setError(undefined);
            startTransition(async () => {
              try {
                const result = await start_meeting_action({
                  meeting_url: meetingUrl,
                  bot_name: botName,
                  transcribe,
                  main_mode: mainMode,
                });
                if (result.meeting_id) {
                  if (result.error) toast.error(result.error);
                  else toast.success("Meeting bot dispatched");
                  router.push(`/meeting/${result.meeting_id}`);
                } else if (result.error) setError(result.error);
              } catch {
                setError(
                  "Connection lost. Refresh and check the Recall dashboard before sending another bot.",
                );
              }
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="meeting-url">Zoom meeting URL</Label>
            <Input
              id="meeting-url"
              type="url"
              required
              placeholder="https://zoom.us/j/…"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bot-name">Bot name prefix</Label>
            <Input
              id="bot-name"
              required
              maxLength={75}
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              disabled={pending}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send meeting bot"}
          </Button>
          <fieldset className="grid gap-3 sm:col-span-3" disabled={pending}>
            <legend className="mb-2 text-sm font-medium">
              Breakout-room behavior{" "}
              <a
                className="ml-3 text-xs font-normal text-muted-foreground underline"
                href="https://docs.recall.ai/docs/zoom-breakout-rooms"
                target="_blank"
                rel="noreferrer"
              >
                Guide ↗
              </a>
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${mainMode === "auto_accept_all_invites" ? "border-primary bg-primary/5" : ""}`}
              >
                <input
                  className="mt-1"
                  type="radio"
                  name="main-mode"
                  value="auto_accept_all_invites"
                  checked={mainMode === "auto_accept_all_invites"}
                  onChange={() => setMainMode("auto_accept_all_invites")}
                />
                <span>
                  <span className="block text-sm font-medium">
                    Accept any invite{" "}
                    <span className="font-normal text-muted-foreground">(default)</span>
                  </span>
                  <code className="mt-2 block text-xs text-muted-foreground">
                    breakout_room.mode: &quot;auto_accept_all_invites&quot;
                  </code>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    Recall’s default behavior. The bot accepts the host’s breakout invitations and
                    returns to main when the room closes. Works with room self-selection disabled.
                  </span>
                </span>
              </label>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${mainMode === "join_main_room" ? "border-primary bg-primary/5" : ""}`}
              >
                <input
                  className="mt-1"
                  type="radio"
                  name="main-mode"
                  value="join_main_room"
                  checked={mainMode === "join_main_room"}
                  onChange={() => setMainMode("join_main_room")}
                />
                <span>
                  <span className="block text-sm font-medium">Always stay in the main room</span>
                  <code className="mt-2 block text-xs text-muted-foreground">
                    breakout_room.mode: &quot;join_main_room&quot;
                  </code>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    Records the main meeting and rejects breakout invitations. Enable “Let
                    participants choose room” in Zoom to discover rooms.
                    <span className="mt-2 block">
                      To join a specific room, open it in the app and send a separate room bot with{" "}
                      <code>breakout_room.mode: &quot;join_specific_room&quot;</code>. That bot ends
                      its call when its room closes.
                    </span>
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input
              type="checkbox"
              checked={transcribe}
              disabled={pending}
              onChange={(event) => setTranscribe(event.target.checked)}
            />
            Include transcripts for this session (Recall.ai transcription usage applies)
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive sm:col-span-3">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
