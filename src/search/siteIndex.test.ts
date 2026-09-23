import { describe, expect, it } from 'vitest';
import { parseStudiesPage, type Study } from './ctgovParse';
import type { GeoCenter } from './ctgovRequest';
import type { SearchQuery } from './searchQuery';
import { createSiteIndex } from './siteIndex';
import { BOSTON, CAMBRIDGE, LOS_ANGELES, rawPage, rawStudy, type RawLocation } from './testFixtures';

const statuses = { statuses: ['RECRUITING' as const], condition: '' };

function studies(...raw: ReturnType<typeof rawStudy>[]): Study[] {
  const page = parseStudiesPage(rawPage(raw));
  if (!page) throw new Error('fixture did not parse');
  return page.studies;
}

function run(q: SearchQuery, data: Study[], center: GeoCenter | null = null) {
  const index = createSiteIndex(q, center);
  index.addStudies(data);
  return index.summary();
}

const site = (over: RawLocation): RawLocation => ({ country: 'United States', status: 'RECRUITING', ...over });

describe('state mode', () => {
  const data = studies(
    rawStudy('NCT1', [
      site({ facility: 'Stanford', city: 'Palo Alto', state: 'California' }),
      site({ facility: 'Code Site', city: 'Fresno', state: 'CA' }),
      site({ facility: 'Reno Site', city: 'Reno', state: 'Nevada' }),
      site({ facility: 'Toronto Site', city: 'Toronto', state: 'California', country: 'Canada' }),
      site({ facility: 'Withdrawn', city: 'Irvine', state: 'California', status: 'WITHDRAWN' }),
    ]),
  );

  it('keeps only in-state US sites with an allowed status', () => {
    const r = run({ mode: 'state', stateCode: 'CA', ...statuses }, data);
    expect(r.sites.map((s) => s.facility).sort()).toEqual(['Code Site', 'Stanford']);
    expect(r.studiesWithMatchingSites).toBe(1);
  });

  it('falls back to the study status when a site has none', () => {
    const d = studies(rawStudy('NCT2', [{ facility: 'No status', city: 'LA', state: 'California', country: 'United States' }]));
    expect(run({ mode: 'state', stateCode: 'CA', ...statuses }, d).sites).toHaveLength(1);
    const closed = studies(
      rawStudy('NCT3', [{ facility: 'No status', city: 'LA', state: 'California', country: 'United States' }], { status: 'COMPLETED' }),
    );
    expect(run({ mode: 'state', stateCode: 'CA', ...statuses }, closed).sites).toHaveLength(0);
  });

  it('matches Puerto Rico by country even when state is missing or a code', () => {
    const d = studies(
      rawStudy('NCT4', [
        { facility: 'San Juan', city: 'San Juan', country: 'Puerto Rico', status: 'RECRUITING' },
        { facility: 'Manati', city: 'Manati', state: 'PR', country: 'Puerto Rico', status: 'RECRUITING' },
      ]),
    );
    expect(run({ mode: 'state', stateCode: 'PR', ...statuses }, d).sites).toHaveLength(2);
  });
});

describe('city and institution modes', () => {
  const data = studies(
    rawStudy('NCT1', [
      site({ facility: 'MGH', city: 'Boston', state: 'Massachusetts' }),
      site({ facility: 'Southie Clinic', city: 'South Boston', state: 'Massachusetts' }),
      site({ facility: 'UCLA Medical Center', city: 'Los Angeles', state: 'California' }),
      site({ facility: 'Euclalpha Labs', city: 'Los Angeles', state: 'California' }),
      site({ facility: 'UCLA Santa Monica', city: 'Santa Monica', state: 'California' }),
      site({ facility: 'UCLA Nevada Satellite', city: 'Reno', state: 'Nevada' }),
    ]),
  );

  it('city mode needs an exact city name, not a substring', () => {
    const r = run({ mode: 'city', city: 'boston', stateCode: 'MA', ...statuses }, data);
    expect(r.sites.map((s) => s.facility)).toEqual(['MGH']);
  });

  it('institution mode matches whole words and honors the optional state', () => {
    const anywhere = run({ mode: 'institution', institution: 'ucla', stateCode: null, ...statuses }, data);
    expect(anywhere.sites.map((s) => s.facility).sort()).toEqual(['UCLA Medical Center', 'UCLA Nevada Satellite', 'UCLA Santa Monica']);
    const inCa = run({ mode: 'institution', institution: 'UCLA', stateCode: 'CA', ...statuses }, data);
    expect(inCa.sites).toHaveLength(2);
  });
});

