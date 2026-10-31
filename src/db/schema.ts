import { pgTable, uuid, text, timestamp, boolean, real, integer, jsonb, vector, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { EMBED_DIM } from '@/domain/constants';
import type { EvidenceStatus, ReviewDecision, Topic, TicketStatus, Urgency } from '@/domain/types';

const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  plan: text('plan').notNull(),
  accountNotes: text('account_notes').notNull().default(''),
}, (t) => [uniqueIndex('customers_tenant_email_uq').on(t.tenantId, t.email)]);

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  customerId: uuid('customer_id').references(() => customers.id),
  messageId: text('message_id').notNull(),
  fromEmail: text('from_email').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  receivedAt: ts('received_at'),
  status: text('status').$type<TicketStatus>().notNull().default('received'),
  failureReason: text('failure_reason'),
  needsHuman: boolean('needs_human').notNull().default(false),
  needsHumanReasons: jsonb('needs_human_reasons').$type<string[]>().notNull().default([]),
  injectionSuspected: boolean('injection_suspected').notNull().default(false),
  source: text('source').notNull().default('synthetic'),
}, (t) => [
  uniqueIndex('tickets_tenant_message_uq').on(t.tenantId, t.messageId),
  index('tickets_tenant_status_idx').on(t.tenantId, t.status),
]);

export const classifications = pgTable('classifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id),
  topic: text('topic').$type<Topic>().notNull(),
  urgency: text('urgency').$type<Urgency>().notNull(),
  confidence: real('confidence').notNull(),
  reasons: jsonb('reasons').$type<string[]>().notNull().default([]),
  valid: boolean('valid').notNull(),
  promptVersion: text('prompt_version').notNull(),
  model: text('model').notNull(),
  createdAt: ts('created_at'),
}, (t) => [index('classifications_ticket_idx').on(t.ticketId)]);

export const kbChunks = pgTable('kb_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  docId: text('doc_id').notNull(),
  title: text('title').notNull(),
  section: text('section').notNull(),
  version: text('version').notNull(),
  text: text('text').notNull(),
  published: boolean('published').notNull().default(true),
  embedding: vector('embedding', { dimensions: EMBED_DIM }).notNull(),
}, (t) => [index('kb_chunks_tenant_idx').on(t.tenantId)]);

export const drafts = pgTable('drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id),
  body: text('body').notNull(),
  citedChunkIds: jsonb('cited_chunk_ids').$type<string[]>().notNull().default([]),
  evidenceStatus: text('evidence_status').$type<EvidenceStatus>().notNull(),
  unsupportedPoints: jsonb('unsupported_points').$type<string[]>().notNull().default([]),
  isPlaceholder: boolean('is_placeholder').notNull().default(false),
  createdAt: ts('created_at'),
}, (t) => [index('drafts_ticket_idx').on(t.ticketId)]);

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  draftId: uuid('draft_id').notNull().references(() => drafts.id),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id),
  reviewer: text('reviewer').notNull(),
  decision: text('decision').$type<ReviewDecision>().notNull(),
  finalBody: text('final_body'),
  rejectReason: text('reject_reason'),
  createdAt: ts('created_at'),
});

export const outboundMessages = pgTable('outbound_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id),
  // The approval gate: no outbound row can exist without a review.
  reviewId: uuid('review_id').notNull().references(() => reviews.id),
  idempotencyKey: text('idempotency_key').notNull(),
  deliveryMode: text('delivery_mode').notNull().default('mock'),
  toEmail: text('to_email').notNull(),
  body: text('body').notNull(),
  result: text('result').notNull(),
  sentAt: ts('sent_at'),
}, (t) => [uniqueIndex('outbound_idem_uq').on(t.idempotencyKey)]);

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  ticketId: uuid('ticket_id'),
  runId: text('run_id').notNull(),
  step: text('step').notNull(),
  outcome: text('outcome').notNull(),
  durationMs: integer('duration_ms').notNull().default(0),
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ts('created_at'),
}, (t) => [index('audit_ticket_idx').on(t.ticketId)]);
