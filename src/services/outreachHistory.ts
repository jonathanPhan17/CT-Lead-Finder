import type { OutreachRecord, OutreachStatus } from '../types';

const STORAGE_KEY = 'ct-outreach-history';

export function getHistory(): OutreachRecord[] {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as OutreachRecord[];
    // Backfill status/notes for old records that predate these fields
    return records.map((r) => ({
      status: 'no_reply' as OutreachStatus,
      notes: '',
      ...r,
    }));
  } catch {
    return [];
  }
}

export function saveRecord(record: OutreachRecord): void {
  const history = getHistory();
  history.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function updateRecord(id: string, patch: Partial<Pick<OutreachRecord, 'status' | 'notes'>>): void {
  const history = getHistory();
  const idx = history.findIndex((r) => r.id === id);
  if (idx === -1) return;
  history[idx] = { ...history[idx], ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function deleteRecord(id: string): void {
  const history = getHistory().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getContactedEmails(): Set<string> {
  return new Set(getHistory().map((r) => r.contactEmail.toLowerCase()));
}
