import { useState, useMemo } from 'react';
import {
  Copy,
  Download,
  Check,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ExternalLink,
  Mail,
  Phone,
  Loader2,
  Filter,
} from 'lucide-react';
import type { ContactRow, SortKey, SortDir } from '../types';
import { downloadCSV, copyToClipboard } from '../utils/export';

interface ResultsTableProps {
  contacts: ContactRow[];
  totalStudies: number;
  searchedLocation: string;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  RECRUITING: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  COMPLETED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  ACTIVE_NOT_RECRUITING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  TERMINATED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  WITHDRAWN: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  SUSPENDED: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  ENROLLING_BY_INVITATION: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

function statusStyle(status: string): string {
  return STATUS_STYLES[status.toUpperCase().replace(/ /g, '_')] ??
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={13} className="opacity-30" />;
  return sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
}

function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      className="ml-1 p-0.5 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 opacity-0 group-hover:opacity-100 transition"
      title="Copy email"
    >
      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
    </button>
  );
}

export default function ResultsTable({
  contacts,
  totalStudies,
  searchedLocation,
  hasMore,
  loadingMore,
  onLoadMore,
}: ResultsTableProps) {
  const [textFilter, setTextFilter] = useState('');
  const [emailOnly, setEmailOnly] = useState(false);
  const [piOnly, setPiOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('isPrincipalInvestigator');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    let rows = contacts;
    if (emailOnly) rows = rows.filter((r) => r.contactEmail);
    if (piOnly) rows = rows.filter((r) => r.isPrincipalInvestigator);
    if (textFilter) {
      const q = textFilter.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.contactName.toLowerCase().includes(q) ||
          r.contactEmail.toLowerCase().includes(q) ||
          r.facility.toLowerCase().includes(q) ||
          r.studyTitle.toLowerCase().includes(q) ||
          r.nctId.toLowerCase().includes(q) ||
          r.sponsor.toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'boolean') {
        return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sortDir === 'asc' ? -1 : 1;
      if (as > bs) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [contacts, textFilter, emailOnly, piOnly, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  async function handleCopyAll() {
    await copyToClipboard(filtered);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const withEmail = contacts.filter((c) => c.contactEmail).length;
  const piCount = contacts.filter((c) => c.isPrincipalInvestigator).length;

  const TH = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      onClick={() => handleSort(col)}
      className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 bg-slate-50 dark:bg-slate-900 whitespace-nowrap"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {contacts.length} contacts
            <span className="font-normal text-slate-500 dark:text-slate-400">
              {' '}across {totalStudies} trials near{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {searchedLocation}
              </span>
            </span>
          </h2>
          <div className="flex flex-wrap gap-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <Mail size={13} />
              {withEmail} with email
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              {piCount} PIs
            </span>
          </div>
        </div>

        {/* Export buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleCopyAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy CSV'}
          </button>
          <button
            onClick={() => downloadCSV(filtered)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
          >
            <Download size={14} />
            Download CSV
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder="Filter by name, email, facility…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={emailOnly}
            onChange={(e) => setEmailOnly(e.target.checked)}
            className="w-3.5 h-3.5 accent-blue-600"
          />
          Has email
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={piOnly}
            onChange={(e) => setPiOnly(e.target.checked)}
            className="w-3.5 h-3.5 accent-blue-600"
          />
          PIs only
        </label>
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
          {filtered.length} shown
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-auto max-h-[60vh]">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-600">
            No contacts match your filters.
          </div>
        ) : (
          <table className="w-full text-sm sticky-table">
            <thead>
              <tr>
                <TH label="Name" col="contactName" />
                <TH label="Role" col="contactRole" />
                <TH label="Email" col="contactEmail" />
                <TH label="Phone" col="contactPhone" />
                <TH label="Facility" col="facility" />
                <TH label="Study" col="studyTitle" />
                <TH label="Status" col="status" />
                <TH label="Phase" col="phase" />
                <TH label="NCT ID" col="nctId" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  {/* Name */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {row.contactName || <span className="text-slate-400 italic">—</span>}
                      </span>
                      {row.isPrincipalInvestigator && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 uppercase tracking-wide">
                          PI
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                    {row.contactRole || '—'}
                  </td>

                  {/* Email */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {row.contactEmail ? (
                      <div className="flex items-center">
                        <a
                          href={`mailto:${row.contactEmail}`}
                          className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                        >
                          {row.contactEmail}
                        </a>
                        <CopyEmailButton email={row.contactEmail} />
                      </div>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                    )}
                  </td>

                  {/* Phone */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {row.contactPhone ? (
                      <a
                        href={`tel:${row.contactPhone}`}
                        className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <Phone size={11} />
                        {row.contactPhone}
                      </a>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                    )}
                  </td>

                  {/* Facility */}
                  <td className="px-3 py-2.5">
                    <div className="text-slate-700 dark:text-slate-300 text-xs max-w-[180px] truncate" title={row.facility}>
                      {row.facility || '—'}
                    </div>
                    {(row.city || row.state) && (
                      <div className="text-slate-400 dark:text-slate-500 text-[11px]">
                        {[row.city, row.state].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </td>

                  {/* Study */}
                  <td className="px-3 py-2.5 max-w-[220px]">
                    <span
                      className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2"
                      title={row.studyTitle}
                    >
                      {row.studyTitle}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyle(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>

                  {/* Phase */}
                  <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {row.phase || '—'}
                  </td>

                  {/* NCT ID */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <a
                      href={`https://clinicaltrials.gov/study/${row.nctId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {row.nctId}
                      <ExternalLink size={10} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 transition-colors"
          >
            {loadingMore && <Loader2 size={14} className="animate-spin" />}
            {loadingMore ? 'Loading…' : 'Load more results'}
          </button>
        </div>
      )}
    </div>
  );
}
