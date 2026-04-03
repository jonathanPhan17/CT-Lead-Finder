import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Mail, Send, Loader2, Check, AlertCircle, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ContactRow, OutreachRecord } from '../types';
import { loadGisScript, requestGmailToken, sendGmailMessage } from '../services/gmail';
import { saveRecord, getContactedEmails } from '../services/outreachHistory';

// ── constants ──────────────────────────────────────────────────────────────────

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SEND_DELAY_MS = 300; // throttle between sends

const DEFAULT_SUBJECT = 'Collaboration Opportunity – {{trialTitle}}';
const DEFAULT_BODY =
`Hi {{firstName}},

I came across your recruiting clinical trial "{{trialTitle}}" at {{facility}} and wanted to reach out about a potential collaboration opportunity.

[Your message here]

Best regards,
[Your name]`;

const VARIABLES: { key: string; label: string }[] = [
  { key: 'firstName',   label: 'First name' },
  { key: 'fullName',    label: 'Full name' },
  { key: 'trialTitle',  label: 'Trial title' },
  { key: 'condition',   label: 'Condition' },
  { key: 'facility',    label: 'Facility' },
  { key: 'nctId',       label: 'NCT ID' },
  { key: 'phase',       label: 'Phase' },
];

// ── helpers ────────────────────────────────────────────────────────────────────

function extractFirstName(fullName: string): string {
  if (!fullName) return '';

  // Strip credentials after comma: "Jennifer Ligibel, MD, PhD" → "Jennifer Ligibel"
  const withoutCredentials = fullName.split(',')[0].trim();

  // Strip common titles: Dr., Prof., Mr., Mrs., Ms.
  const cleaned = withoutCredentials.replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s+/i, '').trim();

  // Return first word (first name)
  return cleaned.split(' ')[0] ?? fullName;
}

function applyVariables(template: string, contact: ContactRow, on: boolean): string {
  if (!on) return template;
  const firstName = extractFirstName(contact.contactName);
  const condition = contact.conditions.split(',')[0].trim();
  return template
    .replace(/\{\{firstName\}\}/g,  firstName || contact.contactName)
    .replace(/\{\{fullName\}\}/g,   contact.contactName)
    .replace(/\{\{trialTitle\}\}/g, contact.studyTitle)
    .replace(/\{\{condition\}\}/g,  condition)
    .replace(/\{\{facility\}\}/g,   contact.facility)
    .replace(/\{\{nctId\}\}/g,      contact.nctId)
    .replace(/\{\{phase\}\}/g,      contact.phase);
}

function insertAtCursor(
  ref: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
  text: string,
  setter: (v: string) => void,
) {
  const el = ref.current;
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end   = el.selectionEnd   ?? el.value.length;
  const newVal = el.value.slice(0, start) + text + el.value.slice(end);
  setter(newVal);
  // Restore cursor after the inserted text
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
  });
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ── send result tracking ───────────────────────────────────────────────────────

type SendStatus = 'pending' | 'sending' | 'sent' | 'error' | 'skipped';

interface SendResult {
  contact: ContactRow;
  status: SendStatus;
  error?: string;
}

// ── component ──────────────────────────────────────────────────────────────────

interface Props {
  contacts: ContactRow[];   // selected contacts (all have emails)
  onClose: () => void;
}