describe('radius mode', () => {
  const data = studies(
    rawStudy('NCT1', [
      site({ facility: 'Boston Site', city: 'Boston', state: 'Massachusetts', geoPoint: BOSTON }),
      site({ facility: 'Cambridge Site', city: 'Cambridge', state: 'Massachusetts', geoPoint: CAMBRIDGE }),
      site({ facility: 'LA Site', city: 'Los Angeles', state: 'California', geoPoint: LOS_ANGELES }),
      site({ facility: 'No Coordinates', city: 'Boston', state: 'Massachusetts' }),
      site({ facility: 'No Coordinates Far Away', city: 'Houston', state: 'Texas' }),
    ]),
  );
  const center = { lat: BOSTON.lat, lng: BOSTON.lon, label: 'Boston', stateCode: 'MA' };

  it('keeps sites inside the radius, records distance, and counts missing coordinates', () => {
    const r = run({ mode: 'radius', place: 'Boston', miles: 5, ...statuses }, data, center);
    expect(r.sites.map((s) => s.facility).sort()).toEqual(['Boston Site', 'Cambridge Site']);
    expect(r.sites.find((s) => s.facility === 'Cambridge Site')?.distanceMiles).toBeGreaterThan(2);
    expect(r.sitesWithoutCoordinates).toBe(1);
  });

  it('does not count coordinate-less sites when the center state is unknown', () => {
    const r = run({ mode: 'radius', place: 'Boston', miles: 5, ...statuses }, data, { ...center, stateCode: null });
    expect(r.sitesWithoutCoordinates).toBe(0);
  });

  it('matches nothing without a center', () => {
    expect(run({ mode: 'radius', place: 'Boston', miles: 5, ...statuses }, data, null).sites).toHaveLength(0);
  });
});

describe('grouping and people', () => {
  const q: SearchQuery = { mode: 'state', stateCode: 'MA', ...statuses };

  it('merges facility spelling variants into one site and counts each trial once', () => {
    const d = studies(
      rawStudy('NCT1', [site({ facility: 'Dana-Farber Cancer Institute', city: 'Boston', state: 'Massachusetts' })]),
      rawStudy('NCT2', [
        site({ facility: 'Dana Farber Cancer Institute', city: 'Boston', state: 'Massachusetts' }),
        site({ facility: 'Dana Farber Cancer Institute', city: 'Boston', state: 'Massachusetts' }),
      ]),
      rawStudy('NCT3', [site({ facility: 'Dana Farber Cancer Institute', city: 'Boston', state: 'Massachusetts' })]),
    );
    const r = run(q, d);
    expect(r.sites).toHaveLength(1);
    expect(r.sites[0].facility).toBe('Dana Farber Cancer Institute');
    expect(r.sites[0].trials.map((t) => t.nctId)).toEqual(['NCT1', 'NCT2', 'NCT3']);
  });

  it('merges the same person listed as PI and as contact, across name spellings', () => {
    const d = studies(
      rawStudy('NCT1', [
        site({
          facility: 'MGH',
          city: 'Boston',
          state: 'Massachusetts',
          contacts: [
            { name: 'Jane Doe, MD', role: 'PRINCIPAL_INVESTIGATOR' },
            { name: 'Dr. Jane Doe', role: 'CONTACT', email: 'JDoe@mgh.org', phone: '617-555-0100' },
            { name: 'Sam Coordinator', role: 'CONTACT', email: 'trials@mgh.org' },
          ],
        }),
      ]),
    );
    const people = run(q, d).sites[0].people;
    expect(people).toHaveLength(2);
    expect(people[0]).toMatchObject({ name: 'Jane Doe, MD', isPI: true, emails: ['jdoe@mgh.org'], phones: ['617-555-0100'] });
    expect(people[0].roles.sort()).toEqual(['CONTACT', 'PRINCIPAL_INVESTIGATOR']);
  });

  it('folds a nameless inbox into the named person with that address, and keeps an unowned one', () => {
    const d = studies(
      rawStudy('NCT1', [
        site({
          facility: 'MGH',
          city: 'Boston',
          state: 'Massachusetts',
          contacts: [
            { name: 'Research Office', email: 'research@mgh.org', role: 'CONTACT' },
            { email: 'research@mgh.org', role: 'CONTACT' },
            { email: 'other@mgh.org', role: 'CONTACT' },
            { role: 'CONTACT' },
          ],
        }),
      ]),
    );
    const people = run(q, d).sites[0].people;
    expect(people.map((p) => [p.name, p.emails])).toEqual([
      ['Research Office', ['research@mgh.org']],
      [null, ['other@mgh.org']],
    ]);
  });

  it('keeps the same person separate at two different sites', () => {
    const contact = { name: 'Pat Lee', role: 'PRINCIPAL_INVESTIGATOR', email: 'pat@x.org' };
    const d = studies(
      rawStudy('NCT1', [
        site({ facility: 'Site A', city: 'Boston', state: 'Massachusetts', contacts: [contact] }),
        site({ facility: 'Site B', city: 'Worcester', state: 'Massachusetts', contacts: [contact] }),
      ]),
    );
    const r = run(q, d);
    expect(r.sites).toHaveLength(2);
    expect(r.sites.every((s) => s.people.length === 1)).toBe(true);
  });

  it('accumulates across pages', () => {
    const index = createSiteIndex(q, null);
    index.addStudies(studies(rawStudy('NCT1', [site({ facility: 'A', city: 'Boston', state: 'Massachusetts' })])));
    index.addStudies(studies(rawStudy('NCT2', [site({ facility: 'A', city: 'Boston', state: 'Massachusetts' })])));
    const r = index.summary();
    expect(r.sites).toHaveLength(1);
    expect(r.sites[0].trials).toHaveLength(2);
    expect(r.studiesWithMatchingSites).toBe(2);
  });
});
