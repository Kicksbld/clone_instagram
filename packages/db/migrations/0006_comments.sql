CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"parent_id" uuid,
	"body" text NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "comments_body_length" CHECK (char_length("comments"."body") BETWEEN 1 AND 2200),
	CONSTRAINT "comments_counts_positive" CHECK ("comments"."like_count" >= 0 AND "comments"."reply_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_post_created_idx" ON "comments" USING btree ("post_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "comments"."parent_id" IS NULL AND "comments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "comments_parent_created_idx" ON "comments" USING btree ("parent_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "comments"."parent_id" IS NOT NULL AND "comments"."deleted_at" IS NULL;