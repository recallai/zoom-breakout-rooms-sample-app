"use client";

import { useEffect, useState } from "react";

export function ElapsedTime({ since }: { since: number }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.floor((Date.now() - since) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [since]);
  return <span>{seconds === null ? "…" : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}</span>;
}
