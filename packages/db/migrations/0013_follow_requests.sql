CREATE TABLE "follow_requests" (
	"requester_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_requests_pkey" PRIMARY KEY("requester_id","target_id"),
	CONSTRAINT "follow_requests_not_self" CHECK ("follow_requests"."requester_id" <> "follow_requests"."target_id")
);
--> statement-breakpoint
ALTER TABLE "follow_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_targets";--> statement-breakpoint
ALTER TABLE "follow_requests" ADD CONSTRAINT "follow_requests_requester_id_profiles_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_requests" ADD CONSTRAINT "follow_requests_target_id_profiles_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_requests_target_created_idx" ON "follow_requests" USING btree ("target_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type" CHECK ("notifications"."type" IN ('like', 'comment', 'comment_reply', 'follow', 'follow_request', 'follow_accepted'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_targets" CHECK ("notifications"."story_id" IS NULL AND CASE "notifications"."type"
        WHEN 'like' THEN "notifications"."post_id" IS NOT NULL AND "notifications"."comment_id" IS NULL
        WHEN 'comment' THEN "notifications"."post_id" IS NOT NULL AND "notifications"."comment_id" IS NOT NULL
        WHEN 'comment_reply' THEN "notifications"."post_id" IS NOT NULL AND "notifications"."comment_id" IS NOT NULL
        WHEN 'follow' THEN "notifications"."post_id" IS NULL AND "notifications"."comment_id" IS NULL
        WHEN 'follow_request' THEN "notifications"."post_id" IS NULL AND "notifications"."comment_id" IS NULL
        WHEN 'follow_accepted' THEN "notifications"."post_id" IS NULL AND "notifications"."comment_id" IS NULL
        ELSE false END);