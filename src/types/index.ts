export type OutreachStatus = 'no_reply' | 'replied' | 'interested' | 'not_interested' | 'wrong_contact';

/** One sent email, as stored by the outreach history service. */
export interface OutreachRecord {
  id: string;
  sentAt: string;
  contactName: string;
  contactEmail: string;
  nctId: string;
  trialTitle: string;
  facility: string;
  subject: string;
  bodyPreview: string;
  status: OutreachStatus;
  notes: string;
}
