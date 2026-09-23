import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, Download, Info, RotateCcw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_STUDIES } from '@/search/fetchStudies';
import { SEARCH_ERROR_MESSAGES } from '@/search/searchErrors';
import { describeQuery } from '@/search/searchQuery';
import { filterSites, SITE_SORT_LABELS, sitesToCsv, sortSites, totals, type SiteSort, type ViewFilters } from '@/search/resultsView';
import type { SearchResult } from '@/search/useTrialSearch';
import { findUsState } from '@/search/usStates';
import { copyText, downloadText, fileSlug } from '@/utils/download';
import SiteCard from './SiteCard';

const SITES_PER_PAGE = 20;

interface Props {
  result: SearchResult;
  selected: ReadonlySet<string>;
  contacted: ReadonlySet<string>;
  onToggle: (email: string) => void;
  onSelectMany: (emails: string[], on: boolean) => void;
  onRetry: () => void;
}

export default function ResultsView({ result, selected, contacted, onToggle, onSelectMany, onRetry }: Props) {
  const isRadius = result.query.mode === 'radius';
  const [filters, setFilters] = useState<ViewFilters>({
    emailOnly: false,
    piOnly: false,
    text: '',
  });
  const [sort, setSort] = useState<SiteSort>(isRadius ? 'distance' : 'outreach');
  const [page, setPage] = useState(0);
  const [copyState, setCopyState] = useState<'copied' | 'failed' | null>(null);
  const deferredText = useDeferredValue(filters.text);

  const { emailOnly, piOnly } = filters;
  // Keyed on the deferred text, not filters.text, so typing stays responsive on large result sets.
  const visible = useMemo(
    () => sortSites(filterSites(result.sites, { emailOnly, piOnly, text: deferredText }), sort),
    [result.sites, emailOnly, piOnly, deferredText, sort],
  );
  const allTotals = useMemo(() => totals(result.sites), [result.sites]);
  const shownTotals = useMemo(() => totals(visible), [visible]);
  const pageCount = Math.max(1, Math.ceil(visible.length / SITES_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageSites = useMemo(() => visible.slice(currentPage * SITES_PER_PAGE, (currentPage + 1) * SITES_PER_PAGE), [visible, currentPage]);
  const pageEmails = useMemo(() => [...new Set(pageSites.flatMap((s) => s.people.flatMap((p) => p.emails)))], [pageSites]);
  const pageAllSelected = pageEmails.length > 0 && pageEmails.every((e) => selected.has(e));
  const filtered = filters.emailOnly || filters.piOnly || filters.text.trim() !== '';

  function setFilter(patch: Partial<ViewFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  }

  function clearFilters() {
    setFilter({ emailOnly: false, piOnly: false, text: '' });
  }

  function handleDownload() {
    downloadText(`${fileSlug(describeQuery(result.query))}.csv`, sitesToCsv(visible));
  }

  async function handleCopy() {
    const emails = [...new Set(visible.flatMap((s) => s.people.flatMap((p) => p.emails)))];
    const ok = emails.length > 0 && (await copyText(emails.join(', ')));
    setCopyState(ok ? 'copied' : 'failed');
    setTimeout(() => setCopyState(null), 2500);
  }

  const notices: ReactNode[] = [];
  if (result.stopReason === 'failed' && result.failure) {
    notices.push(
      <Notice
        key="failed"
        tone="warn"
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw size={13} /> Try again
          </Button>
        }
      >
        These results are incomplete. Only {result.studiesFetched.toLocaleString()}
        {result.totalStudies !== null && ` of ${result.totalStudies.toLocaleString()}`} trials were read before the search stopped (
        {SEARCH_ERROR_MESSAGES[result.failure].title.toLowerCase()}).
      </Notice>,
    );
  }
  if (result.stopReason === 'cap') {
    notices.push(
      <Notice key="cap" tone="warn">
        This search matched {result.totalStudies?.toLocaleString() ?? 'more than ' + MAX_STUDIES.toLocaleString()} trials. Only the first{' '}
        {result.studiesFetched.toLocaleString()} were read. Add a condition or pick a smaller area to see everything.
      </Notice>,
    );
  }
  if (result.skippedRecords > 0) {
    notices.push(
      <Notice key="skipped" tone="info">
        {result.skippedRecords} trial record
        {result.skippedRecords === 1 ? ' was' : 's were'} unreadable and left out.
      </Notice>,
    );
  }
  if (isRadius && result.center) {
    notices.push(
      <Notice key="center" tone="info">
        Distances are measured from {result.center.label} to the center of each site&rsquo;s city, so a site near the edge of the radius may
        be slightly inside or outside it.
        {result.sitesWithoutCoordinates > 0 &&
          ` ${result.sitesWithoutCoordinates.toLocaleString()} site listing${result.sitesWithoutCoordinates === 1 ? '' : 's'} in ${
            findUsState(result.center.stateCode ?? '')?.name ?? 'the same state'
          } ${result.sitesWithoutCoordinates === 1 ? 'has' : 'have'} no map location and could not be checked.`}
      </Notice>,
    );
  }

  return (
    <section className="space-y-4" aria-label="Search results">
      <div>
        <h2 className="text-lg font-semibold">{describeQuery(result.query)}</h2>
        {allTotals.sites > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {allTotals.sites.toLocaleString()} site
            {allTotals.sites === 1 ? '' : 's'} across {allTotals.trials.toLocaleString()} trial
            {allTotals.trials === 1 ? '' : 's'}, with {allTotals.people.toLocaleString()} listed contact
            {allTotals.people === 1 ? '' : 's'}. {allTotals.peopleWithEmail.toLocaleString()} have an email address (
            {allTotals.distinctEmails.toLocaleString()} unique) and {allTotals.pis.toLocaleString()} are listed as principal investigators.
          </p>
        )}
      </div>

      {notices}

      {result.sites.length === 0 ? (
        <EmptyState mode={result.query.mode} hasCondition={result.query.condition.trim() !== ''} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <div className="relative min-w-48 flex-1">
              <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={filters.text}
                onChange={(e) => setFilter({ text: e.target.value })}
                placeholder="Filter by site, person, email, trial or sponsor"
                aria-label="Filter results"
                className="h-8 w-full rounded-md border bg-background pr-7 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              {filters.text && (
                <button
                  type="button"
                  onClick={() => setFilter({ text: '' })}
                  aria-label="Clear filter"
                  className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={filters.emailOnly}
                onChange={(e) => setFilter({ emailOnly: e.target.checked })}
                className="accent-primary"
              />
              Has email
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={filters.piOnly}
                onChange={(e) => setFilter({ piOnly: e.target.checked })}
                className="accent-primary"
              />
              PIs only
            </label>
            <select
              value={sort}
              onChange={(e) => {
                const next = (Object.keys(SITE_SORT_LABELS) as SiteSort[]).find((k) => k === e.target.value);
                if (next) setSort(next);
                setPage(0);
              }}
              aria-label="Sort sites"
              className="h-8 cursor-pointer rounded-md border bg-background px-2 text-sm"
            >
              {(Object.keys(SITE_SORT_LABELS) as SiteSort[])
                .filter((k) => k !== 'distance' || isRadius)
                .map((k) => (
                  <option key={k} value={k}>
                    {SITE_SORT_LABELS[k]}
                  </option>
                ))}
            </select>
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={visible.length === 0}>
              <Download size={13} /> Download CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleCopy()} disabled={shownTotals.distinctEmails === 0}>
              {copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />}
              {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : `Copy ${shownTotals.distinctEmails} emails`}
            </Button>
          </div>

          {filtered && (
            <p className="text-xs text-muted-foreground">
              Showing {shownTotals.sites.toLocaleString()} of {allTotals.sites.toLocaleString()} sites and{' '}
              {shownTotals.people.toLocaleString()} of {allTotals.people.toLocaleString()} contacts.{' '}
              <button type="button" className="cursor-pointer font-medium text-primary hover:underline" onClick={clearFilters}>
                Clear filters
              </button>
            </p>
          )}

          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No sites match these filters.{' '}
              <button type="button" className="cursor-pointer font-medium text-primary hover:underline" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pageAllSelected}
                    disabled={pageEmails.length === 0}
                    onChange={() => onSelectMany(pageEmails, !pageAllSelected)}
                    className="accent-primary"
                  />
                  Select all {pageEmails.length} email
                  {pageEmails.length === 1 ? '' : 's'} on this page
                </label>
                <Pager page={currentPage} pageCount={pageCount} onPage={setPage} />
              </div>
              <div className="space-y-3">
                {pageSites.map((s) => (
                  <SiteCard key={s.key} site={s} selected={selected} contacted={contacted} onToggle={onToggle} />
                ))}
              </div>
              <div className="flex justify-end">
                <Pager
                  page={currentPage}
                  pageCount={pageCount}
                  onPage={(p) => {
                    setPage(p);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Result pages" className="flex items-center gap-2 text-sm">
      <Button variant="outline" size="icon-sm" onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Previous page">
        <ChevronLeft size={14} />
      </Button>
      <span className="text-muted-foreground">
        Page {page + 1} of {pageCount}
      </span>
      <Button variant="outline" size="icon-sm" onClick={() => onPage(page + 1)} disabled={page >= pageCount - 1} aria-label="Next page">
        <ChevronRight size={14} />
      </Button>
    </nav>
  );
}

function Notice({ tone, action, children }: { tone: 'warn' | 'info'; action?: ReactNode; children: ReactNode }) {
  const warn = tone === 'warn';
  return (
    <div
      role={warn ? 'alert' : undefined}
      className={
        warn
          ? 'flex flex-wrap items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
          : 'flex flex-wrap items-start gap-3 rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground'
      }
    >
      {warn ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}
      <p className="min-w-0 flex-1">{children}</p>
      {action}
    </div>
  );
}

function EmptyState({ mode, hasCondition }: { mode: SearchResult['query']['mode']; hasCondition: boolean }) {
  const tips = [
    'Tick more site statuses, such as "Active, not recruiting".',
    hasCondition ? 'Remove the condition or use a broader term.' : null,
    mode === 'city' ? 'Check the city spelling. Suburbs are listed under their own name.' : null,
    mode === 'institution' ? 'Try a shorter form of the name, or clear the state.' : null,
    mode === 'radius' ? 'Pick a wider radius.' : null,
  ].filter((t): t is string => t !== null);
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <p className="font-medium">No trial sites matched this search</p>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
