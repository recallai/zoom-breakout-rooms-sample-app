import { env } from "@/lib/env";

export class RecallApiError extends Error {
    readonly status: number;
    constructor(status: number) {
        super(`Recall API returned ${status}`);
        this.status = status;
    }
}

/** Small server-only client. Do not retry bot creation: a lost response may still have created a bot. */
export async function recall_fetch(args: { path: string; method?: "GET" | "POST"; body?: unknown }): Promise<unknown> {
    const response = await fetch(new URL(args.path, `https://${env.RECALL_REGION}.recall.ai`), {
        method: args.method ?? "GET",
        headers: { Authorization: env.RECALL_API_KEY, "Content-Type": "application/json" },
        body: args.body === undefined ? undefined : JSON.stringify(args.body),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new RecallApiError(response.status);
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
}
