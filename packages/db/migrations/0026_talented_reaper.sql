ALTER TABLE "post_media" ADD COLUMN "alt_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "alt_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_alt_text_length" CHECK (char_length("post_media"."alt_text") <= 1000);--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_alt_text_length" CHECK (char_length("stories"."alt_text") <= 1000);