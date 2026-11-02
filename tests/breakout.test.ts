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
const { start_meeting, join_room, leave_bot, queue_room_bots, process_dispatch_queue, stop_session, cleanup_stopped_session } = await import("../src/lib/meetings.ts");
const { handle_webhook } = await import("../src/lib/recall/events.ts");
const { verify_webhook_request } = await import("../src/lib/recall/webhook.ts");
const { build_room_timeline } = await import("../src/lib/room_timeline.ts");
const { captures } = await import("../src/db/schema.ts");
const { refresh_captures, capture_download_url } = await import("../src/lib/recall/captures.ts");
const { CaptureSchema } = await import("../src/schemas/CaptureSchema.ts");
const { WebhookSchema } = await import("../src/schemas/WebhookSchema.ts");
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
        const meetingId = await start_meeting({ meeting_url: "https://zoom.us/j/123", bot_name: "Demo" });
        const main = (await db.select().from(bots))[0];
        assert.equal(meetingId, main.meeting_id);
        assert.deepEqual(requests[0].body.breakout_room, { mode: "join_main_room" });
        assert.match(requests[0].url, /^https:\/\/us-west-2\.recall\.ai\//);
        assert.deepEqual(JSON.parse(main.create_payload!), requests[0].body);
        assert.equal(main.status, "in_waiting_room");
        assert.ok(main.recall_id);
        const room = { id: crypto.randomUUID(), name: "Design" };
        const opened = webhook(main.recall_id!, "bot.breakout_room_opened", 10, room);
        await handle_webhook("same-delivery", opened);
        await handle_webhook("same-delivery", opened);
        assert.equal((await db.select().from(events).where(eq(events.id, "same-delivery"))).length, 1);
        assert.equal((await db.select().from(rooms))[0].source_event_id, "same-delivery");
        assert.deepEqual(JSON.parse((await db.select().from(events).where(eq(events.id, "same-delivery")))[0].payload!), opened);
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
        assert.equal(updated.location_id, room.id);
        const storedRoom = (await db.select().from(rooms).where(eq(rooms.key, `${main.meeting_id}:${room.id}`)))[0];
        const timeline = build_room_timeline(storedRoom, [updated], (await db.select().from(events)).reverse());
        assert.ok(timeline.some((entry) => entry.label === "Room entry confirmed"));
        assert.ok(timeline.some((entry) => entry.label === "Room closed"));
        assert.equal(timeline.some((entry) => entry.label === "Admitted / in meeting, not recording"), false);
        assert.deepEqual(timeline.map((entry) => entry.at), timeline.map((entry) => entry.at).toSorted((a, b) => a - b));
        const otherRoom = { ...storedRoom, room_id: crypto.randomUUID(), source_event_id: null };
        assert.equal(build_room_timeline(otherRoom, [], await db.select().from(events)).length, 0);
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


test("queues a batch without API calls, bounds concurrency, skips reservations and isolates room failures", async () => {
    const originalFetch = globalThis.fetch;
    let live = 0;
    let peak = 0;
    const sent: string[] = [];
    globalThis.fetch = async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.breakout_room.mode === "join_main_room") return Response.json({ id: crypto.randomUUID() });
        live++;
        peak = Math.max(peak, live);
        sent.push(body.breakout_room.room_id);
        await new Promise((resolve) => setTimeout(resolve, 10));
        live--;
        return body.bot_name.endsWith("Room 2") ? new Response(null, { status: 400 }) : Response.json({ id: crypto.randomUUID() });
    };
    try {
        await start_meeting({ meeting_url: "https://zoom.us/j/555", bot_name: "Batch" });
        const main = (await db.select().from(bots).where(eq(bots.name, "Batch · Main room")))[0];
        const opened = Array.from({ length: 6 }, (_, i) => ({ id: crypto.randomUUID(), name: `Room ${i + 1}` }));
        for (const room of opened) await handle_webhook(crypto.randomUUID(), webhook(main.recall_id!, "bot.breakout_room_opened", 10, room));
        assert.deepEqual(await queue_room_bots({ meeting_id: main.meeting_id, room_ids: opened.map((room) => room.id) }), { queued: 6, skipped: 0 });
        assert.equal(sent.length, 0);
        assert.deepEqual(await queue_room_bots({ meeting_id: main.meeting_id, room_ids: [opened[0].id] }), { queued: 0, skipped: 1 });
        await handle_webhook(crypto.randomUUID(), webhook(main.recall_id!, "bot.breakout_room_closed", 20, opened[5]));
        await Promise.all([process_dispatch_queue(), process_dispatch_queue()]);
        assert.equal(peak, 2);
        assert.equal(sent.length, 5);
        assert.equal(new Set(sent).size, 5);
        const children = (await db.select().from(bots).where(eq(bots.meeting_id, main.meeting_id))).filter((bot) => bot.room_id);
        assert.equal(children.filter((bot) => bot.status === "create_failed").length, 1);
        assert.equal(children.filter((bot) => bot.status === "joining_call").length, 4);
        assert.equal(children.filter((bot) => bot.status === "cancelled" && !bot.active).length, 1);
        await assert.rejects(() => queue_room_bots({ meeting_id: main.meeting_id, room_ids: [crypto.randomUUID()] }), /no longer available/);
    } finally { globalThis.fetch = originalFetch; }
});


