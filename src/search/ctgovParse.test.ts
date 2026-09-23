import { describe, expect, it } from 'vitest';
import { parseEmails, parseStudiesPage, phaseLabel } from './ctgovParse';
import { rawPage, rawStudy } from './testFixtures';

describe('parseStudiesPage', () => {
  it('rejects payloads that are not a studies response', () => {
    expect(parseStudiesPage(null)).toBeNull();
    expect(parseStudiesPage('<!doctype html>')).toBeNull();
    expect(parseStudiesPage([1, 2])).toBeNull();
    expect(parseStudiesPage({ studies: 'nope' })).toBeNull();
  });

  it('treats a missing studies array as an empty page', () => {
    expect(parseStudiesPage({})).toEqual({ studies: [], nextPageToken: null, totalCount: null, skippedRecords: 0 });
  });

  it('skips records without an NCT id and counts them', () => {
    const page = parseStudiesPage(rawPage([rawStudy('NCT1', []), { protocolSection: {} }, 42, null]));
    expect(page?.studies.map((s) => s.nctId)).toEqual(['NCT1']);
    expect(page?.skippedRecords).toBe(3);
  });

  it('survives wrong types in every nested field', () => {
    const page = parseStudiesPage({
      studies: [
        {
          protocolSection: {
            identificationModule: { nctId: 'NCT9', briefTitle: 7 },
            statusModule: 'x',
            conditionsModule: { conditions: ['ok', 3, null, '  '] },
            designModule: { phases: 'PHASE1' },
            contactsLocationsModule: {
              locations: [
                'bad',
                { facility: 5, city: 'Boston', geoPoint: { lat: 'x', lon: 1 }, contacts: [{}, 'x', { name: '  ', email: 'n/a' }] },
                { facility: 'Real Site', geoPoint: { lat: 91, lon: 0 }, contacts: [{ role: 'principal_investigator', name: 'Ann' }] },
              ],
            },
          },
        },
      ],
      totalCount: -5,
      nextPageToken: '',
    });
    const s = page?.studies[0];
    expect(s?.title).toBe('NCT9');
    expect(s?.conditions).toEqual(['ok']);
    expect(s?.phases).toEqual([]);
    expect(s?.overallStatus).toBeNull();
    expect(s?.sites).toHaveLength(2);
    expect(s?.sites[0]).toMatchObject({ facility: null, city: 'Boston', geo: null, contacts: [] });
    expect(s?.sites[1].geo).toBeNull();
    expect(s?.sites[1].contacts).toEqual([{ name: 'Ann', role: 'PRINCIPAL_INVESTIGATOR', emails: [], phone: null }]);
    expect(page?.totalCount).toBeNull();
    expect(page?.nextPageToken).toBeNull();
  });

  it('joins phone extensions', () => {
    const page = parseStudiesPage(rawPage([rawStudy('NCT1', [{ facility: 'A', contacts: [{ name: 'X', phone: '555-1234', phoneExt: '12' }] }])]));
    expect(page?.studies[0].sites[0].contacts[0].phone).toBe('555-1234 ext. 12');
  });
});

describe('parseEmails', () => {
  it.each([
    ['jane@site.org', ['jane@site.org']],
    ['JANE@Site.ORG', ['jane@site.org']],
    ['a@x.com; b@y.org', ['a@x.com', 'b@y.org']],
    ['a@x.com, a@x.com', ['a@x.com']],
    ['<a@x.com>.', ['a@x.com']],
    ['n/a', []],
    ['not provided', []],
    ['a@b', []],
    ['', []],
    [42, []],
  ])('%s', (input, expected) => {
    expect(parseEmails(input)).toEqual(expected);
  });
});

describe('phaseLabel', () => {
  it.each([
    [['PHASE1'], 'Phase 1'],
    [['PHASE1', 'PHASE2'], 'Phase 1/2'],
    [['EARLY_PHASE1'], 'Early Phase 1'],
    [['NA'], ''],
    [[], ''],
    [['EARLY_PHASE1', 'PHASE2'], 'Early Phase 1 / Phase 2'],
  ])('%j -> %s', (input, expected) => {
    expect(phaseLabel(input)).toBe(expected);
  });
});
