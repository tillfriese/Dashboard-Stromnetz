ALTER TYPE "public"."registration_purpose" ADD VALUE 'signup';--> statement-breakpoint
-- Saved views become private: the former public views have no owner and are removed.
DELETE FROM "saved_views";--> statement-breakpoint
ALTER TABLE "saved_views" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
-- All accounts so far came from the first-run setup or admin invitations.
UPDATE "user" SET "role" = 'admin';--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_views_user_idx" ON "saved_views" USING btree ("user_id","created_at" DESC NULLS LAST);