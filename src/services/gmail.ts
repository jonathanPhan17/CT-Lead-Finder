// Gmail OAuth via Google Identity Services (GIS).
// Uses authorization code flow so the backend can store a refresh token
// and receive Pub/Sub push notifications for replies.

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: CodeClientConfig) => CodeClient;
        };
      };
    };
  }
}

interface CodeClientConfig {
  client_id: string;
  scope: string;
  ux_mode: 'popup';
  callback: (response: CodeResponse) => void;
  error_callback?: (error: { type: string }) => void;
}

interface CodeClient {
  requestCode: () => void;
}

interface CodeResponse {
  code?: string;
  error?: string;
}

const GMAIL_SCOPE = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ');

const API_URL = import.meta.env.VITE_API_URL as string;

export function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) { resolve(); return; }
    if (document.getElementById('gis-script')) {
      const check = setInterval(() => {
        if (window.google?.accounts) { clearInterval(check); resolve(); }
      }, 100);
      return;
    }
    const script = document.createElement('script');
    script.id = 'gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Opens a Google sign-in popup, gets an authorization code,
 * sends it to our backend, which exchanges it for a refresh token,
 * stores it, starts Gmail watch, and returns an access token for
 * immediate use sending emails.
 */
export function requestGmailToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts) {
      reject(new Error('Google SDK not loaded')); return;
    }

    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope:     GMAIL_SCOPE,
      ux_mode:   'popup',
      callback:  async (resp) => {
        if (resp.error || !resp.code) {
          reject(new Error(resp.error ?? 'No authorization code returned'));
          return;
        }
        try {
          // Exchange code server-side — backend stores refresh token + starts watch
          const res = await fetch(`${API_URL}/auth/gmail`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ code: resp.code }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({})) as { error?: string };
            reject(new Error(err.error ?? `Auth failed (${res.status})`));
            return;
          }
          const { accessToken } = await res.json() as { accessToken: string };
          resolve(accessToken);
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Auth request failed'));
        }
      },
      error_callback: (err) => {
        if (err.type === 'popup_closed') {
          reject(new Error('Sign-in cancelled'));
        } else {
          reject(new Error(`Auth error: ${err.type}`));
        }
      },
    });

    client.requestCode();
  });
}

// ── Email sending ─────────────────────────────────────────────────────────────

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Builds a multipart/alternative RFC 2822 message with:
 *   - text/plain fallback
 *   - text/html with tracking pixel embedded
 */
function buildRfc2822(to: string, subject: string, textBody: string, recordId: string): string {
  const boundary = `----=_Part_${Date.now()}`;
  const trackingPixel = `<img src="${API_URL}/track/${recordId}/open" width="1" height="1" style="display:none" alt="" />`;
  const htmlBody = textBody
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>') + trackingPixel;

  return [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    textBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    `<html><body>${htmlBody}</body></html>`,
    '',
    `--${boundary}--`,
  ].join('\r\n');
}

export async function sendGmailMessage(
  accessToken: string,
  to:          string,
  subject:     string,
  body:        string,
  recordId:    string,
): Promise<void> {
  const raw = toBase64Url(buildRfc2822(to, subject, body, recordId));

  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method:  'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ raw }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Gmail API error ${resp.status}`);
  }
}
