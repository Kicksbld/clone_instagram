CREATE TABLE "mentions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mentioned_user_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"post_id" uuid,
	"comment_id" uuid,
	"story_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentions_unique" UNIQUE NULLS NOT DISTINCT("mentioned_user_id","post_id","comment_id","story_id"),
	CONSTRAINT "mentions_one_target" CHECK (num_nonnulls("mentions"."post_id", "mentions"."comment_id", "mentions"."story_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "mentions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_targets";--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentioned_user_id_profiles_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentions_post_idx" ON "mentions" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "mentions_comment_idx" ON "mentions" USING btree ("comment_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type" CHECK ("notifications"."type" IN ('mention', 'like', 'comment', 'comment_reply', 'follow', 'follow_request', 'follow_accepted'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_targets" CHECK ("notifications"."story_id" IS NULL AND CASE "notifications"."type"
        WHEN 'mention' THEN "notifications"."post_id" IS NOT NULL
        WHEN 'like' THEN "notifications"."post_id" IS NOT NULL AND "notifications"."comment_id" IS NULL
        WHEN 'comment' THEN "notifications"."post_id" IS NOT NULL AND "notifications"."comment_id" IS NOT NULL
        WHEN 'comment_reply' THEN "notifications"."post_id" IS NOT NULL AND "notifications"."comment_id" IS NOT NULL
        WHEN 'follow' THEN "notifications"."post_id" IS NULL AND "notifications"."comment_id" IS NULL
        WHEN 'follow_request' THEN "notifications"."post_id" IS NULL AND "notifications"."comment_id" IS NULL
        WHEN 'follow_accepted' THEN "notifications"."post_id" IS NULL AND "notifications"."comment_id" IS NULL
        ELSE false END);