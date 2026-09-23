import { findUsState } from './usStates';

export type SearchMode = 'state' | 'city' | 'institution' | 'radius';

export const SITE_STATUSES = [
  'RECRUITING',
  'NOT_YET_RECRUITING',
  'ENROLLING_BY_INVITATION',
  'ACTIVE_NOT_RECRUITING',
] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  RECRUITING: 'Recruiting',
  NOT_YET_RECRUITING: 'Not yet recruiting',
  ENROLLING_BY_INVITATION: 'Enrolling by invitation',
  ACTIVE_NOT_RECRUITING: 'Active, not recruiting',
};

export const DEFAULT_STATUSES: readonly SiteStatus[] = ['RECRUITING', 'NOT_YET_RECRUITING'];

export const RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;
export type RadiusMiles = (typeof RADIUS_OPTIONS)[number];

export const MAX_TEXT_LENGTH = 100;

interface QueryFilters {
  statuses: SiteStatus[];
  condition: string;
}

export interface StateQuery extends QueryFilters { mode: 'state'; stateCode: string }
export interface CityQuery extends QueryFilters { mode: 'city'; city: string; stateCode: string }
export interface InstitutionQuery extends QueryFilters { mode: 'institution'; institution: string; stateCode: string | null }
export interface RadiusQuery extends QueryFilters { mode: 'radius'; place: string; miles: RadiusMiles }

export type SearchQuery = StateQuery | CityQuery | InstitutionQuery | RadiusQuery;

/** Trims, collapses whitespace and caps length. Does not strip query syntax; see searchableText. */
export function cleanText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
}

function parseStatuses(raw: string | null): SiteStatus[] {
  if (raw === null) return [...DEFAULT_STATUSES];
  const picked = SITE_STATUSES.filter((s) => raw.split(',').map((p) => p.trim().toUpperCase()).includes(s));
  return picked.length > 0 ? picked : [...DEFAULT_STATUSES];
}

/** Snaps any number to the nearest offered radius, so old links with 1 mile or 37 miles still work. */
export function nearestRadius(n: number): RadiusMiles {
  if (!Number.isFinite(n)) return 25;
  return RADIUS_OPTIONS.reduce((best, r) => (Math.abs(r - n) < Math.abs(best - n) ? r : best), RADIUS_OPTIONS[0]);
}

export type QueryProblem =
  | 'missing_state'
  | 'missing_city'
  | 'missing_institution'
  | 'institution_too_short'
  | 'missing_place'
  | 'no_status';

export const QUERY_PROBLEM_MESSAGES: Record<QueryProblem, string> = {
  missing_state: 'Choose a state.',
  missing_city: 'Enter a city.',
  missing_institution: 'Enter an institution name.',
  institution_too_short: 'Enter at least 3 characters of the institution name.',
  missing_place: 'Enter a city or address to search around.',
  no_status: 'Choose at least one site status.',
};

/** Returns the first reason the query cannot run, or null when it is runnable. */
export function validateQuery(q: SearchQuery): QueryProblem | null {
  if (q.statuses.length === 0) return 'no_status';
  switch (q.mode) {
    case 'state':
      return findUsState(q.stateCode) ? null : 'missing_state';
    case 'city':
      if (!findUsState(q.stateCode)) return 'missing_state';
      return searchableText(q.city) ? null : 'missing_city';
    case 'institution': {
      const text = searchableText(q.institution);
      if (!text) return 'missing_institution';
      if (text.length < 3) return 'institution_too_short';
      return q.stateCode !== null && !findUsState(q.stateCode) ? 'missing_state' : null;
    }
    case 'radius':
      return cleanText(q.place) ? null : 'missing_place';
  }
}

