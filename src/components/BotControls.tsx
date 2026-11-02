"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { join_room_action, leave_bot_action } from "@/app/action";
import { Button } from "@/components/ui/Button";

export function BotControls(props: { bot_id: string } | { meeting_id: string; room_id: string; disabled: boolean }) {
    const [pending, startTransition] = useTransition();
    const leave = "bot_id" in props;
    return <Button variant={leave ? "outline" : "default"} disabled={pending || (!leave && props.disabled)} onClick={() => {
        startTransition(async () => {
            try {
                const result = leave ? await leave_bot_action(props.bot_id) : await join_room_action(props.meeting_id, props.room_id);
                if (result.error) toast.error(result.error);
                else toast.success(leave ? "Bot asked to leave" : "Room bot queued");
            } catch { toast.error("Connection lost. Refresh to check the bot before retrying."); }
        });
    }}>{pending ? (leave ? "Leaving…" : "Sending…") : (leave ? "Leave call" : "Send room bot")}</Button>;
}
