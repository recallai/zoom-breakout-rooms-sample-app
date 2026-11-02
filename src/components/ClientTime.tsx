"use client";

import { useEffect, useState } from "react";
export function ClientTime({ value }: { value: number }) {
    const [label, setLabel] = useState("");
    useEffect(() => setLabel(new Date(value).toLocaleTimeString()), [value]);
    return <time dateTime={new Date(value).toISOString()}>{label || "—"}</time>;
}
