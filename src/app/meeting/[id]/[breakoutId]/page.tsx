import { notFound } from "next/navigation";
import { get_meeting_page } from "@/lib/meeting_page";
import { AppShell } from "@/components/AppShell";
import { BotStatus, Stats } from "@/components/MeetingViews";
import { BotControls } from "@/components/BotControls";
import { RoomInspector } from "@/components/RoomInspector";
import { RoomTimeline } from "@/components/RoomTimeline";
import { CaptureResults } from "@/components/CaptureResults";
import { Badge } from "@/components/ui/Badge";
import { ClientTime } from "@/components/ClientTime";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function BreakoutPage({ params }: { params: Promise<{ id: string; breakoutId: string }> }) {
    const { id, breakoutId } = await params;
    const { meeting, sessionBots, sessionRooms, activity, recordingRows } = await get_meeting_page(id);
    const room = sessionRooms.find(room => room.room_id === breakoutId);
    if (!room || meeting.main_mode !== "join_main_room") notFound();
    const roomBots = sessionBots.filter(bot => bot.room_id === room.room_id);
    const main = sessionBots.find(bot => bot.room_id === null);
    const active = roomBots.find(bot => bot.active);
    const disabled = !room.open || !!meeting.stopped_at || !main?.active || !!main.stop_requested || !!active;
    return <AppShell crumbs={[{ label: meeting.bot_name, href: `/meeting/${id}` }, { label: room.name }]}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight">{room.name}</h1><Badge variant="outline" className={room.open ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}>{room.open ? "Open" : "Closed"}</Badge></div><p className="mt-2 text-sm text-muted-foreground">Breakout room in {meeting.bot_name}</p></div><BotControls meeting_id={id} room_id={room.room_id} disabled={disabled} /></div>
        <Stats items={[{ label: "Room status", value: room.open ? "Open" : "Closed" }, { label: "Bot attempts", value: roomBots.length }, { label: "Active bots", value: roomBots.filter(bot => bot.active).length }, { label: "Recordings", value: recordingRows.filter(row => roomBots.some(bot => bot.id === row.bot_id)).length }]} />
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">{active ? active.location_id === room.room_id ? "The bot has confirmed entry into this room. Recording status is shown below." : "A bot is already reserved for this room. Follow its timeline for entry confirmation." : meeting.stopped_at ? "This session has stopped. Start a new session to send more bots." : !main?.active || main.stop_requested ? "The main-room bot is no longer available. Start a new session to send room bots." : !room.open ? "This room is closed. Existing recordings and timelines remain available below." : "Ready to send a room bot. It will join the main meeting first, then enter this room when Zoom makes it available."}</div>
        <section className="grid gap-4" aria-label="Room bots and captures"><div><h2 className="text-xl font-semibold tracking-tight">Bots & captures</h2><p className="mt-1 text-sm text-muted-foreground">Each dispatch is kept separately, newest first.</p></div>
            {!roomBots.length && <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">No bot has been sent to this room yet.</div>}
            {roomBots.map((bot, i) => <article key={bot.id} className="grid gap-4 rounded-xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{bot.name} <span className="ml-2 text-xs font-normal text-muted-foreground">Attempt {roomBots.length - i}</span></h3><span className="text-xs text-muted-foreground">Dispatched <ClientTime value={bot.created_at} /></span></div><BotStatus bot={bot} /><CaptureResults bot={bot} rows={recordingRows.filter(row => row.bot_id === bot.id)} transcribe={meeting.transcribe} expanded={i === 0} /></article>)}
        </section>
        <section className="rounded-xl border bg-card p-5"><RoomTimeline room={room} bots={roomBots} events={activity} /></section>
        <RoomInspector room={room} bots={roomBots} source={activity.find(event => event.id === room.source_event_id)} region={env.RECALL_REGION} events={activity} showTimeline={false} />
    </AppShell>;
}