test("session stop cancels queued work and cleans up in-flight creations without marking them finished early", async () => {
    const originalFetch = globalThis.fetch;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const twoStarted = new Promise<void>((resolve) => { started = resolve; });
    const created: string[] = [];
    const left: string[] = [];
    globalThis.fetch = async (input, init) => {
        if (String(input).endsWith("/leave_call/")) { left.push(String(input)); return new Response(null, { status: 200 }); }
        const body = JSON.parse(String(init?.body));
        const id = crypto.randomUUID();
        if (body.breakout_room.mode === "join_specific_room") {
            created.push(id);
            if (created.length === 2) started();
            await gate;
        }
        return Response.json({ id });
    };
    try {
        await start_meeting({ meeting_url: "https://zoom.us/j/666", bot_name: "Stop batch" });
        const main = (await db.select().from(bots).where(eq(bots.name, "Stop batch · Main room")))[0];
        const opened = Array.from({ length: 5 }, (_, i) => ({ id: crypto.randomUUID(), name: `Room ${i + 1}` }));
        for (const room of opened) await handle_webhook(crypto.randomUUID(), webhook(main.recall_id!, "bot.breakout_room_opened", 10, room));
        await queue_room_bots({ meeting_id: main.meeting_id, room_ids: opened.map((room) => room.id) });
        const draining = process_dispatch_queue();
        await twoStarted;
        await stop_session(main.meeting_id);
        await cleanup_stopped_session(main.meeting_id);
        release();
        await draining;
        await cleanup_stopped_session(main.meeting_id);
        const stored = await db.select().from(bots).where(eq(bots.meeting_id, main.meeting_id));
        assert.equal(created.length, 2);
        assert.equal(stored.filter((bot) => bot.status === "cancelled").length, 3);
        assert.equal(left.length, 3); // main + the two remote bots that were already being created
        assert.equal(stored.filter((bot) => bot.active && bot.stop_requested).length, 3);
        await assert.rejects(() => queue_room_bots({ meeting_id: main.meeting_id, room_ids: [opened[0].id] }), /main-room bot connected/);
        for (const bot of stored.filter((bot) => bot.recall_id)) {
            await handle_webhook(crypto.randomUUID(), webhook(bot.recall_id!, "bot.call_ended", 50));
        }
        assert.equal((await db.select().from(bots).where(eq(bots.meeting_id, main.meeting_id))).some((bot) => bot.active), false);
    } finally { release(); globalThis.fetch = originalFetch; }
});

test("late webhooks identify uncertain creations for cleanup, and leave failures remain retryable", async () => {
    const originalFetch = globalThis.fetch;
    let metadata: Record<string, string> = {};
    globalThis.fetch = async (_input, init) => { metadata = JSON.parse(String(init?.body)).metadata; throw new Error("Lost creation response"); };
    try {
        await assert.rejects(() => start_meeting({ meeting_url: "https://zoom.us/j/777", bot_name: "Late stop" }), /could not be confirmed/);
        const main = (await db.select().from(bots).where(eq(bots.name, "Late stop · Main room")))[0];
        await stop_session(main.meeting_id);
        const remote_id = crypto.randomUUID();
        const id = await handle_webhook(crypto.randomUUID(), {
            ...webhook(remote_id, "bot.in_call_recording", 10),
            data: { ...webhook(remote_id, "bot.in_call_recording", 10).data, bot: { id: remote_id, metadata } },
        });
        assert.equal(id, main.meeting_id);
        globalThis.fetch = async () => new Response(null, { status: 503 });
        await cleanup_stopped_session(main.meeting_id);
        let saved = (await db.select().from(bots).where(eq(bots.id, main.id)))[0];
        assert.equal(saved.active, true);
        assert.equal(saved.status, "stop_failed");
        assert.match(saved.stop_error!, /503/);
        let leaves = 0;
        globalThis.fetch = async () => { leaves++; return new Response(null, { status: 200 }); };
        await cleanup_stopped_session(main.meeting_id);
        await cleanup_stopped_session(main.meeting_id);
        assert.equal(leaves, 1);
        saved = (await db.select().from(bots).where(eq(bots.id, main.id)))[0];
        assert.equal(saved.status, "leaving");
        assert.equal(saved.stop_error, null);
        await handle_webhook(crypto.randomUUID(), webhook(remote_id, "bot.done", 20));
        assert.equal((await db.select().from(bots).where(eq(bots.id, main.id)))[0].active, false);
    } finally { globalThis.fetch = originalFetch; }
});


