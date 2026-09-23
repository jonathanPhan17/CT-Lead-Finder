// Gmail sending via the Google Identity Services token model. The OAuth token is requested
// in the browser and never leaves it; there is no backend in this path.

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: TokenClientConfig) => TokenClient;
        };
      };
    };
  }
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type: string }) => void;
}

interface TokenClient {
  requestAccessToken: () => void;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
}

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCRIPT_TIMEOUT_MS = 15_000;
const SEND_TIMEOUT_MS = 30_000;
const EMAIL_RE = /^[^\s@;,<>"]+@[^\s@;,<>"]+\.[a-z]{2,}$/i;

export type GmailErrorKind =
  | 'not_configured'
  | 'script_failed'
  | 'popup_closed'
  | 'auth_failed'
  | 'token_expired'
  | 'rate_limited'
  | 'invalid_recipient'
  | 'offline'
  | 'send_failed';

export class GmailError extends Error {
  readonly kind: GmailErrorKind;

  constructor(kind: GmailErrorKind) {
    super(kind);
    this.name = 'GmailError';
    this.kind = kind;
  }
}

/** Plain-language copy for each failure. Never show raw provider errors to users. */
export const GMAIL_ERROR_MESSAGES: Record<GmailErrorKind, string> = {
  not_configured: 'Email sending is not set up for this app yet. Ask your administrator to add a Google client ID.',
  script_failed: 'Could not load Google sign-in. Check your connection or any ad blocker, then try again.',
  popup_closed: 'Google sign-in was closed before it finished. Try connecting again.',
  auth_failed: 'Google did not grant permission to send email. Try connecting again.',
  token_expired: 'Your Google sign-in expired. Reconnect Gmail to keep sending.',
  rate_limited: 'Gmail is limiting how fast you can send. Wait a few minutes, then send the rest.',
  invalid_recipient: 'That email address does not look valid.',
  offline: 'You appear to be offline. Check your connection, then try again.',
  send_failed: 'Gmail could not send this message. Try again later.',
};

export function gmailErrorKind(err: unknown): GmailErrorKind {
  return err instanceof GmailError ? err.kind : 'send_failed';
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function readGoogleClientId(): string | null {
  const raw: unknown = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

let scriptPromise: Promise<void> | null = null;

export function loadGisScript(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    const timer = setTimeout(() => fail(), SCRIPT_TIMEOUT_MS);
    function fail() {
      clearTimeout(timer);
      script.remove();
      scriptPromise = null;
      reject(new GmailError('script_failed'));
    }
    script.onload = () => {
      clearTimeout(timer);
      if (window.google?.accounts) resolve();
      else fail();
    };
    script.onerror = () => fail();
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function requestGmailToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const accounts = window.google?.accounts;
    if (!accounts) {
      reject(new GmailError('script_failed'));
      return;
    }
    const client = accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) reject(new GmailError('auth_failed'));
        else resolve(resp.access_token);
      },
      error_callback: (err) => {
        reject(new GmailError(err.type === 'popup_closed' ? 'popup_closed' : 'auth_failed'));
      },
    });
    client.requestAccessToken();
  });
}

function base64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function toBase64Url(str: string): string {
  return base64Utf8(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildMessage(to: string, subject: string, body: string): string {
  const oneLineSubject = subject.replace(/[\r\n]+/g, ' ').trim();
  return [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${base64Utf8(oneLineSubject)}?=`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
    '',
    body.replace(/\r?\n/g, '\r\n'),
  ].join('\r\n');
}

export async function sendGmailMessage(accessToken: string, to: string, subject: string, body: string): Promise<void> {
  const recipient = to.trim();
  if (!isValidEmail(recipient)) throw new GmailError('invalid_recipient');

  let resp: Response;
  try {
    resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: toBase64Url(buildMessage(recipient, subject, body)) }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch {
    throw new GmailError(navigator.onLine ? 'send_failed' : 'offline');
  }
  if (resp.ok) return;
  if (resp.status === 401) throw new GmailError('token_expired');
  if (resp.status === 429) throw new GmailError('rate_limited');
  if (resp.status === 403) {
    // Gmail reports daily sending limits as 403 with a rate-limit reason.
    const text = await resp.text().catch(() => '');
    throw new GmailError(/rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded|quota/i.test(text) ? 'rate_limited' : 'auth_failed');
  }
  throw new GmailError('send_failed');
}
