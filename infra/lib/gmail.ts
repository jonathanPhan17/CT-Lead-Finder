// Server-side Gmail helpers (fetching reply content via service account or stored token)
// These run in Lambda — no browser APIs available

interface GmailPart {
  mimeType: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: GmailPart & {
    headers?: { name: string; value: string }[];
  };
}

export interface ReplyInfo {
  subject:    string;
  body:       string;
  receivedAt: string;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function extractTextBody(part: GmailPart): string {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  for (const p of part.parts ?? []) {
    const nested = extractTextBody(p);
    if (nested) return nested;
  }
  return '';
}

export async function fetchReplyContent(
  accessToken: string,
  messageId: string,
): Promise<ReplyInfo | null> {
  try {
    const resp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!resp.ok) return null;

    const msg = await resp.json() as GmailMessage;
    const headers = msg.payload?.headers ?? [];
    const subject = headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)';
    const body = msg.payload ? extractTextBody(msg.payload) : '';
    const receivedAt = msg.internalDate
      ? new Date(Number(msg.internalDate)).toISOString()
      : new Date().toISOString();

    return { subject, body: body.trim(), receivedAt };
  } catch {
    return null;
  }
}

// ── OAuth token management ─────────────────────────────────────────────────────

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?:   number;
  error?:        string;
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number } | null> {
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
    });
    const data = await resp.json() as GoogleTokenResponse;
    if (!data.access_token) return null;
    return {
      accessToken: data.access_token,
      expiresAt:   Date.now() + (data.expires_in ?? 3600) * 1000,
    };
  } catch {
    return null;
  }
}

// ── Gmail watch ───────────────────────────────────────────────────────────────

interface WatchResponse {
  historyId?:  string;
  expiration?: string;
  error?: { message?: string };
}

export async function startGmailWatch(accessToken: string): Promise<{ historyId: string; expiry: number } | null> {
  const topic = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topic) { console.warn('GMAIL_PUBSUB_TOPIC not set — skipping watch'); return null; }

  try {
    const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ topicName: topic, labelIds: ['INBOX'] }),
    });
    const data = await resp.json() as WatchResponse;
    if (!data.historyId) {
      console.error('gmail.watch error', data.error?.message);
      return null;
    }
    return {
      historyId: data.historyId,
      expiry:    Number(data.expiration ?? Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
  } catch {
    return null;
  }
}

// ── Gmail history — get new INBOX message IDs since a historyId ───────────────

interface HistoryRecord {
  messagesAdded?: { message: { id: string } }[];
}

interface HistoryListResponse {
  history?:    HistoryRecord[];
  historyId?:  string;
  error?:      { message?: string };
}

export async function getNewInboxMessageIds(
  accessToken:    string,
  startHistoryId: string,
): Promise<{ messageIds: string[]; newHistoryId: string | null }> {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/history');
  url.searchParams.set('startHistoryId', startHistoryId);
  url.searchParams.set('historyTypes',   'messageAdded');
  url.searchParams.set('labelId',        'INBOX');

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json() as HistoryListResponse;

  if (!resp.ok) {
    console.error('history.list error', data.error?.message);
    return { messageIds: [], newHistoryId: null };
  }

  const messageIds = (data.history ?? [])
    .flatMap((h) => h.messagesAdded ?? [])
    .map((m) => m.message.id);

  return { messageIds, newHistoryId: data.historyId ?? null };
}

// ── Get sender email from a message ──────────────────────────────────────────

interface MessageMetadata {
  id:      string;
  payload?: { headers?: { name: string; value: string }[] };
  error?:  { message?: string };
}

export async function getMessageSender(accessToken: string, messageId: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!resp.ok) return null;
    const data = await resp.json() as MessageMetadata;
    const from = data.payload?.headers?.find((h) => h.name === 'From')?.value ?? '';
    // Extract email from "Name <email>" format
    const match = from.match(/<(.+?)>/) ?? from.match(/(\S+@\S+)/);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

// ── Search Gmail for messages from a list of emails ──────────────────────────

interface MessageListResponse {
  messages?: { id: string }[];
  error?:    { message?: string };
}

/**
 * Searches the inbox for messages from any of the given email addresses.
 * Returns a map of { messageId → senderEmail } for matched messages.
 */
export async function searchRepliesFromContacts(
  accessToken:   string,
  contactEmails: string[],
): Promise<{ messageId: string; senderEmail: string }[]> {
  if (contactEmails.length === 0) return [];

  // Gmail query: from:(a@b.com OR c@d.com) in:inbox
  const fromClause = contactEmails.map((e) => e.toLowerCase()).join(' OR ');
  const q = `from:(${fromClause}) in:inbox`;

  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('q', q);
  url.searchParams.set('maxResults', '50');

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json() as MessageListResponse;

  if (!resp.ok || !data.messages?.length) return [];

  // Fetch sender for each matched message (metadata only — fast)
  const results: { messageId: string; senderEmail: string }[] = [];
  await Promise.all(
    data.messages.map(async ({ id }) => {
      const sender = await getMessageSender(accessToken, id);
      if (sender) results.push({ messageId: id, senderEmail: sender });
    }),
  );
  return results;
}

// ── Decodes a Google Pub/Sub push notification body ────────────────────────────

export function decodePubSubMessage(body: unknown): { emailAddress: string; historyId: string } | null {
  try {
    const b = body as { message?: { data?: string } };
    const decoded = JSON.parse(Buffer.from(b.message?.data ?? '', 'base64').toString('utf-8'));
    return {
      emailAddress: decoded.emailAddress,
      historyId:    String(decoded.historyId),
    };
  } catch {
    return null;
  }
}
