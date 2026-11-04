ALTER TABLE "messages" DROP CONSTRAINT "messages_kind_fields";--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_kind_fields" CHECK (("messages"."story_id" IS NULL AND (
        ("messages"."kind" = 'text' AND char_length("messages"."body") BETWEEN 1 AND 1000 AND "messages"."media_id" IS NULL AND "messages"."shared_post_id" IS NULL)
        OR ("messages"."kind" = 'image' AND char_length("messages"."body") <= 1000 AND "messages"."media_id" IS NOT NULL AND "messages"."shared_post_id" IS NULL)
        OR ("messages"."kind" = 'post_share' AND char_length("messages"."body") <= 1000 AND "messages"."media_id" IS NULL AND "messages"."shared_post_id" IS NOT NULL)
      )) OR ("messages"."kind" = 'story_reply' AND char_length("messages"."body") BETWEEN 1 AND 1000 AND "messages"."media_id" IS NULL AND "messages"."shared_post_id" IS NULL AND "messages"."story_id" IS NOT NULL));