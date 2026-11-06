"use client";

import { RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { ClientTime } from "@/components/ClientTime";
import { Button } from "@/components/ui/Button";

/** Refresh our local webhook state; this never polls the Recall API. */
export function RefreshButton({ checkedAt }: { checkedAt: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    };
    const timer = setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [router]);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs text-muted-foreground">
        Last checked <ClientTime value={checkedAt} />
      </span>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        <RefreshCwIcon className={pending ? "animate-spin" : ""} /> Refresh
      </Button>
    </div>
  );
}