test("capture results keep recording and transcript readiness separate and handle expiry and stale events", async () => {
    const originalFetch = globalThis.fetch;
    const recording_id = crypto.randomUUID();
    const transcript_id = crypto.randomUUID();
    const status = (code: string, seconds: number) => ({ code, sub_code: null, updated_at: webhook(crypto.randomUUID(), "unused", seconds).data.data.updated_at });
    const recording = {
        id: recording_id, status: status("done", 10), expires_at: new Date(Date.now() + 3600000).toISOString(),
        media_shortcuts: {
            video_mixed: { id: crypto.randomUUID(), status: status("done", 10), format: "mp4", data: { download_url: "https://media.example/video.mp4" } },
            transcript: { id: transcript_id, status: status("processing", 10), data: { download_url: "https://media.example/partial.json" } },
        },
    };
    const requests: { url: string; method: string }[] = [];
    let createBody: any;
    globalThis.fetch = async (input, init) => {
        requests.push({ url: String(input), method: init?.method ?? "GET" });
        if (init?.method === "POST") { createBody = JSON.parse(String(init.body)); return Response.json({ id: crypto.randomUUID() }); }
        return Response.json({ recordings: [recording] });
    };
    try {
        await start_meeting({ meeting_url: "https://zoom.us/j/888", bot_name: "Capture", transcribe: true });
        assert.deepEqual(createBody.recording_config.transcript, { provider: { recallai_streaming: { mode: "prioritize_accuracy" } } });
        const bot = (await db.select().from(bots).where(eq(bots.name, "Capture · Main room")))[0];
        await refresh_captures(bot.id);
        assert.equal(requests.at(-1)!.method, "GET");
        assert.ok(requests.at(-1)!.url.endsWith(`/${bot.recall_id}/`));
        let stored = CaptureSchema.parse(JSON.parse((await db.select().from(captures).where(eq(captures.id, recording_id)))[0].snapshot));
        assert.equal(capture_download_url(stored, stored.media_shortcuts?.video_mixed), "https://media.example/video.mp4");
        assert.equal(capture_download_url(stored, stored.media_shortcuts?.transcript), null);
        assert.equal(capture_download_url({ ...stored, expires_at: new Date(0).toISOString() }, stored.media_shortcuts?.video_mixed), null);
        const captureEvent = (event: string, seconds: number) => ({
            ...webhook(bot.recall_id!, event, seconds), data: {
                ...webhook(bot.recall_id!, event, seconds).data,
                recording: { id: recording_id }, ...(event.startsWith("transcript.") ? { transcript: { id: transcript_id } } : {}),
            },
        });
        assert.equal(WebhookSchema.safeParse(captureEvent("transcript.done", 20)).success, true);
        assert.equal(WebhookSchema.safeParse(webhook(bot.recall_id!, "transcript.done", 20)).success, false);
        await handle_webhook(crypto.randomUUID(), captureEvent("transcript.done", 20));
        // A newer done event must not bless a previously returned partial/processing URL.
        stored = CaptureSchema.parse(JSON.parse((await db.select().from(captures).where(eq(captures.id, recording_id)))[0].snapshot));
        assert.equal(stored.media_shortcuts?.transcript?.status?.code, "done");
        assert.equal(capture_download_url(stored, stored.media_shortcuts?.transcript), null);
        recording.media_shortcuts.transcript = { id: transcript_id, status: status("done", 20), data: { download_url: "https://media.example/final.json" } };
        await refresh_captures(bot.id);
        stored = CaptureSchema.parse(JSON.parse((await db.select().from(captures).where(eq(captures.id, recording_id)))[0].snapshot));
        assert.equal(capture_download_url(stored, stored.media_shortcuts?.transcript), "https://media.example/final.json");
        await handle_webhook(crypto.randomUUID(), captureEvent("recording.deleted", 30));
        await handle_webhook(crypto.randomUUID(), captureEvent("recording.done", 25));
        await refresh_captures(bot.id); // API fixture is stale relative to deleted webhook.
        stored = CaptureSchema.parse(JSON.parse((await db.select().from(captures).where(eq(captures.id, recording_id)))[0].snapshot));
        assert.equal(stored.status?.code, "deleted");
        assert.equal(capture_download_url(stored, stored.media_shortcuts?.video_mixed), null);
        assert.equal(stored.media_shortcuts?.transcript?.data, null);
        globalThis.fetch = async () => new Response(null, { status: 404 });
        await assert.rejects(() => refresh_captures(bot.id), /404/);
        assert.match((await db.select().from(bots).where(eq(bots.id, bot.id)))[0].capture_error!, /404/);
        globalThis.fetch = async () => Response.json({ recordings: [] });
        await refresh_captures(bot.id);
        stored = CaptureSchema.parse(JSON.parse((await db.select().from(captures).where(eq(captures.id, recording_id)))[0].snapshot));
        assert.equal(stored.status?.code, "unavailable");
        assert.equal((await db.select().from(bots).where(eq(bots.id, bot.id)))[0].capture_error, null);
    } finally { globalThis.fetch = originalFetch; }
});

