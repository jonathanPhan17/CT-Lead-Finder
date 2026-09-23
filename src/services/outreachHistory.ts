import type { OutreachRecord, OutreachStatus } from '../types';

function readApiUrl(): string | null {
  const raw: unknown = import.meta.env.VITE_API_URL;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null;
}

const API_URL = readApiUrl();

/** False when VITE_API_URL is missing or not an http(s) URL; history features are then disabled. */
export function isHistoryConfigured(): boolean {
  return API_URL !== null;
}

export class HistoryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistoryUnavailableError';
  }
}

function endpoint(path: string): string {
  if (API_URL === null) throw new HistoryUnavailableError('Outreach history is not configured');
  return `${API_URL}${path}`;
}

const STATUSES: readonly OutreachStatus[] = ['no_reply', 'replied', 'interested', 'not_interested', 'wrong_contact'];

function text(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function parseRecord(v: unknown): OutreachRecord | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  const id = text(r.id);
  const contactEmail = text(r.contactEmail);
  if (!id || !contactEmail) return null;
  const status = STATUSES.find((s) => s === r.status) ?? 'no_reply';
  return {
    id,
    sentAt: text(r.sentAt),
    contactName: text(r.contactName),
    contactEmail,
    nctId: text(r.nctId),
    trialTitle: text(r.trialTitle),
    facility: text(r.facility),
    subject: text(r.subject),
    bodyPreview: text(r.bodyPreview),
    status,
    notes: text(r.notes),
  };
}

async function request(path: string, init: RequestInit): Promise<Response> {
  let resp: Response;
  try {
    resp = await fetch(endpoint(path), init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    if (err instanceof HistoryUnavailableError) throw err;
    throw new HistoryUnavailableError('Could not reach the outreach history service');
  }
  if (!resp.ok) throw new HistoryUnavailableError(`Outreach history service returned ${resp.status}`);
  return resp;
}

export async function getHistory(signal?: AbortSignal): Promise<OutreachRecord[]> {
  const resp = await request('/records', { signal });
  let json: unknown;
  try {
    json = await resp.json();
  } catch {
    throw new HistoryUnavailableError('Outreach history service sent an unreadable response');
  }
  if (!Array.isArray(json)) throw new HistoryUnavailableError('Outreach history service sent an unexpected response');
  return json.map(parseRecord).filter((r): r is OutreachRecord => r !== null);
}

export async function saveRecord(record: OutreachRecord): Promise<void> {
  await request('/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
}

export async function updateRecord(id: string, patch: Partial<Pick<OutreachRecord, 'status' | 'notes'>>): Promise<void> {
  await request(`/records/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function deleteRecord(id: string): Promise<void> {
  await request(`/records/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Deletes every record it can. Returns the ids that could not be deleted. */
export async function deleteRecords(ids: readonly string[]): Promise<string[]> {
  const results = await Promise.allSettled(ids.map((id) => deleteRecord(id)));
  return ids.filter((_, i) => results[i].status === 'rejected');
}

/** Lower-cased emails already contacted. Empty when history is not configured. */
export async function getContactedEmails(signal?: AbortSignal): Promise<Set<string>> {
  if (!isHistoryConfigured()) return new Set();
  const records = await getHistory(signal);
  return new Set(records.map((r) => r.contactEmail.toLowerCase()));
}
