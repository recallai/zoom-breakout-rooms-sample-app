"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Refresh our local webhook state; this never polls the Recall API. */
export function RefreshButton() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    useEffect(() => {
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") startTransition(() => router.refresh());
        }, 5000);
        return () => clearInterval(timer);
    }, [router]);
    return <Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
        <RefreshCwIcon className={pending ? "animate-spin" : ""} /> Refresh
    </Button>;
}
