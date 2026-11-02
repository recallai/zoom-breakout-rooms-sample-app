import { desc } from "drizzle-orm";
import { NetworkIcon } from "lucide-react";
import { db } from "@/db";
import { meetings, bots, rooms, events, type BotType } from "@/db/schema";
import { RoomInspector } from "@/components/RoomInspector";
import { MeetingForm } from "@/components/MeetingForm";
import { BotControls } from "@/components/BotControls";
import { RefreshButton } from "@/components/RefreshButton";
import { ClientTime } from "@/components/ClientTime";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function BotStatus({ bot }: { bot: BotType }) {
    return <div className="flex flex-wrap items-center gap-2">
        <Badge variant={bot.status === "fatal" || bot.status === "create_failed" || bot.status === "creation_unknown" ? "destructive" : "secondary"}>{bot.status.replaceAll("_", " ")}</Badge>
        {bot.sub_code && <span className="text-xs text-muted-foreground">{bot.sub_code}</span>}
        {bot.active && bot.location && <span className="text-xs">In {bot.location}</span>}
        {bot.recall_id && <span className="break-all font-mono text-xs text-muted-foreground">{bot.recall_id}</span>}
        {bot.active && bot.recall_id && bot.status !== "leaving" && <BotControls bot_id={bot.id} />}
        {bot.status === "creation_unknown" && <span className="text-xs text-destructive">Check the Recall dashboard before sending another bot.</span>}
    </div>;
}

export default async function HomePage() {
    const [sessions, allBots, allRooms, activity] = await Promise.all([
        db.select().from(meetings).orderBy(desc(meetings.created_at)),
        db.select().from(bots).orderBy(desc(bots.created_at)),
        db.select().from(rooms).orderBy(rooms.name),
        db.select().from(events).orderBy(desc(events.happened_at)),
    ]);
    return <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"><NetworkIcon className="size-5" /></div>
                    <h1 className="text-3xl font-semibold tracking-tight">Zoom Breakout Rooms</h1>
                    <Badge variant="secondary">Recall.ai</Badge>
                </div>
                <p className="text-muted-foreground">One bot in the main meeting. A separate bot for each room you choose.</p>
            </div>
            <RefreshButton />
        </header>
        <Card>
            <CardHeader><CardTitle>Before you start</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
                <p>1. In Zoom, enable <strong className="text-foreground">Let participants choose room</strong>, then open your breakout rooms.</p>
                <p>2. Send a main-room bot below. Admit it and grant recording permission when Zoom prompts you.</p>
                <p>3. Rooms appear from webhooks. Choose a room and send a separate bot to it. A room bot leaves the call when its room closes.</p>
                <p>Configure <code>/api/webhooks/recall</code> in the <a className="underline" href={`https://${env.RECALL_REGION}.recall.ai/dashboard/webhooks/`} target="_blank" rel="noreferrer">Recall webhooks dashboard</a>. Subscribe to bot lifecycle and all four breakout-room events. <a className="underline" href="https://docs.recall.ai/docs/zoom-breakout-rooms" target="_blank" rel="noreferrer">Setup guide ↗</a></p>
                <p className="text-xs">Region: {env.RECALL_REGION} · Local state refreshes every 5 seconds.</p>
            </CardContent>
        </Card>
        <MeetingForm />
        <section className="grid gap-4" aria-label="Meeting sessions">
            {sessions.length === 0 && <div className="rounded-xl border border-dashed px-6 py-12 text-center text-muted-foreground">No meetings yet. Send a bot to get started.</div>}
            {sessions.map((meeting) => {
                const sessionBots = allBots.filter((bot) => bot.meeting_id === meeting.id);
                const main = sessionBots.find((bot) => bot.room_id === null);
                const sessionRooms = allRooms.filter((room) => room.meeting_id === meeting.id);
                return <Card key={meeting.id}>
                    <CardHeader>
                        <CardTitle>{meeting.bot_name}</CardTitle>
                        <CardDescription className="break-all">{meeting.meeting_url}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6">
                        <div className="grid gap-2"><h2 className="font-medium">Main room <Badge variant="outline">join_main_room</Badge></h2>{main && <BotStatus bot={main} />}</div>
                        <div className="grid gap-3">
                            <h2 className="font-medium">Breakout rooms <Badge variant="outline">join_specific_room</Badge></h2>
                            {!sessionRooms.length && <p className="rounded-lg bg-muted px-4 py-5 text-muted-foreground">Waiting for room webhooks. If rooms don’t appear, check the webhook endpoint, the main bot’s status, and Zoom’s “Let participants choose room” setting.</p>}
                            {sessionRooms.map((room) => {
                                const roomBots = sessionBots.filter((bot) => bot.room_id === room.room_id);
                                const active = roomBots.some((bot) => bot.active);
                                return <div key={room.key} className="grid gap-3 rounded-lg border p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="grid gap-1"><div className="flex items-center gap-2"><h3 className="font-medium">{room.name}</h3><Badge variant={room.open ? "secondary" : "outline"}>{room.open ? "Open" : "Closed"}</Badge></div><code className="break-all text-xs text-muted-foreground">{room.room_id}</code></div>
                                        <BotControls meeting_id={meeting.id} room_id={room.room_id} disabled={!room.open || !main?.active || main.status === "leaving" || active} />
                                    </div>
                                    {roomBots.map((bot) => <BotStatus key={bot.id} bot={bot} />)}
                                    <RoomInspector room={room} bots={roomBots} source={activity.find((event) => event.id === room.source_event_id)} region={env.RECALL_REGION} events={activity} />
                                </div>;
                            })}
                        </div>
                    </CardContent>
                </Card>;
            })}
        </section>
        <Card>
            <CardHeader><CardTitle>Webhook activity</CardTitle><CardDescription>Latest 40 events for bots created by this app. Room and status updates are stored locally.</CardDescription></CardHeader>
            <CardContent>
                {!activity.length ? <p className="text-muted-foreground">No events received yet.</p> : <ul className="divide-y">{activity.slice(0, 40).map((event) => {
                    const bot = allBots.find((bot) => bot.id === event.bot_id);
                    return <li key={event.id} className="flex flex-wrap justify-between gap-2 py-3"><div className="grid gap-1"><span className="font-mono text-xs">{event.event}</span><span className="text-xs text-muted-foreground">{bot?.name}{event.detail ? ` · ${event.detail}` : ""}</span></div><span className="text-xs text-muted-foreground"><ClientTime value={event.happened_at} /></span></li>;
                })}</ul>}
            </CardContent>
        </Card>
    </main>;
}
