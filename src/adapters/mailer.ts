export interface OutgoingEmail { to: string; subject: string; body: string; idempotencyKey: string }
export interface SendResult { mode: 'mock'; id: string }

export interface Mailer {
  send(email: OutgoingEmail): Promise<SendResult>;
}

/** Records nothing and contacts nobody. Every result is labelled `mock`. */
export class MockMailer implements Mailer {
  readonly sent: OutgoingEmail[] = [];
  async send(email: OutgoingEmail): Promise<SendResult> {
    this.sent.push(email);
    return { mode: 'mock', id: `mock-${email.idempotencyKey}` };
  }
}
