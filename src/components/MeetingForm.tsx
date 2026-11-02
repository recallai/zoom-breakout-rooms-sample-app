"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MainRoomMode } from "@/schemas/MeetingSchema";
import { start_meeting_action } from "@/app/action";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

export function MeetingForm() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [meetingUrl, setMeetingUrl] = useState("");
    const [botName, setBotName] = useState("Breakout Demo");
    const [mainMode, setMainMode] = useState<MainRoomMode>("join_main_room");
    const [transcribe, setTranscribe] = useState(false);
    const [error, setError] = useState<string>();
    return (
        <Card>
            <CardHeader>
                <CardTitle>Start a meeting session</CardTitle>
                <CardDescription>Paste your Zoom link. We’ll send a bot and take you to this meeting’s page.</CardDescription>
            </CardHeader>
            <CardContent>
                <form className="grid gap-4 sm:grid-cols-[1fr_220px_auto] sm:items-end" onSubmit={(event) => {
                    event.preventDefault();
                    setError(undefined);
                    startTransition(async () => {
                        try {
                        const result = await start_meeting_action({ meeting_url: meetingUrl, bot_name: botName, transcribe, main_mode: mainMode });
                        if (result.meeting_id) {
                            if (result.error) toast.error(result.error);
                            else toast.success("Meeting bot dispatched");
                            router.push(`/meeting/${result.meeting_id}`);
                        } else if (result.error) setError(result.error);
                        } catch { setError("Connection lost. Refresh and check the Recall dashboard before sending another bot."); }
                    });
                }}>
                    <div className="grid gap-2"><Label htmlFor="meeting-url">Zoom meeting URL</Label>
                        <Input id="meeting-url" type="url" required placeholder="https://zoom.us/j/…" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} disabled={pending} />
                    </div>
                    <div className="grid gap-2"><Label htmlFor="bot-name">Bot name prefix</Label>
                        <Input id="bot-name" required maxLength={75} value={botName} onChange={(e) => setBotName(e.target.value)} disabled={pending} />
                    </div>
                    <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send meeting bot"}</Button>
                    <fieldset className="grid gap-3 sm:col-span-3" disabled={pending}>
                        <legend className="mb-2 text-sm font-medium">Breakout-room behavior</legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${mainMode === "join_main_room" ? "border-primary bg-primary/5" : ""}`}>
                                <input className="mt-1" type="radio" name="main-mode" value="join_main_room" checked={mainMode === "join_main_room"} onChange={() => setMainMode("join_main_room")} />
                                <span><span className="block text-sm font-medium">Stay in the main room</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">Discover open rooms and send a separate bot to each room you choose. This bot declines room invitations.</span></span>
                            </label>
                            <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${mainMode === "auto_accept_all_invites" ? "border-primary bg-primary/5" : ""}`}>
                                <input className="mt-1" type="radio" name="main-mode" value="auto_accept_all_invites" checked={mainMode === "auto_accept_all_invites"} onChange={() => setMainMode("auto_accept_all_invites")} />
                                <span><span className="block text-sm font-medium">Follow host assignments</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">One bot follows Zoom room invitations and returns to the main meeting when a room closes. No room discovery or batch dispatch.</span></span>
                            </label>
                        </div>
                        <p className="text-xs text-muted-foreground">Join a specific room is available from a discovered room’s page, using its Recall room ID.</p>
                    </fieldset>
                    <label className="flex items-center gap-2 text-sm sm:col-span-3">
                        <input type="checkbox" checked={transcribe} disabled={pending} onChange={(event) => setTranscribe(event.target.checked)} />
                        Include transcripts for this session (Recall.ai transcription usage applies)
                    </label>
                    {error && <p role="alert" className="text-sm text-destructive sm:col-span-3">{error}</p>}
                </form>
            </CardContent>
        </Card>
    );
}
