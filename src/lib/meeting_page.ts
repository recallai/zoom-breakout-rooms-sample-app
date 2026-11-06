import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { bots, captures, events, meetings, rooms } from "@/db/schema";

export async function get_meeting_page(id: string) {
  if (!z.string().uuid().safeParse(id).success) notFound();

  const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, id) });
  if (!meeting) notFound();

  const [sessionBots, sessionRooms, activity, recordingRows] = await Promise.all([
    db.select().from(bots).where(eq(bots.meeting_id, id)).orderBy(desc(bots.created_at)),
    db.select().from(rooms).where(eq(rooms.meeting_id, id)).orderBy(rooms.name),
    db.select().from(events).where(eq(events.meeting_id, id)).orderBy(desc(events.happened_at)),
    db
      .select({ capture: captures })
      .from(captures)
      .innerJoin(bots, eq(captures.bot_id, bots.id))
      .where(eq(bots.meeting_id, id)),
  ]);

  return {
    meeting,
    sessionBots,
    sessionRooms,
    activity,
    recordingRows: recordingRows.map((row) => row.capture),
  };
}
