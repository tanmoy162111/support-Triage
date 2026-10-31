// All content below is synthetic (mock) help-center text.
export interface KbSeed { docId: string; title: string; section: string; version: string; text: string; published?: boolean }

export const KB_SEED: KbSeed[] = [
  { docId: 'reset-password', title: 'Reset your password', section: 'Steps', version: '2', text: 'To reset your password, open the login page and select the Forgot password link. Enter your account email and we will send a reset link that is valid for 24 hours.' },
  { docId: 'reset-password', title: 'Reset your password', section: 'Troubleshooting', version: '2', text: 'If the reset email does not arrive, check your spam folder and confirm you used the email address on your account. Reset emails can take up to 10 minutes to arrive.' },
  { docId: 'two-factor', title: 'Two-factor authentication', section: 'Lost device', version: '1', text: 'If you lose the device used for two-factor authentication, use one of your saved recovery codes on the login page. Without a recovery code, support must verify your identity before disabling two-factor.' },
  { docId: 'billing-invoices', title: 'Invoices and receipts', section: 'Downloading', version: '1', text: 'Invoices are available under Settings, then Billing, then Invoice history. Select any invoice to download a PDF copy.' },
  { docId: 'billing-charges', title: 'Understanding your charges', section: 'Renewals', version: '1', text: 'Subscriptions renew automatically on the same day each billing period. A renewal charge appears on the card on file and an email receipt is sent to the billing contact.' },
  { docId: 'refund-policy', title: 'Refund policy', section: 'Eligibility', version: '3', text: 'Annual plans can be refunded within 14 days of purchase. Monthly plans are not refundable, but you can cancel at any time to stop future charges.' },
  { docId: 'cancel-subscription', title: 'Cancel your subscription', section: 'How to cancel', version: '2', text: 'Owners can cancel under Settings, then Billing, then Cancel plan. Access continues until the end of the current billing period.' },
  { docId: 'shipping-times', title: 'Shipping times', section: 'Standard delivery', version: '1', text: 'Standard delivery takes 3 to 5 business days. A tracking link is emailed once the parcel ships.' },
  { docId: 'shipping-damaged', title: 'Damaged or missing parcels', section: 'Reporting', version: '1', text: 'If a parcel arrives damaged or does not arrive, reply with your order number and a photo of the damage. Support will review the report.' },
  { docId: 'export-data', title: 'Exporting your data', section: 'Limits', version: '1', text: 'You can export your workspace data as CSV from Settings, then Data. Exports are available for download for 30 days.' },
  { docId: 'export-data', title: 'Exporting your data', section: 'Limits', version: '2', text: 'You can export your workspace data as CSV from Settings, then Data. Exports are available for download for 60 days.' },
  { docId: 'invite-teammates', title: 'Invite teammates', section: 'Steps', version: '1', text: 'Admins can invite teammates from Settings, then Members, then Invite. Invited users receive an email link to join the workspace.' },
  { docId: 'integrations-slack', title: 'Connect Slack', section: 'Setup', version: '1', text: 'To connect Slack, open Settings, then Integrations, select Slack and choose Authorize. Choose the channel that should receive notifications.' },
  { docId: 'app-errors', title: 'Fixing sync errors', section: 'Common fixes', version: '1', text: 'If the app shows a sync error, sign out and back in, then check the status page for incidents. If the error persists, send support the time it happened and a screenshot.' },
  { docId: 'app-slow', title: 'App performance', section: 'Slow loading', version: '1', text: 'If pages load slowly, try a hard refresh, disable browser extensions and confirm you are on a current browser version.' },
  { docId: 'update-billing-email', title: 'Change the billing contact', section: 'Steps', version: '1', text: 'Owners can change the billing contact under Settings, then Billing, then Contact. Receipts are sent to the new address from the next renewal.' },
];
