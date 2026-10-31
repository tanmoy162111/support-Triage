export const EMBED_DIM = 1536;
export const FREE_MAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me'] as const;

/** A refund/cancellation reply must cite one of these help docs, otherwise it is flagged for a human. */
export const REFUND_POLICY_DOC_IDS: readonly string[] = ['refund-policy', 'cancel-subscription'];
