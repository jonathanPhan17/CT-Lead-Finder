import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Copy, Download, Check, Mail, Search, X, ArrowUpDown,
  ExternalLink, ChevronLeft, ChevronRight, Building2,
  MapPin,
} from 'lucide-react';
import OutreachComposer from './OutreachComposer';
import OutreachCart from './OutreachCart';
import { getContactedEmails } from '../services/outreachHistory';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { ContactRow } from '../types';
import { downloadCSV, copyToClipboard } from '../utils/export';

const PAGE_SIZE = 15; // cards per page

type SortOption = 'outreach' | 'pi-first' | 'has-email' | 'most-contacts' | 'facility-az' | 'condition-az' | 'sponsor-az' | 'default';

const SORT_LABELS: Record<SortOption, string> = {
  'outreach':       'Best for outreach',
  'pi-first':       'Most PIs first',
  'has-email':      'Most emails first',
  'most-contacts':  'Most contacts first',
  'facility-az':    'Facility (A–Z)',
  'condition-az':   'Condition (A–Z)',
  'sponsor-az':     'Sponsor (A–Z)',
  'default':        'Default order',
};

function sortGroups(groups: LocationGroup[], sort: SortOption): LocationGroup[] {
  if (sort === 'default') return groups;
  const sorted = [...groups];
  switch (sort) {
    case 'outreach':
      // PIs with emails first, then PIs without emails, then the rest
      sorted.sort((a, b) => {
        const aEmailPIs = a.contacts.filter((c) => c.isPrincipalInvestigator && c.contactEmail).length;
        const bEmailPIs = b.contacts.filter((c) => c.isPrincipalInvestigator && c.contactEmail).length;
        if (bEmailPIs !== aEmailPIs) return bEmailPIs - aEmailPIs;
        const aPIs = a.contacts.filter((c) => c.isPrincipalInvestigator).length;
        const bPIs = b.contacts.filter((c) => c.isPrincipalInvestigator).length;
        if (bPIs !== aPIs) return bPIs - aPIs;
        const aEmails = a.contacts.filter((c) => c.contactEmail).length;
        const bEmails = b.contacts.filter((c) => c.contactEmail).length;
        return bEmails - aEmails;
      });
      break;
    case 'pi-first':
      sorted.sort((a, b) =>
        b.contacts.filter((c) => c.isPrincipalInvestigator).length -
        a.contacts.filter((c) => c.isPrincipalInvestigator).length
      );
      break;
    case 'has-email':
      sorted.sort((a, b) =>
        b.contacts.filter((c) => c.contactEmail).length -
        a.contacts.filter((c) => c.contactEmail).length
      );
      break;
    case 'most-contacts':
      sorted.sort((a, b) => b.contacts.length - a.contacts.length);
      break;
    case 'facility-az':
      sorted.sort((a, b) => (a.facility || 'zzz').localeCompare(b.facility || 'zzz'));
      break;
    case 'condition-az':
      sorted.sort((a, b) => (a.conditions || 'zzz').localeCompare(b.conditions || 'zzz'));
      break;
    case 'sponsor-az':
      sorted.sort((a, b) => (a.sponsor || 'zzz').localeCompare(b.sponsor || 'zzz'));
      break;
  }
  return sorted;
}

interface ResultsTableProps {
  contacts: ContactRow[];
  searchedLocation: string;
  distance: number;
}

// ── status badge ──────────────────────────────────────────────────────────────

const STATUS_CLASSES: Record<string, string> = {
  RECRUITING:            'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-transparent',
  COMPLETED:             'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-transparent',
  ACTIVE_NOT_RECRUITING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-transparent',
  TERMINATED:            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-transparent',
  WITHDRAWN:             'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-transparent',
  SUSPENDED:             'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-transparent',
};

function statusClass(s: string) {
  return STATUS_CLASSES[s.toUpperCase().replace(/ /g, '_')] ??
    'bg-slate-100 text-slate-500 border-transparent';
}
function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── grouping ──────────────────────────────────────────────────────────────────

interface LocationGroup {
  key: string;
  nctId: string;
  studyTitle: string;
  status: string;
  phase: string;
  sponsor: string;
  conditions: string;
  facility: string;
  city: string;
  state: string;
  country: string;
  isCentral: boolean;
  contacts: ContactRow[];
}

