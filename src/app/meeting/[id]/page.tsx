import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BotPanel } from "@/components/BotPanel";
import { ClientTime } from "@/components/ClientTime";
import { SessionBadge, WebhookActivity } from "@/components/MeetingViews";
import { MultiRoomControls } from "@/components/MultiRoomControls";
import { SessionControls } from "@/components/SessionControls";
import { Badge } from "@/components/ui/Badge";
import { can_dispatch_rooms } from "@/lib/bot_state";
import { get_meeting_page } from "@/lib/meeting_page";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { meeting, sessionBots, sessionRooms, activity, recordingRows } =
    await get_meeting_page(id);

  const main = sessionBots.find((bot) => bot.room_id === null);
  const followsHost = meeting.main_mode === "auto_accept_all_invites";
  const disabled = !can_dispatch_rooms(meeting, main);
  const roomBots = sessionBots.filter((bot) => bot.room_id !== null);
  const mainRecordings = recordingRows.filter((row) => row.bot_id === main?.id);

  return (
    <AppShell crumbs={[{ label: meeting.bot_name }]}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{meeting.bot_name}</h1>
            <SessionBadge stopped={!!meeting.stopped_at} bots={sessionBots} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {followsHost ? "Follows host assignments" : "Stays in the main room"} ·{" "}
            {meeting.transcribe ? "Recording and transcription" : "Recording only"}
          </p>
        </div>
        <a
          href={meeting.meeting_url}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Open in Zoom ↗
        </a>
      </div>
      {main && (
        <section className="grid gap-4 rounded-xl border bg-card p-5" aria-label="Main room">
          <BotPanel
            bot={main}
            rows={mainRecordings}
            transcribe={meeting.transcribe}
            heading={<h2 className="font-semibold">{main.name}</h2>}
          >
            <details className="rounded-lg border p-4 text-sm">
              <summary className="cursor-pointer font-medium">Meeting details</summary>
              <dl className="mt-4 grid gap-3 text-xs">
                <div>
                  <dt className="font-medium">Session ID</dt>
                  <dd className="mt-1 break-all font-mono text-muted-foreground">{id}</dd>
                </div>
                <div>
                  <dt className="font-medium">Zoom URL</dt>
                  <dd className="mt-1 break-all text-muted-foreground">{meeting.meeting_url}</dd>
                </div>
                {main?.recall_id && (
                  <div>
                    <dt className="font-medium">Main Recall bot ID</dt>
                    <dd className="mt-1 break-all font-mono text-muted-foreground">
                      {main.recall_id}
                    </dd>
                  </div>
                )}
              </dl>
            </details>
          </BotPanel>
        </section>
      )}
      {!followsHost && (
        <section className="grid gap-4" aria-label="Breakout rooms">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Breakout rooms</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Each room gets a separate bot. Open a room to dispatch, inspect its timeline, or view
              captures.
            </p>
          </div>
          <MultiRoomControls
            meetingId={meeting.id}
            disabled={disabled}
            rooms={sessionRooms
              .filter(
                (room) =>
                  room.open && !roomBots.some((bot) => bot.room_id === room.room_id && bot.active),
              )
              .map((room) => ({ id: room.room_id, name: room.name }))}
            bots={roomBots}
          />
          {!sessionRooms.length && (
            <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center">
              <h3 className="font-medium">
                {disabled ? "No rooms discovered" : "Waiting for rooms"}
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                {disabled
                  ? "This session can’t dispatch room bots. Start a new meeting session from the home page."
                  : "Open breakout rooms in Zoom with “Let participants choose room” enabled. They’ll appear here as webhooks arrive."}
              </p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {sessionRooms.map((room) => {
              const attempts = roomBots.filter((bot) => bot.room_id === room.room_id);
              const latest = attempts[0];
              return (
                <Link
                  key={room.key}
                  href={`/meeting/${id}/${room.room_id}`}
                  className="group grid gap-4 rounded-xl border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">{room.name}</h3>
                    <Badge
                      variant="outline"
                      className={
                        room.open ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""
                      }
                    >
                      {room.open ? "Open" : "Closed"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {!latest
                      ? "No bot sent yet"
                      : latest.active
                        ? latest.location_id === room.room_id
                          ? "Bot confirmed in this room"
                          : "Bot queued or awaiting room entry"
                        : `Last bot: ${latest.status.replaceAll("_", " ")}`}
                  </p>
                  <div className="flex items-center justify-between border-t pt-3 text-xs">
                    <span className="text-muted-foreground">
                      {attempts.length} bot {attempts.length === 1 ? "attempt" : "attempts"} ·{" "}
                      {
                        recordingRows.filter((row) => attempts.some((bot) => bot.id === row.bot_id))
                          .length
                      }{" "}
                      recordings
                    </span>
                    <span className="flex items-center gap-2 font-medium text-primary">
                      View room{" "}
                      <ArrowRightIcon className="size-4 transition group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
      {followsHost && (
        <section
          className="grid gap-3 rounded-xl border bg-card p-5"
          aria-label="Host-assigned room activity"
        >
          <h2 className="text-lg font-semibold">Room assignments</h2>
          <p className="text-sm text-muted-foreground">
            Assign or move this bot to a room in Zoom. This mode does not discover rooms or create
            separate room bots. To record several rooms at once, start a new session with “Always
            stay in the main room”.
          </p>
          <p className="text-sm">
            <strong>Confirmed location:</strong>{" "}
            {main?.active
              ? main.location
                ? main.location
                : main.location_at
                  ? "Main meeting (last room left)"
                  : "No breakout room entry confirmed yet"
              : "Bot finished"}
          </p>
          <ol className="grid gap-2 border-l pl-4">
            {activity
              .filter(
                (event) =>
                  event.bot_id === main?.id &&
                  ["bot.breakout_room_entered", "bot.breakout_room_left"].includes(event.event),
              )
              .slice()
              .reverse()
              .map((event) => (
                <li key={event.id} className="flex flex-wrap justify-between gap-2 text-xs">
                  <span>
                    {event.event === "bot.breakout_room_entered" ? "Entered" : "Left"}{" "}
                    {event.detail ?? "breakout room"}
                  </span>
                  <span className="text-muted-foreground">
                    <ClientTime value={event.happened_at} />
                  </span>
                </li>
              ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            Captures follow this bot across rooms; they are not split into one file per room.
          </p>
        </section>
      )}
      <SessionControls meetingId={id} stopped={!!meeting.stopped_at} bots={sessionBots} />
      <WebhookActivity events={activity} bots={sessionBots} />
    </AppShell>
  );
}
