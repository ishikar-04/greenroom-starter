CREATE TABLE `deal_notes_history` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`pasted_text` text NOT NULL,
	`mode_used` text NOT NULL,
	`pasted_at` integer NOT NULL,
	`extraction_snapshot_json` text,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `deals` ADD `extraction_json` text;--> statement-breakpoint
ALTER TABLE `deals` ADD `ambiguity_flags_json` text;