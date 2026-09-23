import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoCenter } from './ctgovRequest';
import { browserDeps, fetchAllStudies, type FetchProgress, type StopReason } from './fetchStudies';
import { geocodePlace } from './geocode';
import { isAbortError, SearchError, type SearchErrorKind } from './searchErrors';
import { queryKey, validateQuery, type QueryProblem, type SearchQuery } from './searchQuery';
import { createSiteIndex, type Site } from './siteIndex';

export interface SearchResult {
  query: SearchQuery;
  center: GeoCenter | null;
  sites: Site[];
  studiesFetched: number;
  totalStudies: number | null;
  studiesWithMatchingSites: number;
  sitesWithoutCoordinates: number;
  skippedRecords: number;
  stopReason: StopReason;
  failure: SearchErrorKind | null;
}

export type SearchState =
  | { phase: 'idle' }
  | { phase: 'invalid'; problem: QueryProblem }
  | { phase: 'loading'; step: 'locating' | 'fetching'; progress: FetchProgress; center: GeoCenter | null }
  | { phase: 'cancelled' }
  | { phase: 'error'; kind: SearchErrorKind }
  | { phase: 'done'; result: SearchResult };

const CACHE_LIMIT = 5;
const cache = new Map<string, SearchResult>();

function remember(key: string, result: SearchResult): void {
  cache.delete(key);
  cache.set(key, result);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function runSearch(q: SearchQuery, signal: AbortSignal, report: (s: SearchState) => void): Promise<void> {
  try {
    let center: GeoCenter | null = null;
    if (q.mode === 'radius') {
      center = await geocodePlace(q.place, signal, browserDeps);
      report({ phase: 'loading', step: 'fetching', progress: { studiesFetched: 0, totalStudies: null }, center });
    }
    const index = createSiteIndex(q, center);
    let skipped = 0;
    const outcome = await fetchAllStudies(
      q,
      center,
      (page) => {
        skipped += page.skippedRecords;
        index.addStudies(page.studies);
      },
      (progress) => report({ phase: 'loading', step: 'fetching', progress, center }),
      signal,
    );
    const summary = index.summary();
    const result: SearchResult = {
      query: q,
      center,
      sites: summary.sites,
      studiesFetched: outcome.studiesFetched,
      totalStudies: outcome.totalStudies,
      studiesWithMatchingSites: summary.studiesWithMatchingSites,
      sitesWithoutCoordinates: summary.sitesWithoutCoordinates,
      skippedRecords: skipped,
      stopReason: outcome.stopReason,
      failure: outcome.failure,
    };
    if (outcome.stopReason !== 'failed') remember(queryKey(q), result);
    report({ phase: 'done', result });
  } catch (err) {
    if (isAbortError(err) || signal.aborted) return;
    report({ phase: 'error', kind: err instanceof SearchError ? err.kind : 'ctgov_unavailable' });
  }
}

/**
 * Runs the search described by `query` whenever it (or `attempt`) changes.
 * Completed searches are cached for the session; partial or failed ones are not.
 */
export function useTrialSearch(query: SearchQuery | null, attempt: number): { state: SearchState; cancel: () => void } {
  const key = query ? `${queryKey(query)}#${attempt}` : null;
  const [entry, setEntry] = useState<{ key: string; state: SearchState } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const problem = query ? validateQuery(query) : null;
  const cached = query && !problem && attempt === 0 ? cache.get(queryKey(query)) ?? null : null;
  const shouldRun = query !== null && problem === null && cached === null;

  useEffect(() => {
    if (!shouldRun || !query || !key) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    void runSearch(query, controller.signal, (state) => {
      if (!controller.signal.aborted) setEntry({ key, state });
    });
    return () => controller.abort();
    // `key` captures every field of `query` and the attempt number.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, shouldRun]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    if (key) setEntry({ key, state: { phase: 'cancelled' } });
  }, [key]);

  let state: SearchState;
  if (!query) state = { phase: 'idle' };
  else if (problem) state = { phase: 'invalid', problem };
  else if (cached) state = { phase: 'done', result: cached };
  else if (entry && entry.key === key) state = entry.state;
  else {
    state = {
      phase: 'loading',
      step: query.mode === 'radius' ? 'locating' : 'fetching',
      progress: { studiesFetched: 0, totalStudies: null },
      center: null,
    };
  }
  return { state, cancel };
}