test("host-assigned mode persists, follows room location events, and cannot dispatch separate room bots", async () => {
    const values = { meeting_url: "https://zoom.us/j/321", bot_name: "Follow host" };
    assert.equal(MeetingSchema.parse(values).main_mode, "join_main_room");
    assert.equal(MeetingSchema.safeParse({ ...values, main_mode: "join_specific_room" }).success, false);
    const input = MeetingSchema.parse({ ...values, main_mode: "auto_accept_all_invites", transcribe: true });
    const originalFetch = globalThis.fetch;
    const requests: { url: string; body?: Record<string, any> }[] = [];
    globalThis.fetch = async (url, init) => {
        requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
        return String(url).endsWith("/leave_call/") ? new Response(null, { status: 200 }) : Response.json({ id: crypto.randomUUID() });
    };
    try {
        const id = await start_meeting(input);
        const { meetings } = await import("../src/db/schema.ts");
        const session = (await db.select().from(meetings).where(eq(meetings.id, id)))[0];
        const bot = (await db.select().from(bots).where(eq(bots.meeting_id, id)))[0];
        assert.equal(session.main_mode, "auto_accept_all_invites");
        assert.equal(bot.name, "Follow host · Host-assigned bot");
        assert.deepEqual(requests[0].body!.breakout_room, { mode: "auto_accept_all_invites" });
        assert.ok(requests[0].body!.recording_config.transcript);
        const first = { id: crypto.randomUUID(), name: "First room" };
        const second = { id: crypto.randomUUID(), name: "Second room" };
        await handle_webhook(crypto.randomUUID(), webhook(bot.recall_id!, "bot.breakout_room_opened", 1, first));
        assert.equal((await db.select().from(rooms).where(eq(rooms.meeting_id, id))).length, 0);
        await assert.rejects(() => queue_room_bots({ meeting_id: id, room_ids: [first.id] }), /require Stay in the main room/);
        await handle_webhook(crypto.randomUUID(), webhook(bot.recall_id!, "bot.in_call_recording", 2));
        await handle_webhook(crypto.randomUUID(), webhook(bot.recall_id!, "bot.breakout_room_entered", 3, first));
        let current = (await db.select().from(bots).where(eq(bots.id, bot.id)))[0];
        assert.equal(current.location_id, first.id);
        assert.equal(current.status, "in_call_recording");
        await handle_webhook(crypto.randomUUID(), webhook(bot.recall_id!, "bot.breakout_room_left", 4, first));
        current = (await db.select().from(bots).where(eq(bots.id, bot.id)))[0];
        assert.equal(current.location_id, null);
        assert.equal(current.active, true); // A room closing does not finish this mode's bot.
        await handle_webhook(crypto.randomUUID(), webhook(bot.recall_id!, "bot.breakout_room_entered", 5, second));
        await handle_webhook(crypto.randomUUID(), webhook(bot.recall_id!, "bot.breakout_room_left", 4, first));
        current = (await db.select().from(bots).where(eq(bots.id, bot.id)))[0];
        assert.equal(current.location_id, second.id);
        await stop_session(id);
        await cleanup_stopped_session(id);
        assert.equal(requests.length, 2);
        assert.ok(requests[1].url.endsWith(`/${bot.recall_id}/leave_call/`));
        await handle_webhook(crypto.randomUUID(), webhook(bot.recall_id!, "bot.done", 6));
        current = (await db.select().from(bots).where(eq(bots.id, bot.id)))[0];
        assert.equal(current.active, false);
        assert.equal(current.location_id, null);
    } finally { globalThis.fetch = originalFetch; }
});
