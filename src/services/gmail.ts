// Gmail sending via Google Identity Services (GIS) token model.
// No backend needed — OAuth token is requested in the browser.

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

export function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) { resolve(); return; }
    if (document.getElementById('gis-script')) {
      // Already loading — wait for it
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

export function requestGmailToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts) {
      reject(new Error('Google SDK not loaded')); return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error ?? 'No access token returned'));
        } else {
          resolve(resp.access_token);
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
    client.requestAccessToken();
  });
}

function toBase64Url(str: string): string {
  // encode to UTF-8 bytes then base64url
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildRfc2822(to: string, subject: string, body: string): string {
  return [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n');
}

export async function sendGmailMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const raw = toBase64Url(buildRfc2822(to, subject, body));

  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Gmail API error ${resp.status}`);
  }
}
