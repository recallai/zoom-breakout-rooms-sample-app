"use client";

import { useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { refresh_captures_action } from "@/app/action";
import { Button } from "@/components/ui/Button";

export function RefreshCapturesButton({
  botId,
  autoLoadKey,
}: {
  botId: string;
  autoLoadKey: string;
}) {
  const [pending, startTransition] = useTransition();
  const loaded = useRef(new Set<string>());
  useEffect(() => {
    if (!autoLoadKey || loaded.current.has(autoLoadKey)) return;
    loaded.current.add(autoLoadKey);
    startTransition(async () => {
      try {
        const result = await refresh_captures_action(botId);
        if (result.error) toast.error(result.error);
      } catch {
        toast.error("Couldn't load capture details. Use Refresh captures to retry.");
      }
    });
  }, [botId, autoLoadKey]);
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await refresh_captures_action(botId);
            if (result.error) toast.error(result.error);
          } catch {
            toast.error("Couldn't load capture details. Try again.");
          }
        })
      }
    >
      {pending ? "Loading captures…" : "Refresh captures"}
    </Button>
  );
}
