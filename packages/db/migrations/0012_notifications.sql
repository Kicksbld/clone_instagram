CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recipient_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"type" text NOT NULL,
	"post_id" uuid,
	"comment_id" uuid,
	"story_id" uuid,
	"group_key" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp (3) with time zone,
	CONSTRAINT "notifications_unique" UNIQUE NULLS NOT DISTINCT("recipient_id","actor_id","type","post_id","comment_id","story_id"),
	CONSTRAINT "notifications_type" CHECK ("notifications"."type" IN ('like', 'comment', 'comment_reply', 'follow')),
	CONSTRAINT "notifications_targets" CHECK ("notifications"."story_id" IS NULL AND CASE "notifications"."type"
        WHEN 'like' THEN "notifications"."post_id" IS NOT NULL AND "notifications"."comment_id" IS NULL
        WHEN 'comment' THEN "notifications"."post_id" IS NOT NULL AND "notifications"."comment_id" IS NOT NULL
        WHEN 'comment_reply' THEN "notifications"."post_id" IS NOT NULL AND "notifications"."comment_id" IS NOT NULL
        WHEN 'follow' THEN "notifications"."post_id" IS NULL AND "notifications"."comment_id" IS NULL
        ELSE false END),
	CONSTRAINT "notifications_not_self" CHECK ("notifications"."actor_id" <> "notifications"."recipient_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_profiles_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notifications" USING btree ("recipient_id","created_at" DESC NULLS LAST);