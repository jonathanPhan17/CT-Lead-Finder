import { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, Mail, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addRecord, useHistory } from '@/outreach/historyStore';
import {
  GMAIL_ERROR_MESSAGES,
  gmailErrorKind,
  isValidEmail,
  loadGisScript,
  readGoogleClientId,
  requestGmailToken,
  sendGmailMessage,
  type GmailErrorKind,
} from '@/services/gmail';
import type { OutreachRecord } from '@/types';

interface Props {
  onClose: () => void;
}

type Outcome = { kind: 'sent'; logged: boolean } | { kind: 'failed'; error: GmailErrorKind };

const inputClass =
  'h-9 w-full rounded-md border bg-background px-3 text-sm focus:ring-1 focus:ring-primary focus:outline-none aria-invalid:border-destructive disabled:opacity-60';

export default function ManualComposer({ onClose }: Props) {
  const history = useHistory();
  const clientId = readGoogleClientId();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<GmailErrorKind | null>(null);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [touched, setTouched] = useState(false);

  const recipient = to.trim().toLowerCase();
  const toInvalid = touched && recipient !== '' && !isValidEmail(recipient);
  const sent = outcome?.kind === 'sent';
  const alreadyContacted = recipient !== '' && history.contacted.has(recipient);

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

  async function send() {
    setTouched(true);
    if (!token || !isValidEmail(recipient) || !subject.trim() || !body.trim()) return;
    setSending(true);
    setOutcome(null);
    try {
      await sendGmailMessage(token, recipient, subject.trim(), body.trim());
    } catch (err) {
      const error = gmailErrorKind(err);
      if (error === 'token_expired' || error === 'auth_failed') setToken(null);
      setOutcome({ kind: 'failed', error });
      setSending(false);
      return;
    }
    const record: OutreachRecord = {
      id: crypto.randomUUID(),
      sentAt: new Date().toISOString(),
      contactName: '',
      contactEmail: recipient,
      nctId: '',
      trialTitle: '',
      facility: '',
      subject: subject.trim(),
      bodyPreview: body.trim().slice(0, 150),
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
    setOutcome({ kind: 'sent', logged });
    setSending(false);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={() => !sending && onClose()} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="New email">
        <div className="flex w-full max-w-xl flex-col rounded-2xl border border-border bg-background shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
            <div className="flex items-center gap-2">
              <Mail size={17} className="text-primary" />
              <h2 className="text-base font-semibold">New email</h2>
            </div>
            {!sending && (
              <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X size={17} />
              </button>
            )}
          </div>

          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <label htmlFor="manual-to" className="text-sm font-medium">To</label>
              <input
                id="manual-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="name@example.org"
                aria-invalid={toInvalid || undefined}
                className={inputClass}
                disabled={sending || sent}
                autoFocus
              />
              {toInvalid && <p className="text-xs text-destructive">Enter one valid email address.</p>}
              {alreadyContacted && !sent && <p className="text-xs text-amber-700 dark:text-amber-400">You have emailed this address before.</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="manual-subject" className="text-sm font-medium">Subject</label>
              <input id="manual-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} disabled={sending || sent} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="manual-body" className="text-sm font-medium">Message</label>
              <textarea
                id="manual-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-60"
                disabled={sending || sent}
              />
            </div>

            {!token && !sent && (
              <div className="space-y-3 rounded-lg border border-dashed p-4">
                <p className="text-sm font-medium">Connect Gmail to send</p>
                {connectError && <Banner tone="error">{GMAIL_ERROR_MESSAGES[connectError]}</Banner>}
                <Button onClick={() => void connect()} disabled={connecting} size="sm" variant="outline">
                  {connecting ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                  {connecting ? 'Connecting…' : 'Connect Gmail'}
                </Button>
              </div>
            )}
            {token && !sent && (
              <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <Check size={13} /> Gmail connected
              </p>
            )}
            {outcome?.kind === 'failed' && <Banner tone="error">{GMAIL_ERROR_MESSAGES[outcome.error]}</Banner>}
            {outcome?.kind === 'sent' && (
              <Banner tone={outcome.logged ? 'ok' : 'warn'}>
                {outcome.logged
                  ? `Email sent to ${recipient}.`
                  : `Email sent to ${recipient}, but it could not be saved to outreach history. Note it down so it is not sent twice.`}
              </Banner>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-4">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={sending}>
              {sent ? 'Close' : 'Cancel'}
            </Button>
            {!sent && (
              <Button size="sm" onClick={() => void send()} disabled={!token || !recipient || !subject.trim() || !body.trim() || sending}>
                {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                {sending ? 'Sending…' : 'Send'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Banner({ tone, children }: { tone: 'ok' | 'warn' | 'error'; children: string }) {
  const cls =
    tone === 'ok'
      ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200'
        : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300';
  return (
    <div role={tone === 'ok' ? 'status' : 'alert'} className={`flex items-start gap-2 rounded-md p-3 text-sm ${cls}`}>
      {tone === 'ok' ? <Check size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}
