import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const directory = mkdtempSync(path.join(tmpdir(), "breakout-test-"));
process.env.DATABASE_URL = `file:${directory}/app.db`;
process.env.RECALL_API_KEY = "test-key";
process.env.RECALL_REGION = "us-west-2";
process.env.RECALL_WEBHOOK_SECRET = `whsec_${Buffer.from("test-secret").toString("base64")}`;

const { db } = await import("../src/db/index.ts");
const { bots, rooms, events } = await import("../src/db/schema.ts");
const { migrate } = await import("drizzle-orm/libsql/migrator");
const { eq } = await import("drizzle-orm");
const { start_meeting, join_room, leave_bot } = await import("../src/lib/meetings.ts");
const { handle_webhook } = await import("../src/lib/recall/events.ts");
const { verify_webhook_request } = await import("../src/lib/recall/webhook.ts");
const { MeetingSchema } = await import("../src/schemas/MeetingSchema.ts");
const { POST } = await import("../src/app/api/webhooks/recall/route.ts");
await migrate(db, { migrationsFolder: "./drizzle" });
after(() => rmSync(directory, { recursive: true, force: true }));

function webhook(bot_id: string, event: string, seconds: number, room?: { id: string; name: string }) {
    return { event, data: { bot: { id: bot_id }, data: {
        updated_at: new Date(1_800_000_000_000 + seconds * 1000).toISOString(),
        ...(room ? { breakout_room: room } : {}),
    } } };
}
function signed(payload: string, timestamp = String(Math.floor(Date.now() / 1000)), legacy = false) {
    const id = crypto.randomUUID();
    const signature = crypto.createHmac("sha256", "test-secret").update(`${id}.${timestamp}.${payload}`).digest("base64");
    const prefix = legacy ? "svix" : "webhook";
    return new Headers({ [`${prefix}-id`]: id, [`${prefix}-timestamp`]: timestamp, [`${prefix}-signature`]: `v1,${signature}` });
}

test("validates Zoom join URLs", () => {
    for (const url of ["https://zoom.us/j/123?pwd=abc", "https://company.zoom.us/my/room", "https://zoom.com/j/123"]) {
        assert.equal(MeetingSchema.safeParse({ meeting_url: url, bot_name: "Demo" }).success, true);
    }
    for (const url of ["http://zoom.us/j/123", "https://zoom.us.attacker.test/j/1", "https://example.com/j/1", "https://zoom.us/profile"]) {
        assert.equal(MeetingSchema.safeParse({ meeting_url: url, bot_name: "Demo" }).success, false);
    }
});

test("verifies both header families and rejects tampering, stale signatures and unsigned requests", async () => {
    const payload = JSON.stringify({ event: "unhandled" });
    for (const legacy of [false, true]) assert.doesNotThrow(() => verify_webhook_request({ payload, headers: signed(payload, undefined, legacy) }));
    assert.throws(() => verify_webhook_request({ payload: "tampered", headers: signed(payload) }));
    assert.throws(() => verify_webhook_request({ payload, headers: signed(payload, "1") }));
    assert.equal((await POST(new Request("http://localhost/api/webhooks/recall", { method: "POST", body: payload }))).status, 401);
    assert.equal((await POST(new Request("http://localhost/api/webhooks/recall", { method: "POST", body: "bad", headers: signed("bad") }))).status, 400);
    assert.equal((await POST(new Request("http://localhost/api/webhooks/recall", { method: "POST", body: payload, headers: signed(payload) }))).status, 200);
});

