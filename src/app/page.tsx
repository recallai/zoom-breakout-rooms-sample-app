import { desc } from "drizzle-orm";
import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ClientTime } from "@/components/ClientTime";
import { MeetingForm } from "@/components/MeetingForm";
import { SessionBadge } from "@/components/MeetingViews";
import { db } from "@/db";
import { bots, meetings, rooms } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const [sessions, allBots, allRooms] = await Promise.all([
    db.select().from(meetings).orderBy(desc(meetings.created_at)),
    db.select().from(bots),
    db.select().from(rooms),
  ]);

  return (
    <AppShell>
      <MeetingForm />
      <section aria-label="Meeting sessions" className="grid gap-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Your meetings</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a session to manage its rooms and captures.
            </p>
          </div>
          <span className="text-sm text-muted-foreground">{sessions.length} sessions</span>
        </div>
        {!sessions.length && (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center">
            <h3 className="font-medium">Your first meeting starts here</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Paste a Zoom link above. Its rooms and recordings will live together in one session.
            </p>
          </div>
        )}
        {sessions.map((meeting) => {
          const sessionBots = allBots.filter((bot) => bot.meeting_id === meeting.id);
          const roomCount = allRooms.filter((room) => room.meeting_id === meeting.id).length;
          return (
            <Link
              key={meeting.id}
              href={`/meeting/${meeting.id}`}
              className="group flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary sm:p-6"
            >
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-semibold">{meeting.bot_name}</h3>
                  <SessionBadge stopped={!!meeting.stopped_at} bots={sessionBots} />
                </div>
                <p className="text-xs text-muted-foreground">
                  <ClientTime value={meeting.created_at} format="date" /> · Meeting{" "}
                  {new URL(meeting.meeting_url).pathname.split("/").pop()} ·{" "}
                  {meeting.main_mode === "auto_accept_all_invites"
                    ? "Follows host"
                    : "Stays in main room"}{" "}
                  · {meeting.transcribe ? "Transcription on" : "Recording only"}
                </p>
              </div>
              <div className="flex items-center gap-5 text-sm text-muted-foreground">
                <span>
                  {roomCount} {roomCount === 1 ? "room" : "rooms"} ·{" "}
                  {sessionBots.filter((bot) => bot.active).length} active bots
                </span>
                <ArrowUpRightIcon className="size-5 text-primary transition group-hover:-translate-y-0.5" />
              </div>
            </Link>
          );
        })}
      </section>
    </AppShell>
  );
}
