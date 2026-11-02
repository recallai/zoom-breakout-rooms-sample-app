import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const meetings = sqliteTable("meetings", {
    id: text("id").primaryKey(),
    meeting_url: text("meeting_url").notNull(),
    bot_name: text("bot_name").notNull(),
    created_at: integer("created_at").notNull(),
});

export const bots = sqliteTable("bots", {
    id: text("id").primaryKey(),
    meeting_id: text("meeting_id").notNull().references(() => meetings.id),
    recall_id: text("recall_id").unique(),
    room_id: text("room_id"), // null means the main room
    name: text("name").notNull(),
    status: text("status").notNull().default("creating"),
    sub_code: text("sub_code"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    status_at: integer("status_at").notNull().default(0),
    create_payload: text("create_payload"),
    location_id: text("location_id"),
    location: text("location"),
    location_at: integer("location_at").notNull().default(0),
    created_at: integer("created_at").notNull(),
}, (table) => [
    // Reserve the room before the API call, including across concurrent requests.
    uniqueIndex("one_active_bot_per_room").on(table.meeting_id, table.room_id).where(sql`${table.active} = 1`),
]);

export const rooms = sqliteTable("rooms", {
    key: text("key").primaryKey(), // meeting_id:Recall room_id; never a Zoom internal ID
    meeting_id: text("meeting_id").notNull().references(() => meetings.id),
    room_id: text("room_id").notNull(),
    name: text("name").notNull(),
    open: integer("open", { mode: "boolean" }).notNull(),
    source_event_id: text("source_event_id"),
    updated_at: integer("updated_at").notNull(),
});

export const events = sqliteTable("events", {
    id: text("id").primaryKey(), // webhook delivery ID, for deduplication
    meeting_id: text("meeting_id").notNull().references(() => meetings.id),
    bot_id: text("bot_id").notNull(),
    event: text("event").notNull(),
    detail: text("detail"),
    payload: text("payload"),
    happened_at: integer("happened_at").notNull(),
    received_at: integer("received_at").notNull(),
});

export type MeetingType = typeof meetings.$inferSelect;
export type BotType = typeof bots.$inferSelect;
export type RoomType = typeof rooms.$inferSelect;

export type EventType = typeof events.$inferSelect;
