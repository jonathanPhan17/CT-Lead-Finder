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

// Decodes a Google Pub/Sub push notification body
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
