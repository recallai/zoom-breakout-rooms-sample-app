ALTER TABLE `bots` ADD `stop_requested` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bots` ADD `stop_error` text;--> statement-breakpoint
ALTER TABLE `meetings` ADD `stopped_at` integer;