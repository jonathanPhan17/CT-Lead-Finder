import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  PenSquare,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ensureHistoryLoaded, loadHistory, patchRecord, removeRecords, useHistory } from '@/outreach/historyStore';
import { csvField } from '@/search/resultsView';
import type { OutreachRecord, OutreachStatus } from '@/types';
import { downloadText } from '@/utils/download';
import ManualComposer from './ManualComposer';

const STATUS_OPTIONS: { value: OutreachStatus; label: string; border: string; badge: string; dot: string }[] = [
  {
    value: 'no_reply',
    label: 'No reply',
    border: 'border-l-slate-300 dark:border-l-slate-600',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-600',
    dot: 'bg-slate-400',
  },
  {
    value: 'replied',
    label: 'Replied',
    border: 'border-l-blue-400 dark:border-l-blue-500',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 ring-blue-200 dark:ring-blue-700',
    dot: 'bg-blue-400',
  },
  {
    value: 'interested',
    label: 'Interested',
    border: 'border-l-green-400 dark:border-l-green-500',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 ring-green-200 dark:ring-green-700',
    dot: 'bg-green-400',
  },
  {
    value: 'not_interested',
    label: 'Not interested',
    border: 'border-l-red-400 dark:border-l-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 ring-red-200 dark:ring-red-700',
    dot: 'bg-red-400',
  },
  {
    value: 'wrong_contact',
    label: 'Wrong contact',
    border: 'border-l-orange-400 dark:border-l-orange-500',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 ring-orange-200 dark:ring-orange-700',
    dot: 'bg-orange-400',
  },
];

function statusConfig(s: OutreachStatus) {
  return STATUS_OPTIONS.find((o) => o.value === s) ?? STATUS_OPTIONS[0];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Date unknown' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function exportCsv(records: OutreachRecord[]) {
  const headers = ['Name', 'Email', 'Facility', 'Trial', 'NCT ID', 'Sent', 'Status', 'Notes'];
  const rows = records.map((r) =>
    [r.contactName, r.contactEmail, r.facility, r.trialTitle, r.nctId, formatDate(r.sentAt), statusConfig(r.status).label, r.notes]
      .map(csvField)
      .join(','),
  );
  downloadText('outreach-history.csv', [headers.join(','), ...rows].join('\r\n'));
}

