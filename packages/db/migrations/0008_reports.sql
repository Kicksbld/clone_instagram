CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reporter_id" uuid NOT NULL,
	"post_id" uuid,
	"comment_id" uuid,
	"story_id" uuid,
	"user_id" uuid,
	"message_id" uuid,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp (3) with time zone,
	"resolved_by" uuid,
	CONSTRAINT "reports_exactly_one_target" CHECK (num_nonnulls("reports"."post_id", "reports"."comment_id", "reports"."story_id", "reports"."user_id", "reports"."message_id") = 1),
	CONSTRAINT "reports_reason" CHECK ("reports"."reason" IN ('spam', 'nudity', 'harassment', 'violence', 'hate', 'other')),
	CONSTRAINT "reports_status" CHECK ("reports"."status" IN ('open', 'resolved_removed', 'resolved_dismissed')),
	CONSTRAINT "reports_details_length" CHECK (char_length("reports"."details") BETWEEN 1 AND 500)
);
--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_profiles_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);