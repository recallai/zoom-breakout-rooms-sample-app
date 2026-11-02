"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { start_meeting_action } from "@/app/action";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

export function MeetingForm() {
    const [pending, startTransition] = useTransition();
    const [meetingUrl, setMeetingUrl] = useState("");
    const [botName, setBotName] = useState("Breakout Demo");
    const [transcribe, setTranscribe] = useState(false);
    const [error, setError] = useState<string>();
    return (
        <Card>
            <CardHeader>
                <CardTitle>Start in the main room</CardTitle>
                <CardDescription>This bot stays in the main meeting, declines breakout invitations, and discovers available rooms.</CardDescription>
            </CardHeader>
            <CardContent>
                <form className="grid gap-4 sm:grid-cols-[1fr_220px_auto] sm:items-end" onSubmit={(event) => {
                    event.preventDefault();
                    setError(undefined);
                    startTransition(async () => {
                        try {
                        const result = await start_meeting_action({ meeting_url: meetingUrl, bot_name: botName, transcribe });
                        if (result.error) setError(result.error);
                        else { toast.success("Main-room bot dispatched"); setMeetingUrl(""); }
                        } catch { setError("Connection lost. Refresh and check the Recall dashboard before sending another bot."); }
                    });
                }}>
                    <div className="grid gap-2"><Label htmlFor="meeting-url">Zoom meeting URL</Label>
                        <Input id="meeting-url" type="url" required placeholder="https://zoom.us/j/…" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} disabled={pending} />
                    </div>
                    <div className="grid gap-2"><Label htmlFor="bot-name">Bot name prefix</Label>
                        <Input id="bot-name" required maxLength={75} value={botName} onChange={(e) => setBotName(e.target.value)} disabled={pending} />
                    </div>
                    <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send main-room bot"}</Button>
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
