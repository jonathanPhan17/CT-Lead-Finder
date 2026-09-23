import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronUp, Eye, Loader2, Mail, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { applyVariables, TEMPLATE_VARIABLES } from '@/outreach/personalize';
import { addRecord, useHistory } from '@/outreach/historyStore';
import type { Recipient } from '@/search/resultsView';
import {
  GMAIL_ERROR_MESSAGES,
  gmailErrorKind,
  loadGisScript,
  readGoogleClientId,
  requestGmailToken,
  sendGmailMessage,
  type GmailErrorKind,
} from '@/services/gmail';
import type { OutreachRecord } from '@/types';

/** Gmail allows roughly 2 sends per second per user; one per second leaves headroom. */
const SEND_INTERVAL_MS = 1000;
/** Failures that will hit every remaining message too, so sending stops instead of burning through the list. */
const STOP_ON: readonly GmailErrorKind[] = ['token_expired', 'rate_limited', 'offline', 'auth_failed'];
/**
 * Most recipients one batch sends. Gmail caps personal accounts at about 500 messages a day and flags
 * sudden bulk sends, so a large selection goes out over several batches instead of all at once.
 */
const MAX_BATCH = 100;

const DEFAULT_SUBJECT = 'Question about {{trialTitle}}';
const DEFAULT_BODY = `Hi {{firstName}},

I came across "{{trialTitle}}" ({{nctId}}) at {{facility}} and wanted to reach out about [what you are offering].

[Your message]

Best regards,
[Your name]
[Your company and postal address]

If you would rather not hear from us, reply "unsubscribe" and we will not contact you again.`;

const KNOWN_VARIABLES = new Set(TEMPLATE_VARIABLES.map((v) => v.key));

/** Problems that would put a broken or unfinished email in someone's inbox. */
function templateProblem(subject: string, body: string): string | null {
  if (!subject.trim()) return 'Add a subject.';
  if (!body.trim()) return 'Write a message.';
  const unknown = [...`${subject} ${body}`.matchAll(/\{\{(\w*)\}\}/g)].map((m) => m[1]).filter((k) => !KNOWN_VARIABLES.has(k));
  if (unknown.length > 0) return `Unknown placeholder {{${unknown[0]}}}. Use one of the buttons above instead.`;
  const bracket = /\[[^\]\n]{2,60}\]/.exec(`${subject}\n${body}`);
  if (bracket) return `Replace ${bracket[0]} with your own text before sending.`;
  return null;
}

type SendStatus = 'pending' | 'sending' | 'sent' | 'sent_unlogged' | 'failed';

interface SendRow {
  recipient: Recipient;
  status: SendStatus;
  error: GmailErrorKind | null;
}

function waitMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface Props {
  recipients: Recipient[];
  onClose: () => void;
  /** Called with every address that was actually sent to. */
  onSent: (emails: string[]) => void;
}

