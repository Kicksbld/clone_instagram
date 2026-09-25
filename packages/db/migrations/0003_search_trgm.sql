-- Extension de recherche par trigrammes (ADR-005, ADR-007) : drizzle-kit ne génère pas les extensions.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "profiles_username_trgm_idx" ON "profiles" USING gin ("username" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "profiles_full_name_trgm_idx" ON "profiles" USING gin ("full_name" gin_trgm_ops);