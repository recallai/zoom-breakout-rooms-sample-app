import { verify_webhook_request } from "@/lib/recall/webhook";
import { handle_webhook } from "@/lib/recall/events";
import { WebhookSchema } from "@/schemas/WebhookSchema";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const payload = await request.text();
    try {
        verify_webhook_request({ headers: request.headers, payload });
    } catch {
        return new Response("Request not verified", { status: 401 });
    }
    let json: unknown;
    try { json = JSON.parse(payload); }
    catch { return new Response("Invalid JSON", { status: 400 }); }
    // Acknowledge unrelated events, but reject malformed events this app handles.
    const event = (json as { event?: unknown } | null)?.event;
    const { lifecycle_events, room_events, location_events } = await import("@/lib/bot_state");
    if (typeof event !== "string" || ![lifecycle_events, room_events, location_events].some((set) => set.has(event))) {
        return new Response(null, { status: 200 });
    }
    const result = WebhookSchema.safeParse(json);
    if (!result.success) return new Response("Invalid event", { status: 400 });
    await handle_webhook(request.headers.get("webhook-id") ?? request.headers.get("svix-id")!, result.data);
    return new Response(null, { status: 200 });
}
