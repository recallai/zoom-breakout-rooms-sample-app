"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { refresh_captures_action } from "@/app/action";
import { Button } from "@/components/ui/Button";

export function RefreshCapturesButton({ botId }: { botId: string }) {
    const [pending, startTransition] = useTransition();
    return <Button variant="outline" disabled={pending} onClick={() => startTransition(async () => {
        try { const result = await refresh_captures_action(botId); if (result.error) toast.error(result.error); }
        catch { toast.error("Couldn't load capture details. Try again."); }
    })}>{pending ? "Loading captures…" : "Refresh captures"}</Button>;
}
