DROP INDEX "classifications_ticket_idx";--> statement-breakpoint
DROP INDEX "drafts_ticket_idx";--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "processing_started_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "classifications_ticket_uq" ON "classifications" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drafts_ticket_uq" ON "drafts" USING btree ("ticket_id");