/** Text left after removing characters the ClinicalTrials.gov query language rejects inside a quoted value. */
export function searchableText(raw: string): string {
  return cleanText(raw.replace(/["\\]/g, ' '));
}

export function queryToParams(q: SearchQuery): URLSearchParams {
  const p = new URLSearchParams({ mode: q.mode });
  switch (q.mode) {
    case 'state':
      p.set('state', q.stateCode);
      break;
    case 'city':
      p.set('city', cleanText(q.city));
      p.set('state', q.stateCode);
      break;
    case 'institution':
      p.set('institution', cleanText(q.institution));
      if (q.stateCode) p.set('state', q.stateCode);
      break;
    case 'radius':
      p.set('place', cleanText(q.place));
      p.set('miles', String(q.miles));
      break;
  }
  const cond = cleanText(q.condition);
  if (cond) p.set('cond', cond);
  p.set('status', q.statuses.join(','));
  return p;
}

/**
 * Reads a query from the URL. Returns null when the URL holds no search.
 * Old links of the form ?loc=...&dist=... become radius searches.
 */
export function paramsToQuery(p: URLSearchParams): SearchQuery | null {
  const filters: QueryFilters = {
    statuses: parseStatuses(p.get('status')),
    condition: cleanText(p.get('cond') ?? ''),
  };
  const stateCode = (p.get('state') ?? '').trim().toUpperCase();
  const mode = p.get('mode');

  if (mode === null) {
    const loc = cleanText(p.get('loc') ?? '');
    if (!loc) return null;
    return { mode: 'radius', place: loc, miles: nearestRadius(Number(p.get('dist') ?? 25)), ...filters };
  }
  switch (mode) {
    case 'state':
      return { mode, stateCode, ...filters };
    case 'city':
      return { mode, city: cleanText(p.get('city') ?? ''), stateCode, ...filters };
    case 'institution':
      return { mode, institution: cleanText(p.get('institution') ?? ''), stateCode: stateCode || null, ...filters };
    case 'radius':
      return { mode, place: cleanText(p.get('place') ?? ''), miles: nearestRadius(Number(p.get('miles') ?? 25)), ...filters };
    default:
      return null;
  }
}

/** Stable identity for caching and for detecting a changed search. */
export function queryKey(q: SearchQuery): string {
  return queryToParams(q).toString();
}

/**
 * Makes free text safe for query.cond. The API parses that field as query syntax,
 * so quotes, brackets, parentheses and bare AND/OR/NOT otherwise produce a 400.
 */
export function sanitizeCondition(raw: string): string {
  const words = cleanText(raw.replace(/["\\()[\]{}~^:]/g, ' '))
    .split(' ')
    .filter((w) => w !== '' && !/^(and|or|not)$/i.test(w));
  return words.join(' ');
}

/** Title-cases a place name typed all in lower case ("san diego" to "San Diego"); mixed case is kept as typed. */
function displayPlace(text: string): string {
  const t = cleanText(text);
  if (t !== t.toLowerCase()) return t;
  const titled = t.replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  // "boston, ma" ends in a state code, which reads as "MA", not "Ma".
  return titled.replace(/,\s*([a-z]{2})$/i, (m, code: string) => (findUsState(code) ? `, ${code.toUpperCase()}` : m));
}

export function describeQuery(q: SearchQuery): string {
  // Shows the condition as it was actually sent, after query syntax was stripped.
  const cond = sanitizeCondition(q.condition);
  const suffix = cond ? `, condition "${cond}"` : '';
  switch (q.mode) {
    case 'state':
      return `Sites in ${findUsState(q.stateCode)?.name ?? q.stateCode}${suffix}`;
    case 'city':
      return `Sites in ${displayPlace(q.city)}, ${q.stateCode}${suffix}`;
    case 'institution': {
      const where = q.stateCode ? ` in ${findUsState(q.stateCode)?.name ?? q.stateCode}` : '';
      return `Sites matching "${cleanText(q.institution)}"${where}${suffix}`;
    }
    case 'radius':
      return `Sites within ${q.miles} miles of ${displayPlace(q.place)}${suffix}`;
  }
}
