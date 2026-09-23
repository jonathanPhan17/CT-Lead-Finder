import { normalizeKey } from './normalize';
import { SITE_STATUS_LABELS, type SiteStatus } from './searchQuery';
import type { Person, Site, TrialAtSite } from './siteIndex';

export interface ViewFilters {
  emailOnly: boolean;
  piOnly: boolean;
  text: string;
}

export type SiteSort = 'outreach' | 'trials' | 'people' | 'facility' | 'distance';

export const SITE_SORT_LABELS: Record<SiteSort, string> = {
  outreach: 'Best for outreach',
  trials: 'Most trials',
  people: 'Most contacts',
  facility: 'Facility (A-Z)',
  distance: 'Nearest first',
};

function includesText(value: string | null, needle: string): boolean {
  return value !== null && normalizeKey(value).includes(needle);
}

function trialMatches(t: TrialAtSite, needle: string): boolean {
  return (
    includesText(t.title, needle) ||
    includesText(t.nctId, needle) ||
    includesText(t.sponsor, needle) ||
    t.conditions.some((c) => includesText(c, needle))
  );
}

function personMatches(p: Person, needle: string): boolean {
  return includesText(p.name, needle) || p.emails.some((e) => includesText(e, needle));
}

/**
 * Narrows sites and the people inside them. A text match on the site or one of its
 * trials keeps all of the site's people; otherwise only matching people stay.
 */
export function filterSites(sites: readonly Site[], f: ViewFilters): Site[] {
  const needle = normalizeKey(f.text);
  const peopleFiltered = f.emailOnly || f.piOnly;
  const out: Site[] = [];
  for (const site of sites) {
    let people = site.people;
    if (f.emailOnly) people = people.filter((p) => p.emails.length > 0);
    if (f.piOnly) people = people.filter((p) => p.isPI);
    let siteHit = true;
    if (needle) {
      siteHit =
        includesText(site.facility, needle) ||
        includesText(site.city, needle) ||
        includesText(site.state, needle) ||
        site.trials.some((t) => trialMatches(t, needle));
      if (!siteHit) people = people.filter((p) => personMatches(p, needle));
    }
    if (people.length > 0 || (!peopleFiltered && siteHit)) {
      out.push(people === site.people ? site : { ...site, people });
    }
  }
  return out;
}

function countWhere<T>(items: readonly T[], pred: (t: T) => boolean): number {
  let n = 0;
  for (const i of items) if (pred(i)) n++;
  return n;
}

export function sortSites(sites: readonly Site[], sort: SiteSort): Site[] {
  const sorted = [...sites];
  switch (sort) {
    case 'outreach':
      return sorted.sort(
        (a, b) =>
          countWhere(b.people, (p) => p.isPI && p.emails.length > 0) - countWhere(a.people, (p) => p.isPI && p.emails.length > 0) ||
          countWhere(b.people, (p) => p.emails.length > 0) - countWhere(a.people, (p) => p.emails.length > 0) ||
          countWhere(b.people, (p) => p.isPI) - countWhere(a.people, (p) => p.isPI) ||
          b.trials.length - a.trials.length,
      );
    case 'trials':
      return sorted.sort((a, b) => b.trials.length - a.trials.length);
    case 'people':
      return sorted.sort((a, b) => b.people.length - a.people.length);
    case 'facility':
      return sorted.sort((a, b) => a.facility.localeCompare(b.facility));
    case 'distance':
      return sorted.sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
  }
}

export interface RecipientTrial extends TrialAtSite {
  facility: string;
  city: string | null;
}

/** One outreach target per email address, however many sites and trials list it. */
export interface Recipient {
  email: string;
  name: string | null;
  isPI: boolean;
  trials: RecipientTrial[];
}

export function buildRecipientIndex(sites: readonly Site[]): Map<string, Recipient> {
  const index = new Map<string, Recipient>();
  for (const site of sites) {
    const trialsById = new Map(site.trials.map((t) => [t.nctId, t]));
    for (const person of site.people) {
      for (const email of person.emails) {
        let r = index.get(email);
        if (!r) {
          r = { email, name: person.name, isPI: false, trials: [] };
          index.set(email, r);
        }
        if (r.name === null && person.name !== null) r.name = person.name;
        r.isPI = r.isPI || person.isPI;
        for (const id of person.trialIds) {
          const t = trialsById.get(id);
          if (t && !r.trials.some((x) => x.nctId === id && x.facility === site.facility)) {
            r.trials.push({ ...t, facility: site.facility, city: site.city });
          }
        }
      }
    }
  }
  return index;
}

export interface ResultTotals {
  sites: number;
  trials: number;
  people: number;
  peopleWithEmail: number;
  pis: number;
  distinctEmails: number;
}

export function totals(sites: readonly Site[]): ResultTotals {
  const trials = new Set<string>();
  const emails = new Set<string>();
  let people = 0;
  let withEmail = 0;
  let pis = 0;
  for (const s of sites) {
    for (const t of s.trials) trials.add(t.nctId);
    for (const p of s.people) {
      people++;
      if (p.emails.length > 0) withEmail++;
      if (p.isPI) pis++;
      for (const e of p.emails) emails.add(e);
    }
  }
  return { sites: sites.length, trials: trials.size, people, peopleWithEmail: withEmail, pis, distinctEmails: emails.size };
}

const CSV_HEADERS = [
  'Name', 'Roles', 'Is PI', 'Emails', 'Phones', 'Facility', 'City', 'State', 'Country',
  'Site status', 'NCT ID', 'Study title', 'Study status', 'Phase', 'Sponsor', 'Conditions',
];

/** Quotes CSV fields and neutralizes leading = + - @ so spreadsheets do not run them as formulas. */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const ROLE_LABELS: Record<string, string> = {
  PRINCIPAL_INVESTIGATOR: 'Principal investigator',
  SUB_INVESTIGATOR: 'Sub-investigator',
  CONTACT: 'Site contact',
  OTHER: 'Other',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? 'Other';
}

/** "RECRUITING" -> "Recruiting"; unknown registry values are prettified rather than hidden. */
export function statusLabel(status: string | null): string {
  if (!status) return 'Status not listed';
  if (status in SITE_STATUS_LABELS) return SITE_STATUS_LABELS[status as SiteStatus];
  const words = status.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One row per person per trial; sites with no listed people still get one row per trial. */
export function sitesToCsv(sites: readonly Site[]): string {
  const rows: string[][] = [];
  for (const site of sites) {
    const place = [site.facility, site.city ?? '', site.state ?? '', site.country ?? ''];
    const trialRow = (t: TrialAtSite) => [
      t.siteStatus ?? '', t.nctId, t.title, t.studyStatus ?? '', t.phase, t.sponsor ?? '', t.conditions.join('; '),
    ];
    if (site.people.length === 0) {
      for (const t of site.trials) rows.push(['', '', '', '', '', ...place, ...trialRow(t)]);
      continue;
    }
    const trialsById = new Map(site.trials.map((t) => [t.nctId, t]));
    for (const p of site.people) {
      const person = [
        p.name ?? '', p.roles.map(roleLabel).join('; '), p.isPI ? 'Yes' : 'No', p.emails.join('; '), p.phones.join('; '),
      ];
      for (const id of p.trialIds) {
        const t = trialsById.get(id);
        if (t) rows.push([...person, ...place, ...trialRow(t)]);
      }
    }
  }
  return [CSV_HEADERS, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n');
}