test("dispatches the two modes and applies webhook state safely", async () => {
    const requests: { url: string; body: Record<string, any> }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        requests.push({ url: String(input), body });
        if (String(input).endsWith("/leave_call/")) return new Response(null, { status: 200 });
        const id = crypto.randomUUID();
        // Prove early webhooks can find the reservation before Create Bot has returned.
        await handle_webhook(crypto.randomUUID(), {
            ...webhook(id, "bot.in_waiting_room", 1),
            data: { ...webhook(id, "bot.in_waiting_room", 1).data, bot: { id, metadata: body.metadata } },
        });
        return Response.json({ id });
    };
    try {
        await start_meeting({ meeting_url: "https://zoom.us/j/123", bot_name: "Demo" });
        const main = (await db.select().from(bots))[0];
        assert.deepEqual(requests[0].body.breakout_room, { mode: "join_main_room" });
        assert.match(requests[0].url, /^https:\/\/us-west-2\.recall\.ai\//);
        assert.equal(main.status, "in_waiting_room");
        assert.ok(main.recall_id);
        const room = { id: crypto.randomUUID(), name: "Design" };
        const opened = webhook(main.recall_id!, "bot.breakout_room_opened", 10, room);
        await handle_webhook("same-delivery", opened);
        await handle_webhook("same-delivery", opened);
        assert.equal((await db.select().from(events).where(eq(events.id, "same-delivery"))).length, 1);
        await handle_webhook("closed", webhook(main.recall_id!, "bot.breakout_room_closed", 20, room));
        await handle_webhook("late-open", webhook(main.recall_id!, "bot.breakout_room_opened", 15, room));
        assert.equal((await db.select().from(rooms))[0].open, false);
        await assert.rejects(() => join_room({ meeting_id: main.meeting_id, room_id: room.id }), /no longer available/);
        await handle_webhook("reopen", webhook(main.recall_id!, "bot.breakout_room_opened", 30, room));
        await join_room({ meeting_id: main.meeting_id, room_id: room.id });
        assert.deepEqual(requests[1].body.breakout_room, { mode: "join_specific_room", room_id: room.id });
        await assert.rejects(() => join_room({ meeting_id: main.meeting_id, room_id: room.id }), /already/);
        assert.equal(requests.length, 2);
        const child = (await db.select().from(bots)).find((bot) => bot.room_id === room.id)!;
        await handle_webhook("recording", webhook(child.recall_id!, "bot.in_call_recording", 40));
        await handle_webhook("entered", webhook(child.recall_id!, "bot.breakout_room_entered", 41, room));
        let updated = (await db.select().from(bots).where(eq(bots.id, child.id)))[0];
        assert.equal(updated.status, "in_call_recording");
        assert.equal(updated.location, "Design");
        await leave_bot(child.id);
        assert.ok(requests.at(-1)!.url.endsWith(`/${child.recall_id}/leave_call/`));
        await handle_webhook("ended", webhook(child.recall_id!, "bot.call_ended", 50));
        await handle_webhook("stale-status", webhook(child.recall_id!, "bot.in_call_recording", 45));
        updated = (await db.select().from(bots).where(eq(bots.id, child.id)))[0];
        assert.equal(updated.active, false);
        assert.equal(updated.status, "call_ended");
        assert.equal(updated.location, null);
        await handle_webhook("late-location", webhook(child.recall_id!, "bot.breakout_room_entered", 51, room));
        assert.equal((await db.select().from(bots).where(eq(bots.id, child.id)))[0].location, null);
        await join_room({ meeting_id: main.meeting_id, room_id: room.id });
        const before = (await db.select().from(events)).length;
        await handle_webhook("other-app", webhook(crypto.randomUUID(), "bot.in_call_recording", 60));
        assert.equal((await db.select().from(events)).length, before);
        await handle_webhook("main-ended", webhook(main.recall_id!, "bot.call_ended", 70));
        assert.equal((await db.select().from(rooms))[0].open, false);
    } finally { globalThis.fetch = originalFetch; }
});

test("reserves rooms under concurrent dispatch and distinguishes rejected from uncertain creation", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Record<string, any>[] = [];
    globalThis.fetch = async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        requests.push(body);
        return Response.json({ id: crypto.randomUUID() });
    };
    try {
        await start_meeting({ meeting_url: "https://zoom.us/j/456", bot_name: "Concurrent" });
        const main = (await db.select().from(bots).where(eq(bots.name, "Concurrent · Main room")))[0];
        const room = { id: crypto.randomUUID(), name: "Planning" };
        await handle_webhook(crypto.randomUUID(), webhook(main.recall_id!, "bot.breakout_room_opened", 10, room));
        const results = await Promise.allSettled([
            join_room({ meeting_id: main.meeting_id, room_id: room.id }),
            join_room({ meeting_id: main.meeting_id, room_id: room.id }),
        ]);
        assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
        assert.equal(requests.length, 2); // one main bot and exactly one room bot

        globalThis.fetch = async () => new Response(null, { status: 400 });
        await assert.rejects(() => start_meeting({ meeting_url: "https://zoom.us/j/789", bot_name: "Rejected" }), /rejected/);
        const rejected = (await db.select().from(bots).where(eq(bots.name, "Rejected · Main room")))[0];
        assert.equal(rejected.active, false);
        assert.equal(rejected.status, "create_failed");

        let metadata: Record<string, string> = {};
        globalThis.fetch = async (_input, init) => {
            metadata = JSON.parse(String(init?.body)).metadata;
            throw new TypeError("Simulated lost response");
        };
        await assert.rejects(() => start_meeting({ meeting_url: "https://zoom.us/j/999", bot_name: "Uncertain" }), /could not be confirmed/);
        const uncertain = (await db.select().from(bots).where(eq(bots.name, "Uncertain · Main room")))[0];
        assert.equal(uncertain.active, true);
        assert.equal(uncertain.status, "creation_unknown");
        const remote_id = crypto.randomUUID();
        await handle_webhook(crypto.randomUUID(), {
            ...webhook(remote_id, "bot.in_call_recording", 10),
            data: { ...webhook(remote_id, "bot.in_call_recording", 10).data, bot: { id: remote_id, metadata } },
        });
        const recovered = (await db.select().from(bots).where(eq(bots.id, uncertain.id)))[0];
        assert.equal(recovered.status, "in_call_recording");
        assert.equal(recovered.recall_id, remote_id);
    } finally { globalThis.fetch = originalFetch; }
});