/** onError receives a message on failure and null on success, so a stale failure banner clears once a later save works. */
function HistoryRow({ record, onError }: { record: OutreachRecord; onError: (msg: string | null) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(record.notes);
  const [savingNotes, setSavingNotes] = useState(false);
  const cfg = statusConfig(record.status);

  async function changeStatus(status: OutreachStatus) {
    if (status === record.status) return;
    try {
      await patchRecord(record.id, { status });
      onError(null);
    } catch {
      onError('The status change could not be saved. It has been put back. Try again in a moment.');
    }
  }

  async function saveNotes() {
    if (notes === record.notes) return;
    setSavingNotes(true);
    try {
      await patchRecord(record.id, { notes });
      onError(null);
    } catch {
      onError('Your note could not be saved. It is still in the box, so you can try again.');
    } finally {
      setSavingNotes(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete the record for ${record.contactEmail}? This cannot be undone.`)) return;
    const failed = await removeRecords([record.id]);
    onError(failed > 0 ? 'That record could not be deleted. It has been put back.' : null);
  }

  return (
    <div className={`group overflow-hidden rounded-xl border border-l-4 border-border bg-card ${cfg.border}`}>
      <div className="flex items-start gap-4 px-4 py-3.5">
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{record.contactName || record.contactEmail}</p>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${cfg.badge}`}>
              <span className={`size-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Mail size={11} />
            <span>{record.contactEmail}</span>
            {record.facility && (
              <>
                <span className="text-muted-foreground/30">&middot;</span>
                <Building2 size={11} />
                <span className="max-w-[220px] truncate">{record.facility}</span>
              </>
            )}
          </div>
        </button>

        {record.trialTitle && (
          <div className="hidden w-52 min-w-0 shrink-0 md:block">
            <p className="truncate text-xs leading-relaxed text-muted-foreground">{record.trialTitle}</p>
            {record.nctId && (
              <a
                href={`https://clinicaltrials.gov/study/${encodeURIComponent(record.nctId)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 flex items-center gap-0.5 font-mono text-xs text-primary hover:underline"
              >
                {record.nctId} <ExternalLink size={9} />
              </a>
            )}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:block">{formatDate(record.sentAt)}</span>
          <button
            type="button"
            onClick={() => void remove()}
            aria-label={`Delete record for ${record.contactEmail}`}
            className="cursor-pointer rounded p-1.5 text-muted-foreground opacity-60 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="cursor-pointer rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t bg-muted/10 px-4 py-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => void changeStatus(o.value)}
                  aria-pressed={record.status === o.value}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-all ${
                    record.status === o.value ? o.badge : 'bg-muted/50 text-muted-foreground ring-border hover:bg-muted'
                  }`}
                >
                  <span className={`size-1.5 rounded-full ${record.status === o.value ? o.dot : 'bg-muted-foreground/40'}`} />
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {(record.subject || record.bodyPreview) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Email sent</p>
              <div className="space-y-2 rounded-lg border bg-background p-3">
                {record.subject && (
                  <p className="text-xs text-muted-foreground">
                    Subject: <span className="font-medium text-foreground">{record.subject}</span>
                  </p>
                )}
                {record.bodyPreview && (
                  <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {record.bodyPreview}
                    {record.bodyPreview.length >= 150 ? '…' : ''}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor={`notes-${record.id}`}
              className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              <FileText size={11} /> Notes {savingNotes && <Loader2 size={11} className="animate-spin" />}
            </label>
            <textarea
              id={`notes-${record.id}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void saveNotes()}
              placeholder="Add notes about this contact. Saved when you click away."
              rows={2}
              className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function OutreachHistory() {
  const history = useHistory();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<OutreachStatus | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const records = history.records;

  useEffect(() => {
    ensureHistoryLoaded();
  }, []);

  const filtered = useMemo(() => {
    let r = records;
    if (filterStatus !== 'all') r = r.filter((x) => x.status === filterStatus);
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter((x) =>
        [x.contactName, x.contactEmail, x.trialTitle, x.facility, x.nctId, x.notes].some((v) => v.toLowerCase().includes(q)),
      );
    }
    return r;
  }, [records, search, filterStatus]);

  const stats = useMemo(
    () => ({
      total: records.length,
      noReply: records.filter((r) => r.status === 'no_reply').length,
      replied: records.filter((r) => r.status === 'replied').length,
      interested: records.filter((r) => r.status === 'interested').length,
    }),
    [records],
  );

  async function deleteShown() {
    const label = filtered.length === records.length ? 'all' : 'the shown';
    if (!confirm(`Delete ${label} ${filtered.length} record${filtered.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setClearing(true);
    const failed = await removeRecords(filtered.map((r) => r.id));
    setClearing(false);
    setError(
      failed > 0
        ? `${failed} record${failed === 1 ? '' : 's'} could not be deleted and ${failed === 1 ? 'has' : 'have'} been put back.`
        : null,
    );
  }

  const newEmailButton = (
    <Button variant="outline" size="sm" onClick={() => setComposing(true)}>
      <PenSquare size={13} /> New email
    </Button>
  );

  const loadFailedBanner = (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
    >
      <AlertCircle size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Outreach history could not be loaded</p>
        <p className="mt-0.5 text-sm">
          The history service did not respond.{' '}
          {records.length > 0 ? 'What you see below may be out of date.' : 'Your earlier outreach cannot be shown until it loads.'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => void loadHistory()}>
        <RotateCcw size={13} /> Try again
      </Button>
    </div>
  );

  // With nothing loaded, zero counts and "No outreach sent yet" would be false, so show only the failure.
  if (history.status === 'error' && records.length === 0) {
    return (
      <div className="space-y-4">
        {loadFailedBanner}
        <div className="flex justify-end">{newEmailButton}</div>
        {composing && <ManualComposer onClose={() => setComposing(false)} />}
      </div>
    );
  }

  if (history.status === 'off') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Mail size={32} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Outreach history is not set up</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Emails can still be sent, but they are not logged and people you already contacted are not flagged. To turn history on, deploy
            the history service and set VITE_API_URL, as described in the README.
          </p>
          <div className="mt-4 flex justify-center">{newEmailButton}</div>
        </div>
        {composing && <ManualComposer onClose={() => setComposing(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {history.status === 'error' && loadFailedBanner}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p className="flex-1">{error}</p>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total sent', value: stats.total, color: 'text-foreground', dot: 'bg-foreground/20' },
          { label: 'No reply', value: stats.noReply, color: 'text-slate-500', dot: 'bg-slate-400' },
          { label: 'Replied', value: stats.replied, color: 'text-blue-500', dot: 'bg-blue-400' },
          { label: 'Interested', value: stats.interested, color: 'text-green-600', dot: 'bg-green-400' },
        ].map((s) => (
          <div key={s.label} className="flex items-start gap-3 rounded-xl border bg-card p-4">
            <span className={`mt-2 size-2 shrink-0 rounded-full ${s.dot}`} />
            <div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <div className="relative min-w-48 flex-1">
          <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, trial or notes"
            aria-label="Search history"
            className="h-8 w-full rounded-md border bg-background pr-7 pl-8 text-sm placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium ${
              filterStatus === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setFilterStatus(o.value)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${
                filterStatus === o.value ? o.badge : 'bg-muted/50 text-muted-foreground ring-border hover:bg-muted'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <Separator orientation="vertical" className="h-6" />
        {newEmailButton}
        <Button variant="outline" size="sm" onClick={() => exportCsv(filtered)} disabled={filtered.length === 0}>
          <Download size={13} /> Export CSV
        </Button>
        {filtered.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void deleteShown()}
            disabled={clearing}
            className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
          >
            {clearing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {filtered.length === records.length ? 'Delete all' : 'Delete shown'}
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {records.length}
        </span>
      </div>

      {history.status === 'loading' && records.length === 0 ? (
        <div role="status" className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Loading outreach history&hellip;
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <Mail size={32} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">{records.length === 0 ? 'No outreach sent yet' : 'No records match your filters'}</p>
          <p className="mt-1 text-sm">
            {records.length === 0 ? 'Emails you send from search results will be tracked here.' : 'Try adjusting your search or filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <HistoryRow key={r.id} record={r} onError={setError} />
          ))}
        </div>
      )}

      {composing && <ManualComposer onClose={() => setComposing(false)} />}
    </div>
  );
}
