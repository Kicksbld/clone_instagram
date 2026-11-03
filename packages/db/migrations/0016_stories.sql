CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"author_id" uuid NOT NULL,
	"media_id" uuid,
	"audience" text NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "stories_media_id_key" UNIQUE("media_id"),
	CONSTRAINT "stories_audience" CHECK ("stories"."audience" IN ('everyone', 'close_friends')),
	CONSTRAINT "stories_view_count_positive" CHECK ("stories"."view_count" >= 0),
	CONSTRAINT "stories_expires_after_created" CHECK ("stories"."expires_at" > "stories"."created_at"),
	CONSTRAINT "stories_media_until_deleted" CHECK ("stories"."deleted_at" IS NOT NULL OR "stories"."media_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "stories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "story_views" (
	"story_id" uuid NOT NULL,
	"viewer_id" uuid NOT NULL,
	"viewed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_views_pkey" PRIMARY KEY("story_id","viewer_id")
);
--> statement-breakpoint
ALTER TABLE "story_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_viewer_id_profiles_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stories_author_expires_idx" ON "stories" USING btree ("author_id","expires_at");--> statement-breakpoint
CREATE INDEX "story_views_viewer_id_idx" ON "story_views" USING btree ("viewer_id");