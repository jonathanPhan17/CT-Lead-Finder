import { parseStudiesPage, type StudiesPage } from './ctgovParse';
import { buildStudiesParams, CTGOV_STUDIES_URL, PAGE_SIZE, type GeoCenter } from './ctgovRequest';
import { isAbortError, SearchError, type SearchErrorKind } from './searchErrors';
import type { SearchQuery } from './searchQuery';

/** Hard stop so one search cannot download unbounded data. Reported to the user when hit. */
export const MAX_STUDIES = 10_000;
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_RETRY_WAIT_MS = 30_000;

export interface FetchDeps {
  fetch: typeof fetch;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  isOnline: () => boolean;
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export const browserDeps: FetchDeps = {
  fetch: (input, init) => fetch(input, init),
  sleep: abortableSleep,
  isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
};

export interface FetchProgress {
  studiesFetched: number;
  totalStudies: number | null;
}

export type StopReason = 'complete' | 'cap' | 'failed';

export interface FetchOutcome {
  studiesFetched: number;
  totalStudies: number | null;
  stopReason: StopReason;
  /** Set when a page after the first failed; results so far are still usable. */
  failure: SearchErrorKind | null;
}

function retryDelayMs(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_WAIT_MS);
  return Math.min(1000 * 2 ** attempt + Math.floor(Math.random() * 250), MAX_RETRY_WAIT_MS);
}

/** Fetches one page, retrying rate limits, server errors, timeouts and network drops. */
async function fetchPage(url: string, signal: AbortSignal, deps: FetchDeps): Promise<StudiesPage> {
  let lastKind: SearchErrorKind = 'ctgov_unavailable';
  let waitMs = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (waitMs > 0) await deps.sleep(waitMs, signal);
    waitMs = retryDelayMs(attempt, null);
    let resp: Response;
    try {
      resp = await deps.fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
        headers: { Accept: 'application/json' },
      });
    } catch {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      lastKind = deps.isOnline() ? 'ctgov_unavailable' : 'offline';
      continue;
    }
    if (resp.status === 429) {
      lastKind = 'rate_limited';
      waitMs = retryDelayMs(attempt, resp.headers.get('Retry-After'));
      continue;
    }
    if (resp.status >= 500) {
      lastKind = 'ctgov_unavailable';
      continue;
    }
    if (resp.status === 400) throw new SearchError('invalid_query');
    if (!resp.ok) throw new SearchError('ctgov_unavailable');

    let json: unknown;
    try {
      json = await resp.json();
    } catch (err) {
      if (isAbortError(err) || signal.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new SearchError('bad_response');
    }
    const page = parseStudiesPage(json);
    if (!page) throw new SearchError('bad_response');
    return page;
  }
  throw new SearchError(lastKind);
}

/**
 * Walks every result page until done, the MAX_STUDIES cap, or a failure.
 * A failure on the first page throws; a later failure returns what was fetched.
 */
export async function fetchAllStudies(
  q: SearchQuery,
  center: GeoCenter | null,
  onPage: (page: StudiesPage) => void,
  onProgress: (p: FetchProgress) => void,
  signal: AbortSignal,
  deps: FetchDeps = browserDeps,
): Promise<FetchOutcome> {
  let token: string | null = null;
  const seenTokens = new Set<string>();
  let fetched = 0;
  let total: number | null = null;

  for (;;) {
    let page: StudiesPage;
    try {
      page = await fetchPage(`${CTGOV_STUDIES_URL}?${buildStudiesParams(q, center, token)}`, signal, deps);
    } catch (err) {
      if (fetched === 0 || !(err instanceof SearchError)) throw err;
      return { studiesFetched: fetched, totalStudies: total, stopReason: 'failed', failure: err.kind };
    }
    if (token === null) total = page.totalCount;
    fetched += page.studies.length;
    onPage(page);
    onProgress({ studiesFetched: fetched, totalStudies: total });

    const next = page.nextPageToken;
    if (next === null || page.studies.length === 0) {
      return { studiesFetched: fetched, totalStudies: total, stopReason: 'complete', failure: null };
    }
    // A token we already followed means the server is looping; keep what we have but say it is partial.
    if (seenTokens.has(next)) {
      return { studiesFetched: fetched, totalStudies: total, stopReason: 'failed', failure: 'bad_response' };
    }
    if (fetched + PAGE_SIZE > MAX_STUDIES) {
      return { studiesFetched: fetched, totalStudies: total, stopReason: 'cap', failure: null };
    }
    seenTokens.add(next);
    token = next;
  }
}
