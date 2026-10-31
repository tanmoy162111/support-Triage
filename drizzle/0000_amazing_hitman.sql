CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"ticket_id" uuid,
	"run_id" text NOT NULL,
	"step" text NOT NULL,
	"outcome" text NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"ticket_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"urgency" text NOT NULL,
	"confidence" real NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"valid" boolean NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"plan" text NOT NULL,
	"account_notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"ticket_id" uuid NOT NULL,
	"body" text NOT NULL,
	"cited_chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_status" text NOT NULL,
	"unsupported_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_placeholder" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"doc_id" text NOT NULL,
	"title" text NOT NULL,
	"section" text NOT NULL,
	"version" text NOT NULL,
	"text" text NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"embedding" vector(1536) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"ticket_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"delivery_mode" text DEFAULT 'mock' NOT NULL,
	"to_email" text NOT NULL,
	"body" text NOT NULL,
	"result" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"draft_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"reviewer" text NOT NULL,
	"decision" text NOT NULL,
	"final_body" text,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"customer_id" uuid,
	"message_id" text NOT NULL,
	"from_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"failure_reason" text,
	"needs_human" boolean DEFAULT false NOT NULL,
	"needs_human_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"injection_suspected" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'synthetic' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classifications" ADD CONSTRAINT "classifications_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_ticket_idx" ON "audit_events" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "classifications_ticket_idx" ON "classifications" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_email_uq" ON "customers" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "drafts_ticket_idx" ON "drafts" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "kb_chunks_tenant_idx" ON "kb_chunks" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_idem_uq" ON "outbound_messages" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_tenant_message_uq" ON "tickets" USING btree ("tenant_id","message_id");--> statement-breakpoint
CREATE INDEX "tickets_tenant_status_idx" ON "tickets" USING btree ("tenant_id","status");