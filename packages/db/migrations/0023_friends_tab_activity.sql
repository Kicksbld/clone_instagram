ALTER TABLE "profiles" ADD COLUMN "friends_tab_activity" text DEFAULT 'mutuals' NOT NULL;--> statement-breakpoint
CREATE INDEX "comments_author_created_idx" ON "comments" USING btree ("author_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "post_likes_user_created_idx" ON "post_likes" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_friends_tab_activity" CHECK ("profiles"."friends_tab_activity" IN ('mutuals', 'nobody'));