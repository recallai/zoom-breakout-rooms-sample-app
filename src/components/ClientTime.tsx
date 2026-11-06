"use client";

import { useEffect, useState } from "react";
export function ClientTime({
  value,
  format = "time",
}: {
  value: number;
  format?: "time" | "date";
}) {
  const [label, setLabel] = useState("");
  useEffect(
    () =>
      setLabel(
        format === "date"
          ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
          : new Date(value).toLocaleTimeString(),
      ),
    [value, format],
  );
  return <time dateTime={new Date(value).toISOString()}>{label || "—"}</time>;
}
