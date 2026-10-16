ALTER TABLE "admin_audit_log" DROP CONSTRAINT "admin_audit_log_action";--> statement-breakpoint
ALTER TABLE "admin_audit_log" DROP CONSTRAINT "admin_audit_log_target_type";--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_resolved_by_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "resolution_note" text;--> statement-breakpoint
CREATE INDEX "reports_open_post_idx" ON "reports" USING btree ("post_id") WHERE "reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "reports_open_comment_idx" ON "reports" USING btree ("comment_id") WHERE "reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "reports_open_user_idx" ON "reports" USING btree ("user_id") WHERE "reports"."status" = 'open';--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_action" CHECK ("admin_audit_log"."action" IN ('user_suspended', 'user_banned', 'user_reactivated', 'user_deleted', 'post_removed', 'comment_removed', 'reports_dismissed'));--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_type" CHECK ("admin_audit_log"."target_type" IN ('user', 'post', 'comment'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolution_note_length" CHECK (char_length("reports"."resolution_note") BETWEEN 1 AND 500);