export default function OutreachComposer({ recipients, onClose, onSent }: Props) {
  const history = useHistory();
  const clientId = readGoogleClientId();
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [skipContacted, setSkipContacted] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<GmailErrorKind | null>(null);
  const [rows, setRows] = useState<SendRow[] | null>(null);
  const [sending, setSending] = useState(false);
  const [stoppedBy, setStoppedBy] = useState<GmailErrorKind | 'user' | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewEmail, setPreviewEmail] = useState(recipients[0]?.email ?? '');
  const [showRecipients, setShowRecipients] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const stopRef = useRef(false);
  const lastField = useRef<'subject' | 'body'>('body');
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const contacted = history.contacted;
  const previouslyContacted = recipients.filter((r) => contacted.has(r.email));
  const targets = useMemo(
    () => (skipContacted ? recipients.filter((r) => !contacted.has(r.email)) : recipients),
    [recipients, contacted, skipContacted],
  );
  const batch = useMemo(() => targets.slice(0, MAX_BATCH), [targets]);
  const problem = templateProblem(subject, body);
  const preview = recipients.find((r) => r.email === previewEmail) ?? recipients[0] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sending, onClose]);

  async function connect() {
    if (!clientId) {
      setConnectError('not_configured');
      return;
    }
    setConnecting(true);
    setConnectError(null);
    try {
      await loadGisScript();
      setToken(await requestGmailToken(clientId));
    } catch (err) {
      setConnectError(gmailErrorKind(err));
    } finally {
      setConnecting(false);
    }
  }

  function insertVariable(key: string) {
    const tag = `{{${key}}}`;
    const el = lastField.current === 'subject' ? subjectRef.current : bodyRef.current;
    const setter = lastField.current === 'subject' ? setSubject : setBody;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    setter(el.value.slice(0, start) + tag + el.value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    });
  }

  async function send(list: Recipient[]) {
    setAttempted(true);
    if (!token || problem || list.length === 0) return;
    stopRef.current = false;
    setStoppedBy(null);
    setSending(true);
    const emails = new Set(list.map((r) => r.email));
    setRows((prev) => {
      const kept = (prev ?? []).filter((row) => !emails.has(row.recipient.email));
      return [...kept, ...list.map((recipient): SendRow => ({ recipient, status: 'pending', error: null }))];
    });
    const patch = (email: string, next: Partial<SendRow>) =>
      setRows((prev) => (prev ?? []).map((row) => (row.recipient.email === email ? { ...row, ...next } : row)));

    const sent: string[] = [];
    for (let i = 0; i < list.length; i++) {
      if (stopRef.current) {
        setStoppedBy('user');
        break;
      }
      const r = list[i];
      patch(r.email, { status: 'sending' });
      const renderedSubject = applyVariables(subject, r);
      const renderedBody = applyVariables(body, r);
      try {
        await sendGmailMessage(token, r.email, renderedSubject, renderedBody);
      } catch (err) {
        const kind = gmailErrorKind(err);
        patch(r.email, { status: 'failed', error: kind });
        if (STOP_ON.includes(kind)) {
          setStoppedBy(kind);
          if (kind === 'token_expired' || kind === 'auth_failed') setToken(null);
          break;
        }
        continue;
      }
      sent.push(r.email);
      const trial = r.trials.length > 0 ? r.trials[0] : null;
      const record: OutreachRecord = {
        id: crypto.randomUUID(),
        sentAt: new Date().toISOString(),
        contactName: r.name ?? '',
        contactEmail: r.email,
        nctId: trial?.nctId ?? '',
        trialTitle: trial?.title ?? '',
        facility: trial?.facility ?? '',
        subject: renderedSubject,
        bodyPreview: renderedBody.slice(0, 150),
        status: 'no_reply',
        notes: '',
      };
      let logged = history.status === 'off';
      if (!logged) {
        try {
          await addRecord(record);
          logged = true;
        } catch {
          logged = false;
        }
      }
      patch(r.email, { status: logged ? 'sent' : 'sent_unlogged' });
      if (i < list.length - 1) await waitMs(SEND_INTERVAL_MS);
    }
    setSending(false);
    if (sent.length > 0) onSent(sent);
  }

  const unsent = rows ? rows.filter((r) => r.status === 'pending' || r.status === 'failed').map((r) => r.recipient) : [];
  const count = (s: SendStatus) => (rows ?? []).filter((r) => r.status === s).length;
  const done = rows !== null && !sending;
  const progress = rows ? rows.filter((r) => r.status !== 'pending' && r.status !== 'sending').length : 0;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={() => !sending && onClose()} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Email outreach">
        <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-background shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
            <div className="flex items-center gap-2">
              <Mail size={18} className="text-primary" />
              <h2 className="text-base font-semibold">Email outreach</h2>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {targets.length} recipient{targets.length === 1 ? '' : 's'}
              </span>
            </div>
            {!sending && (
              <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X size={18} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {rows === null ? (
              <div className="space-y-5 p-5">
                {history.status === 'off' && (
                  <Callout tone="info">
                    Outreach history is not set up, so sent emails will not be logged and earlier contact cannot be checked.
                  </Callout>
                )}
                {history.status === 'error' && (
                  <Callout tone="warn">
                    Outreach history could not be loaded, so people you already emailed may not be flagged. Sends will still be
                    logged if the history service comes back.
                  </Callout>
                )}

                <div className="overflow-hidden rounded-lg border bg-muted/30">
                  <button
                    type="button"
                    onClick={() => setShowRecipients((v) => !v)}
                    className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50"
                  >
                    <span>Recipients</span>
                    {showRecipients ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {previouslyContacted.length > 0 && (
                    <label className="flex cursor-pointer items-center gap-2 border-t px-4 py-2.5 text-sm">
                      <input type="checkbox" checked={skipContacted} onChange={(e) => setSkipContacted(e.target.checked)} className="accent-primary" />
                      Skip the {previouslyContacted.length} address{previouslyContacted.length === 1 ? '' : 'es'} you have already emailed
                    </label>
                  )}
                  {showRecipients && (
                    <ul className="max-h-48 divide-y overflow-y-auto border-t">
                      {recipients.map((r) => (
                        <li key={r.email} className="flex items-center justify-between gap-3 px-4 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{r.name ?? 'Name not listed'}</p>
                            <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                          </div>
                          {contacted.has(r.email) && (
                            <span className="shrink-0 rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                              {skipContacted ? 'Skipped, already emailed' : 'Already emailed'}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Insert a personal detail at the cursor:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertVariable(v.key)}
                        title={v.label}
                        className="cursor-pointer rounded border border-primary/30 bg-primary/5 px-2 py-1 font-mono text-[11px] text-primary hover:bg-primary/10"
                      >
                        {`{{${v.key}}}`}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Names that look like a shared inbox, such as &ldquo;Clinical Trials Office&rdquo;, are greeted as &ldquo;there&rdquo;.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="composer-subject" className="text-sm font-medium">Subject</label>
                  <input
                    id="composer-subject"
                    ref={subjectRef}
                    value={subject}
                    onFocus={() => (lastField.current = 'subject')}
                    onChange={(e) => setSubject(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="composer-body" className="text-sm font-medium">Message</label>
                  <textarea
                    id="composer-body"
                    ref={bodyRef}
                    value={body}
                    onFocus={() => (lastField.current = 'body')}
                    onChange={(e) => setBody(e.target.value)}
                    rows={12}
                    className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Commercial email must include your postal address and a way to opt out.
                  </p>
                </div>

                {preview && (
                  <div className="overflow-hidden rounded-lg border">
                    <button
                      type="button"
                      onClick={() => setShowPreview((v) => !v)}
                      className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/50"
                    >
                      <Eye size={14} /> Preview
                      {showPreview ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
                    </button>
                    {showPreview && (
                      <div className="space-y-3 border-t bg-muted/20 p-4">
                        {recipients.length > 1 && (
                          <select
                            value={preview.email}
                            onChange={(e) => setPreviewEmail(e.target.value)}
                            aria-label="Preview for"
                            className="h-8 w-full cursor-pointer rounded border bg-background px-2 text-xs"
                          >
                            {recipients.map((r) => (
                              <option key={r.email} value={r.email}>
                                {r.name ? `${r.name} (${r.email})` : r.email}
                              </option>
                            ))}
                          </select>
                        )}
                        <p className="text-sm font-medium">{applyVariables(subject, preview)}</p>
                        <pre className="font-sans text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">{applyVariables(body, preview)}</pre>
                      </div>
                    )}
                  </div>
                )}

                {!token ? (
                  <div className="space-y-3 rounded-lg border border-dashed p-4">
                    <p className="text-sm font-medium">Connect Gmail to send</p>
                    <p className="text-xs text-muted-foreground">
                      Google will ask you to sign in and allow this app to send email as you. Messages go out from your own account.
                    </p>
                    {connectError && <Callout tone="error">{GMAIL_ERROR_MESSAGES[connectError]}</Callout>}
                    <Button onClick={() => void connect()} disabled={connecting} size="sm" variant="outline">
                      {connecting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                      {connecting ? 'Connecting…' : 'Connect Gmail'}
                    </Button>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                    <Check size={14} /> Gmail connected
                  </p>
                )}

                {targets.length > MAX_BATCH && (
                  <Callout tone="warn">
                    {`This batch sends to the first ${MAX_BATCH} of ${targets.length} recipients. Gmail limits how many emails one account can send in a day, so send the rest in later batches. They stay on your outreach list until they are sent.`}
                  </Callout>
                )}
                {attempted && problem && <Callout tone="error">{problem}</Callout>}
              </div>
            ) : (
              <div className="space-y-4 p-5">
                {sending ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Sending one message per second…</span>
                      <span className="font-medium">
                        {progress} / {rows.length}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(progress / Math.max(rows.length, 1)) * 100}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1 rounded-lg bg-muted/30 p-4 text-sm">
                    <p className="font-semibold">Finished</p>
                    <p className="text-green-700 dark:text-green-400">{count('sent') + count('sent_unlogged')} sent</p>
                    {count('sent_unlogged') > 0 && (
                      <p className="text-amber-700 dark:text-amber-400">
                        {count('sent_unlogged')} sent but not saved to outreach history. Note them down so they are not emailed twice.
                      </p>
                    )}
                    {count('failed') > 0 && <p className="text-red-600 dark:text-red-400">{count('failed')} failed</p>}
                    {count('pending') > 0 && <p className="text-muted-foreground">{count('pending')} not sent</p>}
                  </div>
                )}
                {stoppedBy && stoppedBy !== 'user' && <Callout tone="warn">Sending stopped. {GMAIL_ERROR_MESSAGES[stoppedBy]}</Callout>}
                {stoppedBy === 'user' && <Callout tone="info">You stopped sending.</Callout>}
                {done && !token && unsent.length > 0 && (
                  <div className="flex items-center gap-3">
                    <Button onClick={() => void connect()} disabled={connecting} size="sm" variant="outline">
                      {connecting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Reconnect Gmail
                    </Button>
                    {connectError && <span className="text-xs text-red-600">{GMAIL_ERROR_MESSAGES[connectError]}</span>}
                  </div>
                )}
                <ul className="max-h-96 space-y-1 overflow-y-auto">
                  {rows.map((row) => (
                    <li key={row.recipient.email} className="flex items-center gap-3 rounded-md bg-muted/20 px-3 py-2">
                      <StatusIcon status={row.status} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{row.recipient.name ?? row.recipient.email}</p>
                        <p className="truncate text-xs text-muted-foreground">{row.recipient.email}</p>
                        {row.error && <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{GMAIL_ERROR_MESSAGES[row.error]}</p>}
                        {row.status === 'sent_unlogged' && (
                          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">Sent, but not saved to history</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-4">
            {rows === null && (
              <>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void send(batch)} disabled={!token || batch.length === 0}>
                  <Send size={14} /> Send to {batch.length} recipient{batch.length === 1 ? '' : 's'}
                </Button>
              </>
            )}
            {sending && (
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => (stopRef.current = true)}>
                Stop sending
              </Button>
            )}
            {done && (
              <>
                {unsent.length > 0 ? (
                  <Button size="sm" variant="outline" onClick={() => void send(unsent)} disabled={!token}>
                    <Send size={14} /> Send the remaining {unsent.length}
                  </Button>
                ) : (
                  <span />
                )}
                <Button size="sm" onClick={onClose}>
                  Close
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Callout({ tone, children }: { tone: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const cls =
    tone === 'error'
      ? 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200'
        : 'bg-muted/50 text-muted-foreground';
  return (
    <div role={tone === 'info' ? undefined : 'alert'} className={`flex items-start gap-2 rounded-md p-3 text-xs ${cls}`}>
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function StatusIcon({ status }: { status: SendStatus }) {
  switch (status) {
    case 'sent':
      return <Check size={14} className="shrink-0 text-green-600" />;
    case 'sent_unlogged':
      return <Check size={14} className="shrink-0 text-amber-600" />;
    case 'failed':
      return <AlertCircle size={14} className="shrink-0 text-red-500" />;
    case 'sending':
      return <Loader2 size={14} className="shrink-0 animate-spin text-primary" />;
    case 'pending':
      return <span className="inline-block size-3.5 shrink-0 rounded-full border border-muted-foreground/30" />;
  }
}
