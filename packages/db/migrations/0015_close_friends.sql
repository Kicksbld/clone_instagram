CREATE TABLE "close_friends" (
	"owner_id" uuid NOT NULL,
	"friend_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "close_friends_pkey" PRIMARY KEY("owner_id","friend_id"),
	CONSTRAINT "close_friends_not_self" CHECK ("close_friends"."owner_id" <> "close_friends"."friend_id")
);
--> statement-breakpoint
ALTER TABLE "close_friends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "close_friends" ADD CONSTRAINT "close_friends_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "close_friends" ADD CONSTRAINT "close_friends_friend_id_profiles_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "close_friends_owner_created_idx" ON "close_friends" USING btree ("owner_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "close_friends_friend_id_idx" ON "close_friends" USING btree ("friend_id");