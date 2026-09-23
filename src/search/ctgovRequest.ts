import { findUsState, type UsState } from './usStates';
import { sanitizeCondition, searchableText, type RadiusQuery, type SearchQuery, type SiteStatus } from './searchQuery';

export { sanitizeCondition };

export const CTGOV_STUDIES_URL = 'https://clinicaltrials.gov/api/v2/studies';

/** Studies per request. The API silently caps at 1000; 500 keeps each response near 6 MB. */
export const PAGE_SIZE = 500;

const FIELDS = [
  'NCTId',
  'BriefTitle',
  'OverallStatus',
  'Condition',
  'Phase',
  'LeadSponsorName',
  'Location',
].join(',');

export interface GeoCenter {
  lat: number;
  lng: number;
  label: string;
  /** US state (or Puerto Rico) the center lies in, or null outside the US or when the geocoder did not say. */
  stateCode: string | null;
}

function quoted(value: string): string {
  return `"${searchableText(value)}"`;
}

function statusClause(statuses: readonly SiteStatus[]): string {
  return statuses.length === 1
    ? `AREA[LocationStatus]${statuses[0]}`
    : `AREA[LocationStatus](${statuses.join(' OR ')})`;
}

function placeClause(state: UsState): string {
  return state.recordedAsCountry
    ? `AREA[LocationCountry]${quoted(state.name)}`
    : `AREA[LocationState]${quoted(state.name)} AND AREA[LocationCountry]"United States"`;
}

/**
 * Builds a query.locn expression. SEARCH[Location] makes every clause apply to the
 * same site, so a study only matches when one site satisfies place AND status together.
 */
export function buildLocationExpression(q: SearchQuery): string {
  const parts: string[] = [];
  switch (q.mode) {
    case 'state': {
      const state = findUsState(q.stateCode);
      if (state) parts.push(placeClause(state));
      break;
    }
    case 'city': {
      parts.push(`AREA[LocationCity]${quoted(q.city)}`);
      const state = findUsState(q.stateCode);
      if (state) parts.push(placeClause(state));
      break;
    }
    case 'institution': {
      parts.push(`AREA[LocationFacility]${quoted(q.institution)}`);
      const state = q.stateCode ? findUsState(q.stateCode) : null;
      if (state) parts.push(placeClause(state));
      break;
    }
    case 'radius':
      break;
  }
  parts.push(statusClause(q.statuses));
  return `SEARCH[Location](${parts.join(' AND ')})`;
}

export function buildStudiesParams(
  q: SearchQuery,
  center: GeoCenter | null,
  pageToken: string | null,
): URLSearchParams {
  const p = new URLSearchParams({
    format: 'json',
    fields: FIELDS,
    pageSize: String(PAGE_SIZE),
    'query.locn': buildLocationExpression(q),
  });
  const cond = sanitizeCondition(q.condition);
  if (cond) p.set('query.cond', cond);
  if (q.mode === 'radius' && center) p.set('filter.geo', geoFilter(center, q));
  if (pageToken) p.set('pageToken', pageToken);
  else p.set('countTotal', 'true');
  return p;
}

function geoFilter(center: GeoCenter, q: RadiusQuery): string {
  return `distance(${center.lat.toFixed(6)},${center.lng.toFixed(6)},${q.miles}mi)`;
}
