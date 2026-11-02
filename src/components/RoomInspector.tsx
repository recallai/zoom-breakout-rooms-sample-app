import { RoomTimeline } from "@/components/RoomTimeline";
import type { BotType, EventType, RoomType } from "@/db/schema";

function JsonBlock({ value }: { value: string | null | undefined }) {
    return value
        ? <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(JSON.parse(value), null, 2)}</pre>
        : <p className="text-xs text-muted-foreground">Not saved for this older session.</p>;
}

/** Native disclosure keeps this reference view small and usable without client-side state. */
export function RoomInspector({ room, bots, source, region, events, showTimeline = true }: {
    room: RoomType; bots: BotType[]; source?: EventType; region: string; events: EventType[]; showTimeline?: boolean;
}) {
    return <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Inspect this room</summary>
        <div className="mt-4 grid min-w-0 gap-4">
            <p className="break-all text-xs text-muted-foreground">Session: {room.meeting_id}<br />Recall room ID: {room.room_id}</p>
            {showTimeline && <RoomTimeline room={room} bots={bots} events={events} />}
            <div className="grid gap-2"><h4 className="font-medium">Room discovery webhook</h4>
                {source && <p className="break-all text-xs text-muted-foreground">{source.event} · Delivery {source.id}</p>}
                <JsonBlock value={source?.payload} />
            </div>
            {!bots.length && <p className="text-muted-foreground">No bot has been dispatched to this room.</p>}
            {bots.map((bot) => <div key={bot.id} className="grid min-w-0 gap-2 border-t pt-3">
                <h4 className="font-medium">{bot.name}</h4>
                <dl className="grid gap-1 text-xs">
                    <div><dt className="inline font-medium">Requested room: </dt><dd className="inline break-all">{room.name} ({bot.room_id})</dd></div>
                    <div><dt className="inline font-medium">Confirmed location: </dt><dd className="inline break-all">{!bot.active ? "Bot finished" : bot.status === "queued" ? "Queued for dispatch" : bot.location ? `${bot.location} (${bot.location_id ?? "ID not saved"})` : "Awaiting room-entry confirmation"}</dd></div>
                    <div><dt className="inline font-medium">Bot status: </dt><dd className="inline">{bot.status.replaceAll("_", " ")}</dd></div>
                    <div><dt className="inline font-medium">Exit / failure reason: </dt><dd className="inline">{bot.sub_code ?? "None reported"}</dd></div>
                    <div><dt className="inline font-medium">Local bot ID: </dt><dd className="inline break-all">{bot.id}</dd></div>
                    <div><dt className="inline font-medium">Recall bot ID: </dt><dd className="inline break-all">{bot.recall_id ?? "Not confirmed yet"}</dd></div>
                </dl>
                {bot.recall_id && <a className="text-xs underline" href={`https://${region}.recall.ai/dashboard/explorer/bot/${bot.recall_id}`} target="_blank" rel="noreferrer">Open bot in Recall ↗</a>}
                <h4 className="font-medium">Create Bot request</h4>
                <JsonBlock value={bot.create_payload} />
            </div>)}
        </div>
    </details>;
}
