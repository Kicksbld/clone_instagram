CREATE TABLE "subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"entitlement" text DEFAULT 'plus' NOT NULL,
	"status" text NOT NULL,
	"product_id" text NOT NULL,
	"expires_at" timestamp (3) with time zone,
	"refreshed_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_entitlement" CHECK ("subscriptions"."entitlement" = 'plus'),
	CONSTRAINT "subscriptions_status" CHECK ("subscriptions"."status" IN ('active', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;