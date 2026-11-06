# Zoom Breakout Rooms sample

A Recall.ai sample app built with Next.js that demonstrates recording Zoom breakout rooms. Follow along with the [Zoom Breakout Rooms guide](https://docs.recall.ai/docs/zoom-breakout-rooms).

The sample demonstrates two flows:

1. **Always stay in the main meeting room:** send a coordinator bot that records main, rejects breakout invitations, and discovers rooms.
2. **Join a specific room:** open a discovered room and send a separate bot using its Recall room ID.

The app also includes **Accept any invite** to demonstrate the guide's default API behavior. The modes map to the app as follows:

| Guide mode                                      | Where to try it                                                             | Behavior                                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Accept any invite (`auto_accept_all_invites`)   | Select **Accept any invite** when starting a session.                       | Accepts host assignments and returns to main when a room closes. Works with room self-selection disabled; Zoom or the host must assign the bot. |
| Always stay in the main room (`join_main_room`) | Select **Always stay in the main room** when starting a session.            | Records main and rejects room invitations. With **Let participants choose room** enabled, discovers open rooms through webhooks.                |
| Join a specific room (`join_specific_room`)     | In a main-room session, open a discovered room and click **Send room bot**. | Uses the Recall room ID from the discovery webhook, ignores invitations to other rooms, and ends its call when its room closes.                 |

Recall's default API behavior is `auto_accept_all_invites`. The form selects `auto_accept_all_invites` by default. Select **Always stay in the main room** to try the coordinator-to-room flow. One bot records one room at a time; simultaneous coverage requires a separate bot per room.

Built with Next.js App Router, TypeScript, server actions, Zod schemas, Drizzle with local SQLite, Tailwind, and Base UI/shadcn components. No OAuth setup or background workers are needed.

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

| Variable                | Purpose                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `RECALL_API_KEY`        | Server-side Recall API key                                                                 |
| `RECALL_REGION`         | Region for that key: `us-east-1`, `us-west-2`, `eu-central-1`, or `ap-northeast-1`         |
| `RECALL_WEBHOOK_SECRET` | Workspace verification secret, or this endpoint's Svix signing secret for a legacy account |
| `DATABASE_URL`          | Optional SQLite URL; defaults to `file:./data/app.db`                                      |

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

## Try accept any invite

1. Start a Zoom meeting and create breakout rooms. **Let participants choose room** can remain disabled for this flow.
2. Paste the regular Zoom meeting URL into the app, select **Accept any invite**, and send the bot. Admit it and allow recording if prompted.
3. Assign the bot to a breakout room using Zoom. The session page shows `bot.breakout_room_entered` and `bot.breakout_room_left` events as they arrive.
4. Close the room and confirm that the bot returns to the main meeting. You can assign it again for another round.
5. Use **Leave call** or **Stop all session bots** when finished. Captures follow the bot across rooms; they are not split into one file per room.

## Try main-room coordination and a specific room

1. Start a Zoom meeting as host and enable **Let participants choose room** in the breakout-room options.
2. Paste the Zoom meeting join URL into the app, select **Always stay in the main room**, and send the main-room bot. Admit it and allow recording when prompted.
3. Open breakout rooms in Zoom. The app lists room names and Recall room IDs when the main bot emits room-opened webhooks.
4. Click **Send room bot** for a room. Admit that bot if necessary. The app shows its lifecycle status and confirmed room entry separately.
5. Optionally dispatch bots to other rooms. Each bot captures its current room; a room bot can also capture the main meeting before entering its target room. Room-specific bots end their calls when their rooms close; the main bot stays in the main meeting.
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
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

Dependency audit: high-severity findings from the reference lockfile were fixed. npm still reports low/moderate advisories in shadcn tooling and drizzle-kit’s loader dependencies; no forced major downgrades were applied.

Run `npm run format` to apply formatting, organize imports, and apply safe lint fixes with [Biome](https://biomejs.dev/). Generated migrations metadata and the dependency lockfile are excluded.

The unit tests cover bot state rules and capture merging/download eligibility. Use the two manual walkthroughs above to verify the documented modes with a live Zoom meeting.

For a live check, run through the Zoom steps above and confirm `bot.breakout_room_entered` after dispatch. A build or mocked test cannot confirm Zoom permissions or webhook delivery for your workspace.

## Scope

This is a local, single-user sample. There is no authentication, automatic dispatch when rooms open, or bot movement between rooms. Keep the controls private; if exposing it beyond local development, add authentication and a persistent database deployment. The SQLite file must survive server restarts; ephemeral/serverless storage is not suitable for this setup.

## References and documentation feedback

- [Zoom breakout-room guide](https://docs.recall.ai/docs/zoom-breakout-rooms)
- [Create Bot](https://docs.recall.ai/reference/bot_create)
- [Bot webhook events](https://docs.recall.ai/docs/bot-status-change-events)
- [Verify Recall requests](https://docs.recall.ai/docs/authenticating-requests-from-recallai)

The guide's mode examples and Zoom prerequisites map directly to this sample. A complete coordinator-to-room walkthrough would make it easier to connect those pieces. The guide could also show the exact dashboard event subscriptions and signing-secret setup alongside its room-discovery example.

## Inspect a room

Expand **Inspect this room** to compare the requested room with the bot's confirmed location and inspect the room-discovery webhook. Each bot has a separate **Bot configuration** accordion containing its exact Create Bot JSON, and an **Open bot in Recall dashboard** link. API keys and authorization headers are never saved in these payloads. Request bodies and webhook payloads are captured for new operations; older sessions show an explicit message when those details were not saved.

The inspector also includes a chronological room timeline, combining local dispatch requests, room-open/close notifications from the observer, and lifecycle/location events from each room bot. Times are ordered by the event timestamp, rather than delivery order. An elapsed indicator stays visible while a dispatched bot is awaiting room-entry confirmation; recording in the main meeting alone is not treated as a successful room join. Older sessions may have incomplete discovery history because raw webhook details were not previously saved.

## Dispatch several rooms

Use **Send to all open rooms** or expand **Choose rooms** and send a selection. The server reserves all selected rooms in SQLite, then creates at most two room bots concurrently after acknowledging the action. Active and uncertain reservations are skipped. Each room retains its own result, so one rejection does not stop the rest; bot creation is never automatically retried.

The queue runs inside the single local Next.js process, without another worker service. If the process restarts, use **Resume queued dispatches** for reservations still marked queued. A creation interrupted after its API request needs manual dashboard verification; it is not automatically resent. Rooms that close before their queued creation starts are cancelled. The summary distinguishes queued, joining, confirmed in-room, failed, and uncertain bots.

## Stop a session

**Stop all session bots** first persists the stopped session and cancels unsent reservations. It then asks every known bot (including the main bot) to leave. Any Create Bot request already in flight is handled when its response arrives; if a response is lost, a later webhook can identify and stop that bot. The app waits for terminal webhooks before marking remote bots finished. Individual leave failures stay visible and can be retried without blocking cleanup of other bots. Stopped sessions cannot dispatch more bots; start a new session to try again. Stopping only the main bot with its individual control does not stop separate room bots.

## Capture results

**Capture results** appears directly under each bot, including the main-room bot. When recording completion appears in the local webhook state, the page automatically makes a Retrieve Bot request to load playback links. Transcript completion triggers an additional lookup when applicable. These lookups happen once per completion state while the component is mounted; the regular five-second UI refresh reads SQLite. **Refresh captures** remains available to retry a failed lookup or renew expired links. Each recording shows separate video/audio/transcript states and playback or download links only for ready artifacts. Refresh again if signed links expire. Deleted or expired recordings are marked unavailable.

To generate transcripts for new bots, check **Include transcripts for this session** before starting the main bot. It configures Recall.ai transcription on the main bot and all of that session's room bots. Existing recordings are not retranscribed. The full bot capture can include the main meeting before room entry; this version does not trim recordings or transcripts to room intervals.

Subscribe the webhook endpoint to `recording.processing`, `recording.done`, `recording.failed`, `recording.deleted`, `transcript.processing`, `transcript.done`, `transcript.failed`, and `transcript.deleted` in addition to the bot events above. These update local readiness independently. A completed recording does not imply that its transcript has finished. Webhooks do not include signed media links: the page fetches them automatically after completion, or you can use **Refresh captures**. This sample does not delete media or retry transcription automatically.

## Navigate meetings and rooms

The home page contains the new-session form and a compact meeting list. Submitting the form opens `/meeting/[id]`, where the main bot, batch dispatch, room summaries, and session cleanup live. Open a room card to visit `/meeting/[id]/[breakoutId]` for that room’s dispatch control, bot attempts, captures, timeline, and inspector. Breakout IDs are Recall room UUIDs and are checked against the parent session. Webhook activity is collapsed and scoped to the meeting; the home page no longer combines activity across sessions. Failed or uncertain main-bot creations also open their saved session so the result can be inspected before trying again.

## Choose the initial bot’s behavior

The new-session form offers two modes:

- **Stay in the main room** (`join_main_room`, the sample’s default): declines breakout invitations, discovers rooms, and allows dispatch of separate `join_specific_room` bots from the meeting or room pages.
- **Follow host assignments** (`auto_accept_all_invites`): one bot follows Zoom assignments/invitations between rooms and returns to the main meeting when a room closes. Its meeting page shows confirmed room location and entry/exit history. It does not discover rooms or support separate-room dispatch. Its recording follows the bot across rooms rather than splitting into per-room files.

**Join a specific room** remains available from discovered room pages because it requires a Recall room ID. Existing sessions retain `join_main_room` when the migration adds the mode column. The mode is chosen at creation; start a new session to use a different behavior.
