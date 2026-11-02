CREATE TABLE `captures` (
	`id` text PRIMARY KEY NOT NULL,
	`bot_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`checked_at` integer,
	FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `bots` ADD `capture_error` text;--> statement-breakpoint
ALTER TABLE `bots` ADD `capture_checked_at` integer;--> statement-breakpoint
ALTER TABLE `meetings` ADD `transcribe` integer DEFAULT false NOT NULL;