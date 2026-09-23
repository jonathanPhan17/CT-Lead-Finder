import { describe, expect, it } from 'vitest';
import { buildRecipientIndex, csvField, filterSites, sitesToCsv, sortSites, totals } from './resultsView';
import type { Person, Site, TrialAtSite } from './siteIndex';

function trial(nctId: string, over: Partial<TrialAtSite> = {}): TrialAtSite {
  return {
    nctId,
    title: `Study ${nctId}`,
    phase: 'Phase 2',
    studyStatus: 'RECRUITING',
    siteStatus: 'RECRUITING',
    sponsor: 'Acme',
    conditions: ['Melanoma'],
    ...over,
  };
}

function person(name: string | null, over: Partial<Person> = {}): Person {
  return { key: `k:${name}`, name, emails: [], phones: [], roles: ['CONTACT'], isPI: false, trialIds: ['NCT1'], ...over };
}

function site(facility: string, over: Partial<Site> = {}): Site {
  return {
    key: facility,
    facility,
    city: 'Boston',
    state: 'Massachusetts',
    country: 'United States',
    distanceMiles: null,
    trials: [trial('NCT1')],
    people: [],
    ...over,
  };
}

const none = { emailOnly: false, piOnly: false, text: '' };

describe('filterSites', () => {
  const pi = person('Ann PI', { isPI: true, roles: ['PRINCIPAL_INVESTIGATOR'] });
  const coord = person('Bob Coord', { emails: ['bob@x.org'] });
  const sites = [
    site('MGH', { people: [pi, coord] }),
    site('Empty Clinic', { people: [], trials: [trial('NCT2', { conditions: ['Lupus'] })] }),
  ];

  it('returns everything with no filters', () => {
    expect(filterSites(sites, none)).toEqual(sites);
  });

  it('drops people without email, and sites left empty', () => {
    const r = filterSites(sites, { ...none, emailOnly: true });
    expect(r.map((s) => s.facility)).toEqual(['MGH']);
    expect(r[0].people).toEqual([coord]);
  });

  it('combines PI and email filters', () => {
    expect(filterSites(sites, { ...none, emailOnly: true, piOnly: true })).toEqual([]);
  });

  it('a text hit on the site or a trial keeps all its people', () => {
    expect(filterSites(sites, { ...none, text: 'lupus' }).map((s) => s.facility)).toEqual(['Empty Clinic']);
    expect(filterSites(sites, { ...none, text: 'mgh' })[0].people).toHaveLength(2);
  });

  it('a text hit on a person keeps only that person', () => {
    const r = filterSites(sites, { ...none, text: 'bob@x' });
    expect(r).toHaveLength(1);
    expect(r[0].people).toEqual([coord]);
  });

  it('text matching ignores case and accents', () => {
    const s = [site('Hôpital Saint-Louis')];
    expect(filterSites(s, { ...none, text: 'HOPITAL saint louis' })).toHaveLength(1);
  });
});

describe('sortSites', () => {
  const a = site('Alpha', { trials: [trial('NCT1')], people: [person('x', { emails: ['x@a.org'] })], distanceMiles: 9 });
  const b = site('Bravo', {
    trials: [trial('NCT1'), trial('NCT2')],
    people: [person('y', { isPI: true, emails: ['y@b.org'] })],
    distanceMiles: 2,
  });
  const c = site('charlie', { trials: [trial('NCT1'), trial('NCT2'), trial('NCT3')], people: [], distanceMiles: null });

  it.each([
    ['outreach', ['Bravo', 'Alpha', 'charlie']],
    ['trials', ['charlie', 'Bravo', 'Alpha']],
    ['facility', ['Alpha', 'Bravo', 'charlie']],
    ['distance', ['Bravo', 'Alpha', 'charlie']],
  ] as const)('%s', (sort, expected) => {
    expect(sortSites([c, a, b], sort).map((s) => s.facility)).toEqual(expected);
  });

  it('does not mutate its input', () => {
    const input = [c, a, b];
    sortSites(input, 'facility');
    expect(input.map((s) => s.facility)).toEqual(['charlie', 'Alpha', 'Bravo']);
  });
});

describe('buildRecipientIndex', () => {
  it('keeps one recipient per address across sites and collects their trials', () => {
    const shared = 'trials@hospital.org';
    const sites = [
      site('Site A', { trials: [trial('NCT1'), trial('NCT2')], people: [person(null, { emails: [shared], trialIds: ['NCT1', 'NCT2'] })] }),
      site('Site B', { city: 'Newton', people: [person('Dr. Kim', { emails: [shared], isPI: true, trialIds: ['NCT1'] })] }),
    ];
    const index = buildRecipientIndex(sites);
    expect(index.size).toBe(1);
    const r = index.get(shared);
    expect(r?.name).toBe('Dr. Kim');
    expect(r?.isPI).toBe(true);
    expect(r?.trials.map((t) => `${t.nctId}@${t.facility}`)).toEqual(['NCT1@Site A', 'NCT2@Site A', 'NCT1@Site B']);
  });

  it('gives a person with two addresses two recipients', () => {
    const index = buildRecipientIndex([site('A', { people: [person('Pat', { emails: ['p@a.org', 'p@b.org'] })] })]);
    expect([...index.keys()]).toEqual(['p@a.org', 'p@b.org']);
  });
});

describe('totals', () => {
  it('counts distinct trials and emails', () => {
    const sites = [
      site('A', { trials: [trial('NCT1'), trial('NCT2')], people: [person('a', { emails: ['a@x.org'], isPI: true })] }),
      site('B', { trials: [trial('NCT2')], people: [person('b', { emails: ['a@x.org'] }), person('c')] }),
    ];
    expect(totals(sites)).toEqual({ sites: 2, trials: 2, people: 3, peopleWithEmail: 2, pis: 1, distinctEmails: 1 });
  });
});

describe('CSV export', () => {
  it.each([
    ['plain', 'plain'],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['=HYPERLINK("x")', `"'=HYPERLINK(""x"")"`],
    ['+1 555', "'+1 555"],
    ['-2', "'-2"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['line\nbreak', '"line\nbreak"'],
  ])('csvField(%j)', (input, expected) => {
    expect(csvField(input)).toBe(expected);
  });

  it('writes one row per person per trial, and a row per trial for sites with no people', () => {
    const sites = [
      site('A', {
        trials: [trial('NCT1'), trial('NCT2')],
        people: [person('Ann', { emails: ['a@x.org'], isPI: true, roles: ['PRINCIPAL_INVESTIGATOR'], trialIds: ['NCT1', 'NCT2'] })],
      }),
      site('B', { trials: [trial('NCT3')] }),
    ];
    const lines = sitesToCsv(sites).split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0].startsWith('Name,Roles,Is PI')).toBe(true);
    expect(lines[1].startsWith('Ann,Principal investigator,Yes,a@x.org,,A,Boston')).toBe(true);
    expect(lines[2]).toContain('NCT2');
    expect(lines[3].startsWith(',,,,,B,Boston')).toBe(true);
  });
});