function groupContacts(contacts: ContactRow[]): LocationGroup[] {
  const map = new Map<string, LocationGroup>();

  for (const c of contacts) {
    const key = c.source === 'central'
      ? `${c.nctId}|__central__`
      : `${c.nctId}|${c.facility}|${c.city}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        nctId: c.nctId,
        studyTitle: c.studyTitle,
        status: c.status,
        phase: c.phase,
        sponsor: c.sponsor,
        conditions: c.conditions,
        facility: c.facility,
        city: c.city,
        state: c.state,
        country: c.country,
        isCentral: c.source === 'central',
        contacts: [],
      });
    }
    map.get(key)!.contacts.push(c);
  }

  // PIs first within each group
  for (const g of map.values()) {
    g.contacts.sort((a, b) => Number(b.isPrincipalInvestigator) - Number(a.isPrincipalInvestigator));
  }

  return Array.from(map.values());
}

// ── copy email button ─────────────────────────────────────────────────────────

function CopyEmailBtn({ email }: { email: string }) {
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
      title="Copy email"
      className="ml-1 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
    >
      {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
    </button>
  );
}

// ── location card ─────────────────────────────────────────────────────────────

interface LocationCardProps {
  group: LocationGroup;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  contactedEmails: Set<string>;
}

function LocationCard({ group, selectedIds, onToggle, contactedEmails }: LocationCardProps) {
  const locationLine  = [group.city, group.state, group.country].filter(Boolean).join(', ');
  const piContacts    = group.contacts.filter((c) => c.isPrincipalInvestigator);
  const otherContacts = group.contacts.filter((c) => !c.isPrincipalInvestigator);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Card header — study info */}
      <div className="px-4 py-3 bg-muted/30 border-b flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <Badge className={`text-[10px] h-5 px-2 font-semibold ${statusClass(group.status)}`}>
              {statusLabel(group.status)}
            </Badge>
            {group.phase && group.phase.toUpperCase() !== 'NA' && (
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {group.phase}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground leading-snug">{group.studyTitle}</p>
          {group.sponsor && (
            <p className="text-xs text-muted-foreground mt-0.5">{group.sponsor}</p>
          )}
        </div>
        <a
          href={`https://clinicaltrials.gov/study/${group.nctId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline shrink-0 cursor-pointer"
        >
          {group.nctId} <ExternalLink size={10} />
        </a>
      </div>

      {/* Site location row */}
      <div className="px-4 py-2.5 border-b flex items-center gap-3 bg-muted/10">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">Site</span>
        <Building2 size={14} className="text-muted-foreground shrink-0" />
        <div className="min-w-0 flex items-center gap-1.5">
          {group.facility && (
            <span className="text-sm font-medium text-foreground">{group.facility}</span>
          )}
          {locationLine && (
            <>
              <span className="text-muted-foreground">—</span>
              <span className="text-xs text-muted-foreground">{locationLine}</span>
            </>
          )}
        </div>
      </div>

      {/* Contacts */}
      <div className="divide-y divide-border">
        {piContacts.map((c) => (
          <ContactRow
            key={c.id}
            contact={c}
            selected={selectedIds.has(c.id)}
            onToggle={onToggle}
            wasContacted={contactedEmails.has(c.contactEmail.toLowerCase())}
          />
        ))}
        {otherContacts.map((c) => (
          <ContactRow
            key={c.id}
            contact={c}
            selected={selectedIds.has(c.id)}
            onToggle={onToggle}
            wasContacted={contactedEmails.has(c.contactEmail.toLowerCase())}
          />
        ))}
        {group.contacts.length === 0 && (
          <div className="px-4 py-3 text-xs text-muted-foreground italic">No contact info listed.</div>
        )}
      </div>
    </div>
  );
}

interface ContactRowProps {
  contact: ContactRow;
  selected: boolean;
  onToggle: (id: string) => void;
  wasContacted: boolean;
}

function ContactRow({ contact: c, selected, onToggle, wasContacted }: ContactRowProps) {
  return (
    <div
      className={`px-4 py-3 flex items-start justify-between gap-4 hover:bg-muted/20 transition-colors ${selected ? 'bg-primary/5' : ''}`}
    >
      {/* Checkbox (only for contacts with email) */}
      <div className="shrink-0 pt-0.5">
        {c.contactEmail ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(c.id)}
            className="accent-primary w-4 h-4 cursor-pointer rounded"
          />
        ) : (
          <span className="w-4 h-4 inline-block" />
        )}
      </div>

      {/* Left: name + role */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm ${c.isPrincipalInvestigator ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'}`}>
            {c.contactName || <span className="italic text-muted-foreground">Unnamed</span>}
          </span>
          {c.isPrincipalInvestigator && (
            <Badge className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-transparent hover:bg-primary/10 font-semibold">
              PI
            </Badge>
          )}
          {wasContacted && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-medium">
              Contacted
            </span>
          )}
        </div>
        {c.contactRole && (
          <p className="text-xs text-muted-foreground mt-0.5">{c.contactRole}</p>
        )}
      </div>

      {/* Right: email */}
      <div className="shrink-0 flex items-center">
        {c.contactEmail ? (
          <div className="flex items-center gap-1">
            <Mail size={13} className="text-muted-foreground" />
            <a
              href={`mailto:${c.contactEmail}`}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {c.contactEmail}
            </a>
            <CopyEmailBtn email={c.contactEmail} />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/40 italic">No email listed</span>
        )}
      </div>
    </div>
  );
}

// ── stat chip ─────────────────────────────────────────────────────────────────

