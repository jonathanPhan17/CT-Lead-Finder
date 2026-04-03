import { useState, useMemo } from 'react';
import {
  Search, Trash2, X, ChevronDown, ChevronUp,
  Mail, Building2, ExternalLink, FileText, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { OutreachRecord, OutreachStatus } from '../types';
import { updateRecord, deleteRecord, clearHistory } from '../services/outreachHistory';

// ── status config ──────────────────────────────────────────────────────────────

export const STATUS_OPTIONS: { value: OutreachStatus; label: string; color: string }[] = [
  { value: 'no_reply',      label: 'No Reply',       color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  { value: 'replied',       label: 'Replied',         color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  { value: 'interested',    label: 'Interested',      color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  { value: 'not_interested',label: 'Not Interested',  color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  { value: 'wrong_contact', label: 'Wrong Contact',   color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' },
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
    <div className="border rounded-xl overflow-hidden bg-card">
      {/* Main row */}
      <div
        className="flex flex-wrap items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Name + facility */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{record.contactName}</p>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground flex-wrap">
            <Mail size={11} />
            <span>{record.contactEmail}</span>
            {record.facility && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <Building2 size={11} />
                <span className="truncate max-w-[200px]">{record.facility}</span>
              </>
            )}
          </div>
        </div>

        {/* Trial */}
        <div className="hidden sm:block min-w-0 w-48 shrink-0">
          <p className="text-xs text-muted-foreground truncate">{record.trialTitle}</p>
          <a
            href={`https://clinicaltrials.gov/study/${record.nctId}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-mono text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5"
          >
            {record.nctId} <ExternalLink size={9} />
          </a>
        </div>

        {/* Sent date */}
        <div className="shrink-0 text-xs text-muted-foreground w-24 text-right hidden md:block">
          {formatDate(record.sentAt)}
        </div>

        {/* Status dropdown */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <select
            value={record.status}
            onChange={(e) => onStatusChange(record.id, e.target.value as OutreachStatus)}
            className={`text-xs font-medium px-2 py-1 rounded-md border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary ${cfg.color}`}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Expand + delete */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onDelete(record.id)}
            className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
            title="Delete record"
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
          {/* Email preview */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email sent</p>
            <div className="rounded-lg border bg-background p-3 space-y-2">
              <p className="text-xs text-muted-foreground">Subject: <span className="text-foreground font-medium">{record.subject}</span></p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{record.bodyPreview}{record.bodyPreview.length >= 150 ? '…' : ''}</p>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={11} /> Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNoteBlur}
              placeholder="Add notes about this contact (replied, left voicemail, referred to Dr. X, etc.)"
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

  // Stats
  const stats = useMemo(() => {
    const total       = records.length;
    const replied     = records.filter((r) => r.status === 'replied').length;
    const interested  = records.filter((r) => r.status === 'interested').length;
    const noReply     = records.filter((r) => r.status === 'no_reply').length;
    return { total, replied, interested, noReply };
  }, [records]);

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
          { label: 'Total sent',   value: stats.total,      color: 'text-foreground' },
          { label: 'No reply',     value: stats.noReply,    color: 'text-slate-500' },
          { label: 'Replied',      value: stats.replied,    color: 'text-blue-500' },
          { label: 'Interested',   value: stats.interested, color: 'text-green-500' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="rounded-xl border bg-card p-4 flex flex-wrap items-center gap-3">
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

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as OutreachStatus | 'all')}
          className="h-8 px-3 rounded-md border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

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
          {filtered.length} of {records.length} records
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
