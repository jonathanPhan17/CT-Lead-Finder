export type OutreachStatus =
  | 'no_reply'
  | 'replied'
  | 'interested'
  | 'not_interested'
  | 'wrong_contact';

export interface OutreachRecord {
  pk:           string;        // "default" (shared) or userId
  sk:           string;        // ulid — sortable record ID
  id:           string;        // same as sk, exposed to frontend
  sentAt:       string;        // ISO date
  contactName:  string;
  contactEmail: string;
  nctId:        string;
  trialTitle:   string;
  facility:     string;
  subject:      string;
  bodyPreview:  string;
  status:       OutreachStatus;
  notes:        string;
  replySubject?:    string;
  replyBody?:       string;
  replyReceivedAt?: string;
}

// Shape returned to the frontend (no pk/sk internals)
export type OutreachRecordPublic = Omit<OutreachRecord, 'pk' | 'sk'>;
