import { after } from "next/server";
import { is_supported_event } from "@/lib/bot_state";
import { cleanup_stopped_session } from "@/lib/meetings";
import { handle_webhook } from "@/lib/recall/events";
import { verify_webhook_request } from "@/lib/recall/webhook";
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
  try {
    json = JSON.parse(payload);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Acknowledge unrelated events, but reject malformed events this app handles.
  const event = (json as { event?: unknown } | null)?.event;
  if (typeof event !== "string" || !is_supported_event(event)) {
    return new Response(null, { status: 200 });
  }

  const result = WebhookSchema.safeParse(json);
  if (!result.success) return new Response("Invalid event", { status: 400 });

  const delivery_id = request.headers.get("webhook-id") ?? request.headers.get("svix-id");
  if (!delivery_id) return new Response("Missing delivery ID", { status: 400 });

  const meeting_id = await handle_webhook(delivery_id, result.data);
  if (meeting_id) {
    after(async () => {
      try {
        await cleanup_stopped_session(meeting_id);
      } catch {
        console.error("Session cleanup interrupted; retry Stop all session bots.");
      }
    });
  }

  return new Response(null, { status: 200 });
}
