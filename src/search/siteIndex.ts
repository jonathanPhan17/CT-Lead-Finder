import type { ContactRole, Study, StudySite } from './ctgovParse';
import { phaseLabel } from './ctgovParse';
import type { GeoCenter } from './ctgovRequest';
import { containsPhrase, distanceMiles, normalizeKey, normalizePersonName } from './normalize';
import type { SearchQuery } from './searchQuery';
import { findUsState, type UsState } from './usStates';

export interface TrialAtSite {
  nctId: string;
  title: string;
  phase: string;
  studyStatus: string | null;
  siteStatus: string | null;
  sponsor: string | null;
  conditions: string[];
}

export interface Person {
  key: string;
  name: string | null;
  emails: string[];
  phones: string[];
  roles: ContactRole[];
  isPI: boolean;
  trialIds: string[];
}

export interface Site {
  key: string;
  facility: string;
  city: string | null;
  state: string | null;
  country: string | null;
  /** Miles from the search center to the site's city center; null outside radius searches. */
  distanceMiles: number | null;
  trials: TrialAtSite[];
  people: Person[];
}

export interface SiteIndexSummary {
  sites: Site[];
  studiesWithMatchingSites: number;
  /** Radius searches only: sites dropped because ClinicalTrials.gov has no coordinates for them. */
  sitesWithoutCoordinates: number;
}

function sameState(siteState: string | null, state: UsState): boolean {
  if (!siteState) return false;
  return normalizeKey(siteState) === normalizeKey(state.name) || siteState.trim().toUpperCase() === state.code;
}

function inState(site: StudySite, state: UsState): boolean {
  const country = normalizeKey(site.country ?? '');
  if (state.recordedAsCountry) return country === normalizeKey(state.name);
  return country === 'united states' && sameState(site.state, state);
}

/**
 * noCoordinates marks a site the radius check could not place. It is only set for sites in the
 * center's own state: sites elsewhere in a multi-site trial are almost never near the center, and
 * counting them made the "could not be checked" number meaningless.
 */
export type MatchResult = { ok: true; distance: number | null } | { ok: false; noCoordinates: boolean };

const NO_MATCH: MatchResult = { ok: false, noCoordinates: false };
const MATCH: MatchResult = { ok: true, distance: null };

/**
 * Decides, per site, whether it belongs in the results. The server query only guarantees
 * that SOME site of a study matched, so every site is re-checked here.
 */
export function matchSite(q: SearchQuery, center: GeoCenter | null, site: StudySite, study: Study): MatchResult {
  const status = site.status ?? study.overallStatus;
  if (!status || !(q.statuses as readonly string[]).includes(status)) return NO_MATCH;

  switch (q.mode) {
    case 'state': {
      const state = findUsState(q.stateCode);
      return state && inState(site, state) ? MATCH : NO_MATCH;
    }
    case 'city': {
      const state = findUsState(q.stateCode);
      const ok = state !== null && inState(site, state) && normalizeKey(site.city ?? '') === normalizeKey(q.city);
      return ok ? MATCH : NO_MATCH;
    }
    case 'institution': {
      if (q.stateCode) {
        const state = findUsState(q.stateCode);
        if (!state || !inState(site, state)) return NO_MATCH;
      }
      return containsPhrase(site.facility ?? '', q.institution) ? MATCH : NO_MATCH;
    }
    case 'radius': {
      if (!center) return NO_MATCH;
      if (!site.geo) {
        const home = center.stateCode ? findUsState(center.stateCode) : null;
        return { ok: false, noCoordinates: home !== null && inState(site, home) };
      }
      const d = distanceMiles(center.lat, center.lng, site.geo.lat, site.geo.lng);
      return d <= q.miles ? { ok: true, distance: d } : NO_MATCH;
    }
  }
}

interface SiteDraft {
  key: string;
  facilityVariants: Map<string, number>;
  city: string | null;
  state: string | null;
  country: string | null;
  distanceMiles: number | null;
  trials: Map<string, TrialAtSite>;
  people: Map<string, Person>;
}

function siteKey(site: StudySite): string {
  return [site.facility, site.city, site.state, site.country].map((v) => normalizeKey(v ?? '')).join('|');
}

function personKey(name: string | null, emails: readonly string[], phone: string | null): string | null {
  if (name) {
    const n = normalizePersonName(name);
    if (n) return `n:${n}`;
  }
  if (emails.length > 0) return `e:${emails[0]}`;
  if (phone) return `p:${phone.replace(/\D/g, '')}`;
  return null;
}

