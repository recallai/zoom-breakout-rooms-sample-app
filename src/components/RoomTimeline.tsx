import type { BotType, EventType, RoomType } from "@/db/schema";
import { build_room_timeline } from "@/lib/room_timeline";
import { ClientTime } from "@/components/ClientTime";
import { ElapsedTime } from "@/components/ElapsedTime";

export function RoomTimeline({ room, bots, events }: { room: RoomType; bots: BotType[]; events: EventType[] }) {
    const entries = build_room_timeline(room, bots, events);
    const waiting = bots.filter((bot) => bot.active && bot.recall_id && bot.location_id !== room.room_id && bot.status !== "leaving");
    return <div className="grid gap-2">
        <h4 className="font-medium">Room timeline</h4>
        {waiting.map((bot) => <p key={bot.id} className="text-xs text-muted-foreground">
            {bot.name}: awaiting room-entry confirmation · <ElapsedTime since={bot.created_at} /> since dispatch.
            {bot.status === "in_call_recording" && " Recording in the meeting does not confirm entry into this room."}
        </p>)}
        {!entries.length && <p className="text-xs text-muted-foreground">No saved timeline events for this room yet.</p>}
        <ol className="grid gap-3 border-l pl-4 text-xs">{entries.map((entry) => <li key={entry.id}>
            <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{entry.label}</span>
                <span className="text-muted-foreground" title={new Date(entry.at).toISOString()}><ClientTime value={entry.at} /></span></div>
            <p className="text-muted-foreground">{entry.bot}{entry.detail ? ` · ${entry.detail}` : ""}</p>
        </li>)}</ol>
    </div>;
}
