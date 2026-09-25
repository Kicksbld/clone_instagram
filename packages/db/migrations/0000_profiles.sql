CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"full_name" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"birth_date" date NOT NULL,
	"avatar_media_id" uuid,
	"is_private" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"following_count" integer DEFAULT 0 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_username_format" CHECK ("profiles"."username" ~ '^[a-z0-9._]{1,30}$'),
	CONSTRAINT "profiles_full_name_length" CHECK (char_length("profiles"."full_name") BETWEEN 1 AND 30 AND "profiles"."full_name" ~ '\S'),
	CONSTRAINT "profiles_bio_length" CHECK (char_length("profiles"."bio") <= 150),
	CONSTRAINT "profiles_status" CHECK ("profiles"."status" IN ('active', 'suspended', 'banned')),
	CONSTRAINT "profiles_counts_positive" CHECK ("profiles"."follower_count" >= 0 AND "profiles"."following_count" >= 0 AND "profiles"."post_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_username_key" ON "profiles" USING btree ("username");