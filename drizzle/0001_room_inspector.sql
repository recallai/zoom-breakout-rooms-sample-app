ALTER TABLE `bots` ADD `create_payload` text;--> statement-breakpoint
ALTER TABLE `bots` ADD `location_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `payload` text;--> statement-breakpoint
ALTER TABLE `rooms` ADD `source_event_id` text;