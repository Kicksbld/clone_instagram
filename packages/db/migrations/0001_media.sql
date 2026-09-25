CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending_upload' NOT NULL,
	"original_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"variants" jsonb,
	"failure_reason" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp (3) with time zone,
	"attached_at" timestamp (3) with time zone,
	"detached_at" timestamp (3) with time zone,
	CONSTRAINT "media_kind" CHECK ("media"."kind" IN ('image', 'video')),
	CONSTRAINT "media_purpose" CHECK ("media"."purpose" IN ('post', 'story', 'avatar', 'message', 'instant')),
	CONSTRAINT "media_status" CHECK ("media"."status" IN ('pending_upload', 'uploaded', 'processing', 'ready', 'failed')),
	CONSTRAINT "media_failure_reason" CHECK ("media"."failure_reason" IS NULL OR ("media"."status" = 'failed' AND "media"."failure_reason" IN ('invalid_image', 'file_too_large', 'processing_error'))),
	CONSTRAINT "media_size_positive" CHECK ("media"."size_bytes" > 0),
	CONSTRAINT "media_detached_after_attached" CHECK ("media"."detached_at" IS NULL OR "media"."attached_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_owner_id_idx" ON "media" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "media_unattached_idx" ON "media" USING btree ("created_at") WHERE "media"."attached_at" IS NULL;--> statement-breakpoint
CREATE INDEX "media_detached_idx" ON "media" USING btree ("detached_at") WHERE "media"."detached_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_avatar_media_id_media_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;