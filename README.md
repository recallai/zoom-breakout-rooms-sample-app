# Zoom Breakout Rooms sample

A small Next.js app for [DX-428](https://linear.app/recallai/issue/DX-428/sample-app-zoom-breakout-rooms). It demonstrates two Recall.ai bot modes:

- **Stay in the main meeting:** send a `join_main_room` bot that declines breakout invitations and discovers rooms.
- **Join a specific room:** choose a discovered room and send a separate `join_specific_room` bot using the Recall room ID from its webhook.

Built with the same conventions as `calendar_v2_next`: Next.js App Router, TypeScript, server actions, Zod schemas, Drizzle with local SQLite, Tailwind, and the existing Base UI/shadcn components. No OAuth setup or background workers are needed.

## Run locally

Use Node.js 22.18+ (or Node 24+) and npm.

```sh
npm ci
cp .env.sample .env
# Fill in the Recall values in .env.
npm run dev
```

The dev and build commands use Next’s webpack compiler.

Open [localhost:3000](http://localhost:3000). Migrations run automatically on server startup and create `data/app.db`. To run migrations manually, use `npm run db:migrate`.

For this checkout, the Recall API key, its matching region, and webhook secret have already been copied from the calendar sample into the ignored `.env`. OAuth credentials were not copied. Do not overwrite that file with `.env.sample` unless you intend to reconfigure it.

| Variable | Purpose |
| --- | --- |
| `RECALL_API_KEY` | Server-side Recall API key |
| `RECALL_REGION` | Region for that key: `us-east-1`, `us-west-2`, `eu-central-1`, or `ap-northeast-1` |
| `RECALL_WEBHOOK_SECRET` | Workspace verification secret, or this endpoint's Svix signing secret for a legacy account |
| `DATABASE_URL` | Optional SQLite URL; defaults to `file:./data/app.db` |

## Connect webhooks

1. Expose your local server with a tunnel, for example `ngrok http 3000`.
2. In the Recall dashboard **for the same region as your key**, add an endpoint at `https://<your-tunnel-domain>/api/webhooks/recall`.
3. Subscribe to these events:

```text
bot.joining_call
bot.in_waiting_room
bot.in_call_not_recording
bot.recording_permission_allowed
bot.recording_permission_denied
bot.in_call_recording
bot.call_ended
bot.done
bot.fatal
bot.breakout_room_opened
bot.breakout_room_closed
bot.breakout_room_entered
bot.breakout_room_left
```

4. Make sure `.env` has the correct verification secret. Workspace verification secrets use `webhook-*` headers. Legacy Svix endpoints use an endpoint-specific secret and `svix-*` headers; a secret copied from another endpoint will not verify a new legacy endpoint. Restart after changing environment variables.

The app verifies the raw body, rejects signatures older than five minutes, deduplicates deliveries, and commits each event before returning 200. It ignores bots belonging to other apps in the same workspace. Reloading the UI reads local SQLite; it does not poll Recall for bot status.

## Try the two flows

1. Start a Zoom meeting as host and enable **Let participants choose room** in the breakout-room options.
2. Paste the Zoom meeting join URL into the app and send the main-room bot. Admit it and allow recording when prompted.
3. Open breakout rooms in Zoom. The app lists room names and Recall room IDs when the main bot emits room-opened webhooks.
4. Click **Send room bot** for a room. Admit that bot if necessary. The app shows its lifecycle status and confirmed room entry separately.
5. Optionally dispatch bots to other rooms. Each bot captures only its own room. Room-specific bots end their calls when their rooms close; the main bot stays in the main meeting.
6. Use **Leave call** to stop a bot. Stopping the main bot marks its discovered rooms unavailable; any separate room bots must be stopped individually or by closing their rooms.

The room list is scoped to the main bot's local meeting session. The app never substitutes Zoom's internal room ID or a room name for a Recall room ID. An open-room notification alone does not guarantee successful entry: the new bot must receive that room in Zoom's room list. Check the displayed failure sub-code, including `breakout_room_not_open`.

## How the code is organized

```text
src/app/page.tsx                       Server-rendered sessions, rooms, and activity
src/app/action.ts                     Validated server actions
src/app/api/webhooks/recall/route.ts   Signature verification and webhook ingestion
src/components/                      Forms, bot controls, and shared UI
src/lib/meetings.ts                   Main-room and room-bot dispatch / leave flows
src/lib/recall/                       Regional API client and webhook state handling
src/schemas/                         Input, environment, and webhook schemas
src/db/                              Drizzle schema and SQLite client
src/instrumentation.ts               Startup migrations
```

Room dispatch reserves a unique active slot before calling Recall, preventing simultaneous requests from dispatching duplicate bots to one room. Status and room-location timestamps are independent, and older deliveries cannot roll state backward. The app persists a local bot reference in Recall metadata so webhooks arriving before Create Bot returns are still recognized.

Bot creation is intentionally not retried automatically. If a response is lost or a server error occurs, creation may still have succeeded. The app keeps the reservation as `creation unknown` until a webhook resolves it. Check the Recall dashboard before trying again. Explicit API rejections are shown as `create failed` and allow another dispatch. Local state and a remote API call cannot form one transaction; this sample does not implement automated reconciliation for an interrupted process.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Dependency audit: high-severity findings from the reference lockfile were fixed. npm still reports low/moderate advisories in shadcn tooling and drizzle-kit’s loader dependencies; no forced major downgrades were applied.

Tests use a temporary SQLite database and mocked Recall responses; they never create real bots. They cover the two create payloads, early webhooks, duplicate deliveries, out-of-order room/status events, room reservations, room closure, leaving, URL validation, and signature verification.

For a live check, run through the Zoom steps above and confirm `bot.breakout_room_entered` after dispatch. A build or mocked test cannot confirm Zoom permissions or webhook delivery for your workspace.

## Scope

This is a local, single-user sample. There is no authentication, automatic dispatch to every room, recording player, or bot movement between rooms. Keep the controls private; if exposing it beyond local development, add authentication and a persistent database deployment. The SQLite file must survive server restarts; ephemeral/serverless storage is not suitable for this setup.

## References and documentation feedback

- [Zoom breakout-room guide](https://docs.recall.ai/docs/zoom-breakout-rooms)
- [Create Bot](https://docs.recall.ai/reference/bot_create)
- [Bot webhook events](https://docs.recall.ai/docs/bot-status-change-events)
- [Verify Recall requests](https://docs.recall.ai/docs/authenticating-requests-from-recallai)

The guide's mode examples and Zoom prerequisites map directly to this sample. A complete coordinator-to-room walkthrough would make it easier to connect those pieces. The guide could also show the exact dashboard event subscriptions and signing-secret setup alongside its room-discovery example.

## Inspect a room

Expand **Inspect this room** to compare the requested room with the bot's confirmed location, inspect the exact Create Bot body and room-discovery webhook, and open the bot in the regional Recall dashboard. API keys and authorization headers are never saved in these payloads. Request bodies and webhook payloads are captured for new operations; older sessions show an explicit message when those details were not saved.

The inspector also includes a chronological room timeline, combining local dispatch requests, room-open/close notifications from the observer, and lifecycle/location events from each room bot. Times are ordered by the event timestamp, rather than delivery order. An elapsed indicator stays visible while a dispatched bot is awaiting room-entry confirmation; recording in the main meeting alone is not treated as a successful room join. Older sessions may have incomplete discovery history because raw webhook details were not previously saved.

## Dispatch several rooms

Use **Send to all open rooms** or expand **Choose rooms** and send a selection. The server reserves all selected rooms in SQLite, then creates at most two room bots concurrently after acknowledging the action. Active and uncertain reservations are skipped. Each room retains its own result, so one rejection does not stop the rest; bot creation is never automatically retried.

The queue runs inside the single local Next.js process, without another worker service. If the process restarts, use **Resume queued dispatches** for reservations still marked queued. A creation interrupted after its API request needs manual dashboard verification; it is not automatically resent. Rooms that close before their queued creation starts are cancelled. The summary distinguishes queued, joining, confirmed in-room, failed, and uncertain bots.
