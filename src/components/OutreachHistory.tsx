import { useState, useMemo } from 'react';
import {
  Search, Trash2, X,
  Mail, Building2, ExternalLink, FileText, Download, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { OutreachRecord, OutreachStatus } from '../types';
import { updateRecord, deleteRecord, clearHistory } from '../services/outreachHistory';

// ── status config ──────────────────────────────────────────────────────────────

export const STATUS_OPTIONS: { value: OutreachStatus; label: string; border: string; badge: string; dot: string }[] = [
  {
    value: 'no_reply',
    label: 'No Reply',
    border: 'border-l-slate-300 dark:border-l-slate-600',
    badge:  'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-600',
    dot:    'bg-slate-400',
  },
  {
    value: 'replied',
    label: 'Replied',
    border: 'border-l-blue-400 dark:border-l-blue-500',
    badge:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 ring-blue-200 dark:ring-blue-700',
    dot:    'bg-blue-400',
  },
  {
    value: 'interested',
    label: 'Interested',
    border: 'border-l-green-400 dark:border-l-green-500',
    badge:  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 ring-green-200 dark:ring-green-700',
    dot:    'bg-green-400',
  },
  {
    value: 'not_interested',
    label: 'Not Interested',
    border: 'border-l-red-400 dark:border-l-red-500',
    badge:  'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 ring-red-200 dark:ring-red-700',
    dot:    'bg-red-400',
  },
  {
    value: 'wrong_contact',
    label: 'Wrong Contact',
    border: 'border-l-orange-400 dark:border-l-orange-500',
    badge:  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 ring-orange-200 dark:ring-orange-700',
    dot:    'bg-orange-400',
  },
];

function statusConfig(s: OutreachStatus) {
  return STATUS_OPTIONS.find((o) => o.value === s) ?? STATUS_OPTIONS[0];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── export ────────────────────────────────────────────────────────────────────

function exportCSV(records: OutreachRecord[]) {
  const headers = ['Name', 'Email', 'Facility', 'Trial', 'NCT ID', 'Sent', 'Status', 'Notes'];
  const rows = records.map((r) => [
    r.contactName, r.contactEmail, r.facility, r.trialTitle, r.nctId,
    formatDate(r.sentAt), statusConfig(r.status).label, r.notes,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'outreach-history.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── row component ─────────────────────────────────────────────────────────────

function HistoryRow({
  record,
  onStatusChange,
  onNotesChange,
  onDelete,
}: {
  record: OutreachRecord;
  onStatusChange: (id: string, s: OutreachStatus) => void;
  onNotesChange: (id: string, n: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes]       = useState(record.notes);
  const cfg = statusConfig(record.status);

  function handleNoteBlur() {
    if (notes !== record.notes) onNotesChange(record.id, notes);
  }

  return (
    <div className={`group rounded-xl border-l-4 border border-border bg-card overflow-hidden transition-all ${cfg.border}`}>

      {/* Main row */}
      <div
        className="flex items-start gap-4 px-4 py-3.5 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Left: contact info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">{record.contactName}</p>
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 ${cfg.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground flex-wrap">
            <Mail size={11} />
            <span>{record.contactEmail}</span>
            {record.facility && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <Building2 size={11} />
                <span className="truncate max-w-[220px]">{record.facility}</span>
              </>
            )}
          </div>
        </div>

        {/* Middle: trial */}
        {record.trialTitle && (
          <div className="hidden md:block min-w-0 w-52 shrink-0">
            <p className="text-xs text-muted-foreground truncate leading-relaxed">{record.trialTitle}</p>
            {record.nctId && (
              <a
                href={`https://clinicaltrials.gov/study/${record.nctId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-mono text-primary hover:underline flex items-center gap-0.5 mt-0.5"
              >
                {record.nctId} <ExternalLink size={9} />
              </a>
            )}
          </div>
        )}

        {/* Right: date + actions */}
        <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-muted-foreground hidden sm:block">{formatDate(record.sentAt)}</span>
          <button
            onClick={() => onDelete(record.id)}
            title="Delete"
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all cursor-pointer"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 py-4 space-y-4 bg-muted/10">

          {/* Status picker */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => onStatusChange(record.id, o.value)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ring-1 transition-all cursor-pointer ${
                    record.status === o.value
                      ? `${o.badge} ring-offset-1`
                      : 'bg-muted/50 text-muted-foreground ring-border hover:bg-muted'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${record.status === o.value ? o.dot : 'bg-muted-foreground/40'}`} />
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Email preview */}
          {(record.subject || record.bodyPreview) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email sent</p>
              <div className="rounded-lg border bg-background p-3 space-y-2">
                {record.subject && (
                  <p className="text-xs text-muted-foreground">
                    Subject: <span className="text-foreground font-medium">{record.subject}</span>
                  </p>
                )}
                {record.bodyPreview && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {record.bodyPreview}{record.bodyPreview.length >= 150 ? '…' : ''}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={11} /> Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNoteBlur}
              placeholder="Add notes about this contact…"
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none placeholder:text-muted-foreground/50"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

interface Props {
  initialRecords: OutreachRecord[];
}

export default function OutreachHistory({ initialRecords }: Props) {
  const [records, setRecords]   = useState<OutreachRecord[]>(initialRecords);
  const [search, setSearch]     = useState('');
  const [filterStatus, setFilterStatus] = useState<OutreachStatus | 'all'>('all');

  const filtered = useMemo(() => {
    let r = records;
    if (filterStatus !== 'all') r = r.filter((x) => x.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) =>
        x.contactName.toLowerCase().includes(q) ||
        x.contactEmail.toLowerCase().includes(q) ||
        x.trialTitle.toLowerCase().includes(q) ||
        x.facility.toLowerCase().includes(q) ||
        x.nctId.toLowerCase().includes(q)
      );
    }
    return r;
  }, [records, search, filterStatus]);

  const stats = useMemo(() => ({
    total:      records.length,
    noReply:    records.filter((r) => r.status === 'no_reply').length,
    replied:    records.filter((r) => r.status === 'replied').length,
    interested: records.filter((r) => r.status === 'interested').length,
  }), [records]);

  function handleStatusChange(id: string, status: OutreachStatus) {
    updateRecord(id, { status });
    setRecords((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
  }

  function handleNotesChange(id: string, notes: string) {
    updateRecord(id, { notes });
    setRecords((prev) => prev.map((r) => r.id === id ? { ...r, notes } : r));
  }

  function handleDelete(id: string) {
    deleteRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  function handleClearAll() {
    if (!confirm('Clear all outreach history? This cannot be undone.')) return;
    clearHistory();
    setRecords([]);
  }

  return (
    <div className="space-y-6">

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total sent',   value: stats.total,      color: 'text-foreground',  dot: 'bg-foreground/20' },
          { label: 'No reply',     value: stats.noReply,    color: 'text-slate-500',   dot: 'bg-slate-400' },
          { label: 'Replied',      value: stats.replied,    color: 'text-blue-500',    dot: 'bg-blue-400' },
          { label: 'Interested',   value: stats.interested, color: 'text-green-500',   dot: 'bg-green-400' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4 flex items-start gap-3">
            <span className={`mt-2 w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
            <div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="rounded-xl border bg-card p-3 flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, trial…"
            className="w-full h-8 pl-8 pr-7 rounded-md border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterStatus('all')}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer ${
              filterStatus === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setFilterStatus(o.value)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-all cursor-pointer ring-1 ${
                filterStatus === o.value
                  ? `${o.badge}`
                  : 'bg-muted/50 text-muted-foreground ring-border hover:bg-muted'
              }`}
            >
              {filterStatus === o.value && <span className={`w-1.5 h-1.5 rounded-full ${o.dot}`} />}
              {o.label}
            </button>
          ))}
        </div>

        <Separator orientation="vertical" className="h-6" />

        <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)} className="cursor-pointer">
          <Download size={13} /> Export CSV
        </Button>

        {records.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClearAll} className="cursor-pointer text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
            <Trash2 size={13} /> Clear all
          </Button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} of {records.length}
        </span>
      </div>

      {/* Records */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Mail size={32} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">{records.length === 0 ? 'No outreach sent yet' : 'No records match your filters'}</p>
          <p className="text-sm mt-1">{records.length === 0 ? 'Send emails from the search results to track them here.' : 'Try adjusting your search or filter.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <HistoryRow
              key={r.id}
              record={r}
              onStatusChange={handleStatusChange}
              onNotesChange={handleNotesChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