function StatChip({
  value, label, icon, highlight, dot,
}: {
  value: number;
  label: string;
  icon?: React.ReactNode;
  highlight?: boolean;
  dot?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm ${
      highlight
        ? 'bg-primary/10 text-primary font-medium'
        : 'bg-muted text-muted-foreground'
    }`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
      {icon}
      <span className="font-semibold text-foreground">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function ResultsTable({
  contacts, searchedLocation, distance,
}: ResultsTableProps) {
  const [emailOnly, setEmailOnly] = useState(false);
  const [piOnly, setPiOnly]       = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy]       = useState<SortOption>('outreach');
  const [page, setPage]           = useState(1);
  const [copied, setCopied]       = useState(false);

  // Outreach selection
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [showComposer, setShowComposer]   = useState(false);
  const [contactedEmails, setContactedEmails] = useState<Set<string>>(getContactedEmails);

  useEffect(() => { setPage(1); }, [emailOnly, piOnly, searchQuery, sortBy]);

  // Refresh contacted emails whenever composer closes (new sends may have been added)
  const handleComposerClose = useCallback(() => {
    setShowComposer(false);
    setContactedEmails(getContactedEmails());
    setSelectedIds(new Set());
  }, []);

  // Filter flat contacts (for export + stats)
  const filtered = useMemo(() => {
    let rows = contacts;
    if (emailOnly) rows = rows.filter((r) => r.contactEmail);
    if (piOnly)    rows = rows.filter((r) => r.isPrincipalInvestigator);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter((r) =>
        r.contactName.toLowerCase().includes(q) ||
        r.studyTitle.toLowerCase().includes(q) ||
        r.facility.toLowerCase().includes(q) ||
        r.conditions.toLowerCase().includes(q) ||
        r.sponsor.toLowerCase().includes(q) ||
        r.nctId.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [contacts, emailOnly, piOnly, searchQuery]);

  // Group filtered contacts into location cards, then sort
  const groups = useMemo(
    () => sortGroups(groupContacts(filtered), sortBy),
    [filtered, sortBy],
  );

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageGroups = groups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const isLastPage = safePage === totalPages;

  const piCount       = contacts.filter((c) => c.isPrincipalInvestigator).length;
  const pisWithEmail  = contacts.filter((c) => c.isPrincipalInvestigator && c.contactEmail).length;

  // All contacts with emails (across all pages, for select-all)
  const allWithEmail = useMemo(() => filtered.filter((c) => c.contactEmail), [filtered]);
  const selectedContacts = useMemo(
    () => allWithEmail.filter((c) => selectedIds.has(c.id)),
    [allWithEmail, selectedIds],
  );

  const allSelected = allWithEmail.length > 0 && allWithEmail.every((c) => selectedIds.has(c.id));

  function toggleContact(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allWithEmail.map((c) => c.id)));
    }
  }

  async function handleCopyAll() {
    await copyToClipboard(filtered);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="rounded-xl border bg-card p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Location + stats */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-sm">
            <MapPin size={13} className="text-primary" />
            <span className="text-foreground font-medium">{searchedLocation}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
              {distance} {distance === 1 ? 'mile' : 'miles'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatChip value={piCount} label="PIs" dot />
            <StatChip value={pisWithEmail} label="PIs with email" icon={<Mail size={11} />} highlight />
          </div>
        </div>

        {/* Right: search + filters + export */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search within results */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search results…"
              className="h-8 w-48 pl-8 pr-7 rounded-md border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <ArrowUpDown size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-8 pl-8 pr-3 rounded-md border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer appearance-none"
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Toggle filters */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
              <input type="checkbox" checked={emailOnly} onChange={(e) => setEmailOnly(e.target.checked)} className="accent-primary w-4 h-4 cursor-pointer rounded" />
              Has email
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
              <input type="checkbox" checked={piOnly} onChange={(e) => setPiOnly(e.target.checked)} className="accent-primary w-4 h-4 cursor-pointer rounded" />
              PIs only
            </label>
          </div>

          <Separator orientation="vertical" className="h-6" />

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyAll} className="cursor-pointer">
              {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy CSV'}
            </Button>
            <Button size="sm" onClick={() => downloadCSV(filtered)} className="cursor-pointer">
              <Download size={13} />Download CSV
            </Button>
          </div>

          {allWithEmail.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-6" />
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="accent-primary w-4 h-4 cursor-pointer rounded"
                />
                Select all
              </label>
            </>
          )}
        </div>
      </div>

      {/* Cards */}
      {groups.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          No contacts match your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {pageGroups.map((group) => (
            <LocationCard
              key={group.key}
              group={group}
              selectedIds={selectedIds}
              onToggle={toggleContact}
              contactedEmails={contactedEmails}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {groups.length > 0 && (
        <div className="flex items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="icon"
              disabled={safePage === 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-8 w-8 cursor-pointer"
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="text-sm text-muted-foreground min-w-[80px] text-center">
              Page {safePage} of {totalPages}
            </span>
            <Button
              variant="outline" size="icon"
              disabled={isLastPage}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 w-8 cursor-pointer"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, groups.length)} of {groups.length} sites
          </span>
        </div>
      )}

      <OutreachCart
        selected={selectedContacts}
        onRemove={toggleContact}
        onClear={() => setSelectedIds(new Set())}
        onCompose={() => setShowComposer(true)}
      />

      {showComposer && selectedContacts.length > 0 && (
        <OutreachComposer contacts={selectedContacts} onClose={handleComposerClose} />
      )}
    </div>
  );
}