export default function OutreachComposer({ contacts, onClose }: Props) {
  // Template
  const [subject,     setSubject]     = useState(DEFAULT_SUBJECT);
  const [body,        setBody]        = useState(DEFAULT_BODY);
  const [personalize, setPersonalize] = useState(true);

  // Gmail auth
  const [accessToken,    setAccessToken]    = useState<string | null>(null);
  const [gmailLoading,   setGmailLoading]   = useState(false);
  const [gmailError,     setGmailError]     = useState<string | null>(null);

  // Send state
  const [phase,       setPhase]       = useState<'compose' | 'sending' | 'done'>('compose');
  const [results,     setResults]     = useState<SendResult[]>([]);
  const [previewIdx,  setPreviewIdx]  = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [showRecipients, setShowRecipients] = useState(false);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef    = useRef<HTMLTextAreaElement>(null);
  const abortRef   = useRef(false);

  // Contacts that have already been emailed
  const contactedEmails = useRef(getContactedEmails());

  // Clamp preview index
  const previewContact = contacts[Math.min(previewIdx, contacts.length - 1)];
  const previewSubject = previewContact ? applyVariables(subject, previewContact, personalize) : subject;
  const previewBody    = previewContact ? applyVariables(body,    previewContact, personalize) : body;

  const alreadyContacted = contacts.filter((c) => contactedEmails.current.has(c.contactEmail.toLowerCase()));

  // ── gmail connect ────────────────────────────────────────────────────────────

  const handleConnectGmail = useCallback(async () => {
    if (!CLIENT_ID) {
      setGmailError('VITE_GOOGLE_CLIENT_ID is not set in .env');
      return;
    }
    setGmailLoading(true);
    setGmailError(null);
    try {
      await loadGisScript();
      const token = await requestGmailToken(CLIENT_ID);
      setAccessToken(token);
    } catch (err) {
      setGmailError(err instanceof Error ? err.message : 'Failed to connect Gmail');
    } finally {
      setGmailLoading(false);
    }
  }, []);

  // ── send ─────────────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    if (!accessToken) return;
    abortRef.current = false;

    const initial: SendResult[] = contacts.map((c) => ({ contact: c, status: 'pending' }));
    setResults(initial);
    setPhase('sending');

    for (let i = 0; i < contacts.length; i++) {
      if (abortRef.current) {
        setResults((prev) => prev.map((r, idx) => idx >= i ? { ...r, status: 'skipped' } : r));
        break;
      }

      const contact = contacts[i];
      setResults((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'sending' } : r));

      const renderedSubject = applyVariables(subject, contact, personalize);
      const renderedBody    = applyVariables(body,    contact, personalize);

      try {
        await sendGmailMessage(accessToken, contact.contactEmail, renderedSubject, renderedBody);

        // Save to history
        const record: OutreachRecord = {
          id:           `${Date.now()}-${i}`,
          sentAt:       new Date().toISOString(),
          contactName:  contact.contactName,
          contactEmail: contact.contactEmail,
          nctId:        contact.nctId,
          trialTitle:   contact.studyTitle,
          facility:     contact.facility,
          subject:      renderedSubject,
          bodyPreview:  renderedBody.slice(0, 150),
          status:       'no_reply',
          notes:        '',
        };
        saveRecord(record);

        setResults((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'sent' } : r));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setResults((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'error', error: msg } : r));
      }

      if (i < contacts.length - 1) await sleep(SEND_DELAY_MS);
    }

    setPhase('done');
  }, [accessToken, contacts, subject, body, personalize]);

  const handleAbort = () => { abortRef.current = true; };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase !== 'sending') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, onClose]);

  // ── derived stats ─────────────────────────────────────────────────────────────

  const sentCount    = results.filter((r) => r.status === 'sent').length;
  const errorCount   = results.filter((r) => r.status === 'error').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;
  const sending      = results.find((r) => r.status === 'sending');
  const progress     = results.filter((r) => r.status === 'sent' || r.status === 'error' || r.status === 'skipped').length;

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={() => phase !== 'sending' && onClose()}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-background border border-border rounded-2xl shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-primary" />
            <h2 className="font-semibold text-base">Email Outreach</h2>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              {contacts.length} recipient{contacts.length !== 1 ? 's' : ''}
            </span>
          </div>
          {phase !== 'sending' && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded hover:bg-muted transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── COMPOSE PHASE ── */}
          {phase === 'compose' && (
            <div className="p-5 space-y-5">

              {/* Recipients summary */}
              <div className="rounded-lg border bg-muted/30 overflow-hidden">
                <button
                  onClick={() => setShowRecipients((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <span>
                    Recipients
                    {alreadyContacted.length > 0 && (
                      <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400 font-normal">
                        ({alreadyContacted.length} previously contacted)
                      </span>
                    )}
                  </span>
                  {showRecipients ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showRecipients && (
                  <div className="border-t max-h-48 overflow-y-auto divide-y divide-border">
                    {contacts.map((c) => {
                      const wasContacted = contactedEmails.current.has(c.contactEmail.toLowerCase());
                      return (
                        <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{c.contactName}</p>
                            <p className="text-xs text-muted-foreground truncate">{c.contactEmail}</p>
                          </div>
                          {wasContacted && (
                            <span className="text-[10px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-1.5 py-0.5 rounded shrink-0">
                              Contacted
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Personalize toggle */}
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <p className="text-sm font-medium">Personalize emails</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Auto-fill {'{{firstName}}'}, {'{{trialTitle}}'}, etc. for each recipient</p>
                </div>
                <button
                  role="switch"
                  aria-checked={personalize}
                  onClick={() => setPersonalize((v) => !v)}
                  className={`relative w-10 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${personalize ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${personalize ? 'left-5' : 'left-1'}`} />
                </button>
              </label>

              {/* Variable chips */}
              {personalize && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Click to insert at cursor:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        onClick={() => {
                          // Insert into whichever was last focused — default to body
                          const tag = `{{${v.key}}}`;
                          if (document.activeElement === subjectRef.current) {
                            insertAtCursor(subjectRef as React.RefObject<HTMLInputElement>, tag, setSubject);
                          } else {
                            insertAtCursor(bodyRef as React.RefObject<HTMLTextAreaElement>, tag, setBody);
                          }
                        }}
                        className="text-[11px] px-2 py-1 rounded border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer font-mono"
                      >
                        {`{{${v.key}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Subject */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Subject</label>
                <input
                  ref={subjectRef}
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Message</label>
                <textarea
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none font-mono leading-relaxed"
                />
              </div>

              {/* Preview toggle */}
              {personalize && contacts.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <button
                    onClick={() => setShowPreview((v) => !v)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <Eye size={14} />
                    Preview
                    {showPreview ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
                  </button>

                  {showPreview && (
                    <div className="border-t p-4 space-y-3 bg-muted/20">
                      {/* Recipient selector */}
                      {contacts.length > 1 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">Previewing for:</span>
                          <select
                            value={previewIdx}
                            onChange={(e) => setPreviewIdx(Number(e.target.value))}
                            className="flex-1 h-7 px-2 text-xs rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                          >
                            {contacts.map((c, i) => (
                              <option key={c.id} value={i}>{c.contactName} ({c.contactEmail})</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {/* Rendered email */}
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Subject:</p>
                        <p className="text-sm font-medium">{previewSubject}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Body:</p>
                        <pre className="text-xs font-sans whitespace-pre-wrap text-foreground/80 leading-relaxed">{previewBody}</pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Gmail connect */}
              {!accessToken && (
                <div className="rounded-lg border border-dashed p-4 space-y-3">
                  <p className="text-sm font-medium">Connect Gmail to send</p>
                  <p className="text-xs text-muted-foreground">
                    You'll be asked to sign in with Google and grant permission to send emails on your behalf.
                    Emails are sent directly from your Gmail account.
                  </p>
                  {gmailError && (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs">
                      <AlertCircle size={14} className="mt-0.5 shrink-0" />
                      {gmailError}
                    </div>
                  )}
                  <Button onClick={handleConnectGmail} disabled={gmailLoading} size="sm" variant="outline" className="cursor-pointer">
                    {gmailLoading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                    {gmailLoading ? 'Connecting…' : 'Connect Gmail'}
                  </Button>
                </div>
              )}

              {accessToken && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <Check size={14} />
                  Gmail connected — ready to send
                </div>
              )}
            </div>
          )}

          {/* ── SENDING / DONE PHASE ── */}
          {(phase === 'sending' || phase === 'done') && (
            <div className="p-5 space-y-4">
              {/* Progress bar */}
              {phase === 'sending' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {sending ? `Sending to ${sending.contact.contactName}…` : 'Finishing up…'}
                    </span>
                    <span className="font-medium">{progress} / {contacts.length}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${(progress / contacts.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Done summary */}
              {phase === 'done' && (
                <div className="rounded-lg bg-muted/30 p-4 space-y-1">
                  <p className="font-semibold text-sm">Done</p>
                  <p className="text-sm text-green-600 dark:text-green-400">{sentCount} sent successfully</p>
                  {errorCount > 0 && <p className="text-sm text-red-600 dark:text-red-400">{errorCount} failed</p>}
                  {skippedCount > 0 && <p className="text-sm text-muted-foreground">{skippedCount} skipped</p>}
                </div>
              )}

              {/* Per-contact results */}
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {results.map((r) => (
                  <div key={r.contact.id} className="flex items-center gap-3 py-2 px-3 rounded-md bg-muted/20">
                    <StatusIcon status={r.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.contact.contactName}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.contact.contactEmail}</p>
                      {r.error && <p className="text-xs text-red-500 mt-0.5">{r.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t px-5 py-4 flex items-center justify-between gap-3">
          {phase === 'compose' && (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} className="cursor-pointer">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!accessToken || !subject.trim() || !body.trim()}
                className="cursor-pointer gap-2"
              >
                <Send size={14} />
                Send to {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
              </Button>
            </>
          )}

          {phase === 'sending' && (
            <Button variant="outline" size="sm" onClick={handleAbort} className="cursor-pointer ml-auto">
              Stop sending
            </Button>
          )}

          {phase === 'done' && (
            <Button size="sm" onClick={onClose} className="cursor-pointer ml-auto">
              Close
            </Button>
          )}
        </div>
      </div>
      </div>
    </>
  );
}

function StatusIcon({ status }: { status: SendStatus }) {
  switch (status) {
    case 'sent':    return <Check size={14} className="text-green-500 shrink-0" />;
    case 'error':   return <AlertCircle size={14} className="text-red-500 shrink-0" />;
    case 'sending': return <Loader2 size={14} className="text-primary animate-spin shrink-0" />;
    case 'skipped': return <X size={14} className="text-muted-foreground shrink-0" />;
    default:        return <span className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 shrink-0 inline-block" />;
  }
}
