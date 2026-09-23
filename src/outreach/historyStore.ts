import { useSyncExternalStore } from 'react';
import {
  deleteRecords,
  getHistory,
  isHistoryConfigured,
  saveRecord,
  updateRecord,
} from '../services/outreachHistory';
import type { OutreachRecord } from '../types';

export type HistoryStatus = 'off' | 'loading' | 'ready' | 'error';

export interface HistorySnapshot {
  status: HistoryStatus;
  records: OutreachRecord[];
  /** Lower-cased addresses that already have a record. */
  contacted: ReadonlySet<string>;
}

function snapshotOf(status: HistoryStatus, records: OutreachRecord[]): HistorySnapshot {
  return { status, records, contacted: new Set(records.map((r) => r.contactEmail.toLowerCase())) };
}

let snapshot: HistorySnapshot = snapshotOf(isHistoryConfigured() ? 'loading' : 'off', []);
let inFlight: Promise<void> | null = null;
let loadedOnce = false;
const listeners = new Set<() => void>();

function publish(next: HistorySnapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function newestFirst(records: OutreachRecord[]): OutreachRecord[] {
  return [...records].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/** Loads history from the service. Concurrent calls share one request. */
export function loadHistory(): Promise<void> {
  if (!isHistoryConfigured()) return Promise.resolve();
  if (inFlight) return inFlight;
  publish(snapshotOf('loading', snapshot.records));
  inFlight = getHistory()
    .then((records) => {
      loadedOnce = true;
      publish(snapshotOf('ready', newestFirst(records)));
    })
    .catch(() => publish(snapshotOf('error', snapshot.records)))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Loads history the first time any screen needs it. */
export function ensureHistoryLoaded(): void {
  if (!loadedOnce && !inFlight && snapshot.status !== 'error') void loadHistory();
}

export function useHistory(): HistorySnapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/** Saves a record. Throws when the service rejects it; the caller decides what to tell the user. */
export async function addRecord(record: OutreachRecord): Promise<void> {
  await saveRecord(record);
  publish(snapshotOf(snapshot.status, newestFirst([record, ...snapshot.records])));
}

/** Applies a change immediately and rolls it back if the service rejects it. */
export async function patchRecord(id: string, patch: Pick<OutreachRecord, 'status'> | Pick<OutreachRecord, 'notes'>): Promise<void> {
  const before = snapshot.records.find((r) => r.id === id);
  if (!before) return;
  publish(snapshotOf(snapshot.status, snapshot.records.map((r) => (r.id === id ? { ...r, ...patch } : r))));
  try {
    await updateRecord(id, patch);
  } catch (err) {
    // Revert only the field this call changed, so a concurrent edit to the other field survives.
    const revert = 'status' in patch ? { status: before.status } : { notes: before.notes };
    publish(snapshotOf(snapshot.status, snapshot.records.map((r) => (r.id === id ? { ...r, ...revert } : r))));
    throw err;
  }
}

/** Removes records immediately and restores any the service failed to delete. Returns how many failed. */
export async function removeRecords(ids: readonly string[]): Promise<number> {
  const removed = snapshot.records.filter((r) => ids.includes(r.id));
  publish(snapshotOf(snapshot.status, snapshot.records.filter((r) => !ids.includes(r.id))));
  const failed = await deleteRecords(ids);
  if (failed.length > 0) {
    const restore = removed.filter((r) => failed.includes(r.id));
    publish(snapshotOf(snapshot.status, newestFirst([...snapshot.records, ...restore])));
  }
  return failed.length;
}
