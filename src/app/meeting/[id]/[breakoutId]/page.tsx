import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BotControls } from "@/components/BotControls";
import { BotPanel } from "@/components/BotPanel";
import { RoomInspector } from "@/components/RoomInspector";
import { RoomTimeline } from "@/components/RoomTimeline";
import { Badge } from "@/components/ui/Badge";
import { can_dispatch_rooms } from "@/lib/bot_state";
import { env } from "@/lib/env";
import { get_meeting_page } from "@/lib/meeting_page";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function BreakoutPage({
  params,
}: {
  params: Promise<{ id: string; breakoutId: string }>;
}) {
  const { id, breakoutId } = await params;
  const { meeting, sessionBots, sessionRooms, activity, recordingRows } =
    await get_meeting_page(id);

  const room = sessionRooms.find((room) => room.room_id === breakoutId);
  if (!room || meeting.main_mode !== "join_main_room") notFound();

  const roomBots = sessionBots.filter((bot) => bot.room_id === room.room_id);
  const main = sessionBots.find((bot) => bot.room_id === null);
  const active = roomBots.find((bot) => bot.active);
  const disabled = !room.open || !can_dispatch_rooms(meeting, main) || !!active;

  return (
    <AppShell crumbs={[{ label: meeting.bot_name, href: `/meeting/${id}` }, { label: room.name }]}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{room.name}</h1>
            <Badge
              variant="outline"
              className={room.open ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}
            >
              {room.open ? "Open" : "Closed"}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Breakout room in {meeting.bot_name}</p>
        </div>
        <BotControls meeting_id={id} room_id={room.room_id} disabled={disabled} />
      </div>
      <section className="grid gap-4" aria-label="Room bots and captures">
        {!roomBots.length && (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            No bot has been sent to this room yet.
          </div>
        )}
        {roomBots.map((bot, i) => {
          const rows = recordingRows.filter((row) => row.bot_id === bot.id);
          return (
            <article key={bot.id} className="grid gap-4 rounded-xl border bg-card p-5">
              <BotPanel
                bot={bot}
                rows={rows}
                transcribe={meeting.transcribe}
                heading={
                  <h3 className="font-semibold">
                    {bot.name}{" "}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      Attempt {roomBots.length - i}
                    </span>
                  </h3>
                }
              >
                <RoomInspector
                  room={room}
                  bots={[bot]}
                  source={activity.find((event) => event.id === room.source_event_id)}
                  region={env.RECALL_REGION}
                  events={activity}
                  showTimeline={false}
                />
              </BotPanel>
            </article>
          );
        })}
      </section>
      <section className="rounded-xl border bg-card p-5">
        <RoomTimeline room={room} bots={roomBots} events={activity} />
      </section>
    </AppShell>
  );
}
