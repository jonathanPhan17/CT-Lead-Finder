import type { OutreachRecord } from '../types';

const API_URL = import.meta.env.VITE_API_URL as string;

// ── read ──────────────────────────────────────────────────────────────────────

export async function getHistory(): Promise<OutreachRecord[]> {
  const resp = await fetch(`${API_URL}/records`);
  if (!resp.ok) throw new Error('Failed to fetch outreach history');
  return resp.json() as Promise<OutreachRecord[]>;
}

// ── write ─────────────────────────────────────────────────────────────────────

export async function saveRecord(record: OutreachRecord): Promise<void> {
  const resp = await fetch(`${API_URL}/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (!resp.ok) throw new Error('Failed to save record');
}

export async function updateRecord(
  id: string,
  patch: Partial<Pick<OutreachRecord, 'status' | 'notes' | 'replySubject' | 'replyBody' | 'replyReceivedAt'>>,
): Promise<void> {
  const resp = await fetch(`${API_URL}/records/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) throw new Error('Failed to update record');
}

export async function deleteRecord(id: string): Promise<void> {
  const resp = await fetch(`${API_URL}/records/${id}`, { method: 'DELETE' });
  if (!resp.ok) throw new Error('Failed to delete record');
}

export async function clearHistory(): Promise<void> {
  const records = await getHistory();
  await Promise.all(records.map((r) => deleteRecord(r.id)));
}

export async function getContactedEmails(): Promise<Set<string>> {
  const records = await getHistory();
  return new Set(records.map((r) => r.contactEmail.toLowerCase()));
}