function addUnique<T>(list: T[], items: readonly T[]): void {
  for (const item of items) if (!list.includes(item)) list.push(item);
}

/** Folds email-only entries (shared inboxes listed without a name) into a named person with the same address. */
function mergeNamelessInboxes(people: Iterable<Person>): Person[] {
  const all = [...people];
  const named = all.filter((p) => p.name !== null);
  const result: Person[] = [...named];
  for (const p of all) {
    if (p.name !== null) continue;
    const owner = named.find((n) => p.emails.some((e) => n.emails.includes(e)));
    if (owner) {
      addUnique(owner.emails, p.emails);
      addUnique(owner.phones, p.phones);
      addUnique(owner.roles, p.roles);
      addUnique(owner.trialIds, p.trialIds);
      owner.isPI = owner.isPI || p.isPI;
    } else {
      result.push(p);
    }
  }
  return result;
}

function mostCommon(variants: Map<string, number>): string {
  let best = '';
  let bestCount = -1;
  for (const [v, n] of variants) {
    if (n > bestCount) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

export interface SiteIndex {
  addStudies(studies: readonly Study[]): void;
  summary(): SiteIndexSummary;
}

/** Accumulates matching sites page by page so only matched data stays in memory. */
export function createSiteIndex(q: SearchQuery, center: GeoCenter | null): SiteIndex {
  const drafts = new Map<string, SiteDraft>();
  const matchedStudies = new Set<string>();
  let noCoordinates = 0;

  function draftFor(site: StudySite, distance: number | null): SiteDraft {
    const key = siteKey(site);
    const existing = drafts.get(key);
    if (existing) {
      if (distance !== null && (existing.distanceMiles === null || distance < existing.distanceMiles)) {
        existing.distanceMiles = distance;
      }
      return existing;
    }
    const draft: SiteDraft = {
      key,
      facilityVariants: new Map(),
      city: site.city,
      state: site.state,
      country: site.country,
      distanceMiles: distance,
      trials: new Map(),
      people: new Map(),
    };
    drafts.set(key, draft);
    return draft;
  }

  function addStudies(studies: readonly Study[]): void {
    for (const study of studies) {
      for (const site of study.sites) {
        const m = matchSite(q, center, site, study);
        if (!m.ok) {
          if (m.noCoordinates) noCoordinates++;
          continue;
        }
        matchedStudies.add(study.nctId);
        const draft = draftFor(site, m.distance);
        const facility = site.facility ?? 'Unnamed site';
        draft.facilityVariants.set(facility, (draft.facilityVariants.get(facility) ?? 0) + 1);
        if (!draft.trials.has(study.nctId)) {
          draft.trials.set(study.nctId, {
            nctId: study.nctId,
            title: study.title,
            phase: phaseLabel(study.phases),
            studyStatus: study.overallStatus,
            siteStatus: site.status,
            sponsor: study.sponsor,
            conditions: study.conditions,
          });
        }
        for (const c of site.contacts) {
          const pk = personKey(c.name, c.emails, c.phone);
          if (!pk) continue;
          let person = draft.people.get(pk);
          if (!person) {
            person = { key: `${draft.key}#${pk}`, name: c.name, emails: [], phones: [], roles: [], isPI: false, trialIds: [] };
            draft.people.set(pk, person);
          }
          addUnique(person.emails, c.emails);
          if (c.phone) addUnique(person.phones, [c.phone]);
          addUnique(person.roles, [c.role]);
          addUnique(person.trialIds, [study.nctId]);
          if (c.role === 'PRINCIPAL_INVESTIGATOR') person.isPI = true;
        }
      }
    }
  }

  function summary(): SiteIndexSummary {
    const sites: Site[] = [...drafts.values()].map((d) => ({
      key: d.key,
      facility: mostCommon(d.facilityVariants),
      city: d.city,
      state: d.state,
      country: d.country,
      distanceMiles: d.distanceMiles,
      trials: [...d.trials.values()],
      people: mergeNamelessInboxes(d.people.values()).sort(
        (a, b) => Number(b.isPI) - Number(a.isPI) || Number(b.emails.length > 0) - Number(a.emails.length > 0),
      ),
    }));
    return { sites, studiesWithMatchingSites: matchedStudies.size, sitesWithoutCoordinates: noCoordinates };
  }

  return { addStudies, summary };
}
