import crypto from "crypto";
import { env } from "../env";

/**
 * Verify that a request came from Recall.ai, using RECALL_WEBHOOK_SECRET. Throws if it didn't.
 * Supports both workspace verification secrets (`webhook-*` headers) and Svix endpoint secrets (`svix-*` headers).
 * `payload` must be the raw request body, since the signature is computed over it.
 * See: https://docs.recall.ai/docs/authenticating-requests-from-recallai
 */
export function verify_webhook_request(args: { headers: Headers, payload: string }): void {
    const { headers, payload } = args;
    const secret = env.RECALL_WEBHOOK_SECRET;
    const msg_id = headers.get("webhook-id") ?? headers.get("svix-id");
    const msg_timestamp = headers.get("webhook-timestamp") ?? headers.get("svix-timestamp");
    const msg_signature = headers.get("webhook-signature") ?? headers.get("svix-signature");

    if (!msg_id || !msg_timestamp || !msg_signature) {
        throw new Error("Missing webhook id, timestamp, or signature header");
    }

    // Reject replayed signatures; delivery retries carry a fresh signed timestamp.
    const seconds = Number(msg_timestamp);
    if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) {
        throw new Error("Webhook timestamp outside tolerance");
    }

    const key = Buffer.from(secret.slice("whsec_".length), "base64");
    const to_sign = `${msg_id}.${msg_timestamp}.${payload}`;
    const expected_sig = crypto.createHmac("sha256", key).update(to_sign).digest();

    // The header may contain multiple space-separated signatures (e.g. during secret rotation).
    for (const versioned_sig of msg_signature.split(" ")) {
        const [version, signature] = versioned_sig.split(",");
        if (version !== "v1" || !signature) continue;
        const sig_bytes = Buffer.from(signature, "base64");
        if (sig_bytes.length === expected_sig.length && crypto.timingSafeEqual(sig_bytes, expected_sig)) {
            return;
        }
    }

    throw new Error("No matching signature found");
}
