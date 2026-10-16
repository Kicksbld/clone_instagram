CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_log_action" CHECK ("admin_audit_log"."action" IN ('user_suspended', 'user_banned', 'user_reactivated', 'user_deleted')),
	CONSTRAINT "admin_audit_log_target_type" CHECK ("admin_audit_log"."target_type" IN ('user'))
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_pkey" PRIMARY KEY("user_id","role"),
	CONSTRAINT "admin_roles_role" CHECK ("admin_roles"."role" IN ('admin'))
);
--> statement-breakpoint
ALTER TABLE "admin_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "admin_audit_log_target_idx" ON "admin_audit_log" USING btree ("target_type","target_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- Journal d'audit en écriture seule (ADR-011) : toute modification ou suppression d'une ligne est refusée.
CREATE FUNCTION "admin_audit_log_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'admin_audit_log est en écriture seule';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "admin_audit_log_append_only" BEFORE UPDATE OR DELETE ON "admin_audit_log" FOR EACH ROW EXECUTE FUNCTION "admin_audit_log_append_only"();
