import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Mail, Send, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OutreachRecord } from '../types';
import { loadGisScript, requestGmailToken, sendGmailMessage } from '../services/gmail';
import { saveRecord } from '../services/outreachHistory';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

interface Props {
  onClose: () => void;
}

export default function ManualComposer({ onClose }: Props) {
  const [to,      setTo]      = useState('');
  const [subject, setSubject] = useState('');
  const [body,    setBody]    = useState('');

  const [accessToken,  setAccessToken]  = useState<string | null>(null);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailError,   setGmailError]   = useState<string | null>(null);

  const [sending,   setSending]   = useState(false);
  const [sent,      setSent]      = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sending, onClose]);

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

  const handleSend = useCallback(async () => {
    if (!accessToken || !to.trim() || !subject.trim() || !body.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await sendGmailMessage(accessToken, to.trim(), subject.trim(), body.trim());

      const record: OutreachRecord = {
        id:           `${Date.now()}-manual`,
        sentAt:       new Date().toISOString(),
        contactName:  to.trim(),
        contactEmail: to.trim(),
        nctId:        '',
        trialTitle:   '',
        facility:     '',
        subject:      subject.trim(),
        bodyPreview:  body.trim().slice(0, 150),
        status:       'no_reply',
        notes:        '',
      };
      saveRecord(record);
      setSent(true);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSending(false);
    }
  }, [accessToken, to, subject, body]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={() => !sending && onClose()}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-background border border-border rounded-2xl shadow-2xl flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <Mail size={17} className="text-primary" />
              <h2 className="font-semibold text-base">New Email</h2>
            </div>
            {!sending && (
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded hover:bg-muted transition-colors"
              >
                <X size={17} />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">

            {/* To */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">To</label>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                disabled={sending || sent}
                autoFocus
              />
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter subject…"
                className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                disabled={sending || sent}
              />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Message</label>
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message here…"
                rows={8}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
                disabled={sending || sent}
              />
            </div>

            {/* Gmail connect */}
            {!accessToken && !sent && (
              <div className="rounded-lg border border-dashed p-4 space-y-3">
                <p className="text-sm font-medium">Connect Gmail to send</p>
                <p className="text-xs text-muted-foreground">
                  You'll be asked to sign in with Google and grant permission to send emails on your behalf.
                </p>
                {gmailError && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    {gmailError}
                  </div>
                )}
                <Button onClick={handleConnectGmail} disabled={gmailLoading} size="sm" variant="outline" className="cursor-pointer">
                  {gmailLoading ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                  {gmailLoading ? 'Connecting…' : 'Connect Gmail'}
                </Button>
              </div>
            )}

            {accessToken && !sent && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <Check size={13} />
                Gmail connected
              </div>
            )}

            {sendError && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                {sendError}
              </div>
            )}

            {sent && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm">
                <Check size={14} />
                Email sent to {to}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t px-5 py-4 flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={onClose} className="cursor-pointer" disabled={sending}>
              {sent ? 'Close' : 'Cancel'}
            </Button>
            {!sent && (
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!accessToken || !to.trim() || !subject.trim() || !body.trim() || sending}
                className="cursor-pointer gap-2"
              >
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
