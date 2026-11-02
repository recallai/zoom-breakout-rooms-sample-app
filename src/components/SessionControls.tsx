"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { BotType } from "@/db/schema";
import { stop_session_action } from "@/app/action";
import { Button } from "@/components/ui/Button";

export function SessionControls({ meetingId, stopped, bots }: { meetingId: string; stopped: boolean; bots: BotType[] }) {
    const [pending, startTransition] = useTransition();
    const active = bots.filter((bot) => bot.active);
    const errors = active.filter((bot) => bot.stop_error);
    const needsCleanup = active.some((bot) => bot.recall_id && (!bot.stop_requested || bot.stop_error));
    const uncertain = active.filter((bot) => !bot.recall_id);
    return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="grid gap-1 text-xs text-muted-foreground">
            <p>{stopped ? (active.length ? `Stopping session · ${active.length} bots not yet confirmed finished` : "Session stopped · all bots finished or cancelled") : `${active.length} active or queued bots`}</p>
            <p>Stops the main bot and all room bots, and cancels queued work. Your Zoom meeting stays open.</p>
            {errors.length > 0 && <p role="alert" className="text-destructive">{errors.length} leave requests failed. Retry cleanup.</p>}
            {stopped && uncertain.length > 0 && <p>{uncertain.length} creations still unconfirmed. Known late-created bots will be stopped when their responses or webhooks arrive; check the Recall dashboard if they remain uncertain.</p>}
        </div>
        <Button variant="destructive" disabled={pending || !active.length || (stopped && !needsCleanup)} onClick={() => startTransition(async () => {
            try {
                const result = await stop_session_action(meetingId);
                if (result.error) toast.error(result.error);
                else toast.success("Session stop requested");
            } catch { toast.error("Connection lost. Refresh to check cleanup status."); }
        })}>{pending ? "Stopping…" : stopped ? !active.length ? "All bots stopped" : needsCleanup ? "Retry session cleanup" : "Waiting for bots to leave…" : "Stop all session bots"}</Button>
    </div>;
}
