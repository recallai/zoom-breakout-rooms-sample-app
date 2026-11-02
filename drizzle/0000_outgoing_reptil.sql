CREATE TABLE `bots` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`recall_id` text,
	`room_id` text,
	`name` text NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`sub_code` text,
	`active` integer DEFAULT true NOT NULL,
	`status_at` integer DEFAULT 0 NOT NULL,
	`location` text,
	`location_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bots_recall_id_unique` ON `bots` (`recall_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_bot_per_room` ON `bots` (`meeting_id`,`room_id`) WHERE "bots"."active" = 1;--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`bot_id` text NOT NULL,
	`event` text NOT NULL,
	`detail` text,
	`happened_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_url` text NOT NULL,
	`bot_name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`key` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`open` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE no action
);
