import { Badge } from "@/components/ui/Badge";
import { BotControls } from "@/components/BotControls";
import { ClientTime } from "@/components/ClientTime";
import type { BotType, EventType } from "@/db/schema";

export function BotStatus({ bot }: { bot: BotType }) {
    const failed = ["fatal", "create_failed", "creation_unknown", "stop_failed"].includes(bot.status);
    return <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={failed ? "destructive" : "secondary"} className={bot.active && bot.status === "in_call_recording" ? "bg-emerald-50 text-emerald-800" : ""}>{bot.status.replaceAll("_", " ")}</Badge>
        {bot.active && bot.location && <span className="font-medium text-emerald-800">In {bot.location}</span>}
        {bot.sub_code && <span className="text-muted-foreground">{bot.sub_code}</span>}
        {bot.stop_error && <span role="alert" className="text-destructive">{bot.stop_error}. Retry leaving this bot.</span>}
        {bot.active && bot.recall_id && (!bot.stop_requested || bot.stop_error) && <BotControls bot_id={bot.id} />}
        {bot.status === "creation_unknown" && <span className="text-destructive">Check the Recall dashboard before sending another bot.</span>}
    </div>;
}

export function SessionBadge({ stopped, bots }: { stopped: boolean; bots: BotType[] }) {
    const active = bots.some(bot => bot.active);
    return <Badge variant="outline" className={active && !stopped ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}>{stopped ? active ? "Stopping" : "Stopped" : active ? "Active" : "Finished"}</Badge>;
}

export function Stats({ items }: { items: { label: string; value: number | string }[] }) {
    return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{items.map(item => <div key={item.label} className="rounded-xl border bg-card px-5 py-4"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{item.value}</p></div>)}</div>;
}

export function WebhookActivity({ events, bots }: { events: EventType[]; bots: BotType[] }) {
    return <details className="rounded-xl border bg-card p-5"><summary className="cursor-pointer text-sm font-medium">Debug: webhook activity <span className="ml-2 font-normal text-muted-foreground">{events.length} events</span></summary>
        <p className="mt-3 text-xs text-muted-foreground">Latest 40 events for this page. The room timeline orders events by when they happened.</p>
        {!events.length ? <p className="mt-4 text-sm text-muted-foreground">No events received yet.</p> : <ul className="mt-3 max-h-96 divide-y overflow-auto">{events.slice(0, 40).map(event => <li key={event.id} className="flex flex-wrap justify-between gap-2 py-3"><div className="grid gap-1"><span className="font-mono text-xs">{event.event}</span><span className="text-xs text-muted-foreground">{bots.find(bot => bot.id === event.bot_id)?.name}{event.detail ? ` · ${event.detail}` : ""}</span></div><span className="text-xs text-muted-foreground"><ClientTime value={event.happened_at} /></span></li>)}</ul>}
    </details>;
}
