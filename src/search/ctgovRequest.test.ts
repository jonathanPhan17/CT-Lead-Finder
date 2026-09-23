import { describe, expect, it } from 'vitest';
import { buildLocationExpression, buildStudiesParams, sanitizeCondition } from './ctgovRequest';
import type { SearchQuery } from './searchQuery';

const recruiting = { statuses: ['RECRUITING' as const], condition: '' };

describe('buildLocationExpression', () => {
  it('scopes a state search to US sites with the right status', () => {
    expect(buildLocationExpression({ mode: 'state', stateCode: 'GA', ...recruiting })).toBe(
      'SEARCH[Location](AREA[LocationState]"Georgia" AND AREA[LocationCountry]"United States" AND AREA[LocationStatus]RECRUITING)',
    );
  });

  it('matches Puerto Rico by country', () => {
    expect(buildLocationExpression({ mode: 'state', stateCode: 'PR', ...recruiting })).toBe(
      'SEARCH[Location](AREA[LocationCountry]"Puerto Rico" AND AREA[LocationStatus]RECRUITING)',
    );
  });

  it('ORs several statuses together', () => {
    const q: SearchQuery = { mode: 'city', city: 'Boston', stateCode: 'MA', statuses: ['RECRUITING', 'NOT_YET_RECRUITING'], condition: '' };
    expect(buildLocationExpression(q)).toBe(
      'SEARCH[Location](AREA[LocationCity]"Boston" AND AREA[LocationState]"Massachusetts" AND AREA[LocationCountry]"United States" AND AREA[LocationStatus](RECRUITING OR NOT_YET_RECRUITING))',
    );
  });

  it('removes characters that would break the quoted value', () => {
    const q: SearchQuery = { mode: 'institution', institution: 'St. Jude "Memphis" \\ (TN)', stateCode: null, ...recruiting };
    expect(buildLocationExpression(q)).toBe(
      'SEARCH[Location](AREA[LocationFacility]"St. Jude Memphis (TN)" AND AREA[LocationStatus]RECRUITING)',
    );
  });

  it('uses only the status clause for radius searches', () => {
    expect(buildLocationExpression({ mode: 'radius', place: 'Boston', miles: 25, ...recruiting })).toBe(
      'SEARCH[Location](AREA[LocationStatus]RECRUITING)',
    );
  });
});

describe('sanitizeCondition', () => {
  it.each([
    ['breast AND', 'breast'],
    ['(lung', 'lung'],
    ['lung\\cancer', 'lung cancer'],
    ['cancer)', 'cancer'],
    ['NOT', ''],
    ['"', ''],
    ['[abc', 'abc'],
    ['AREA[Phase]PHASE3', 'AREA Phase PHASE3'],
    ["Crohn's", "Crohn's"],
    ['non-small cell', 'non-small cell'],
    ['type 2  diabetes ', 'type 2 diabetes'],
    ['breast or and cancer', 'breast cancer'],
  ])('%s -> %s', (input, expected) => {
    expect(sanitizeCondition(input)).toBe(expected);
  });
});

describe('buildStudiesParams', () => {
  const q: SearchQuery = { mode: 'radius', place: 'Boston', miles: 10, statuses: ['RECRUITING'], condition: 'melanoma' };
  const center = { lat: 42.3601, lng: -71.0589, label: 'Boston', stateCode: 'MA' };

  it('asks for a total count only on the first page', () => {
    expect(buildStudiesParams(q, center, null).get('countTotal')).toBe('true');
    const next = buildStudiesParams(q, center, 'tok');
    expect(next.get('countTotal')).toBeNull();
    expect(next.get('pageToken')).toBe('tok');
  });

  it('adds the geo filter and condition', () => {
    const p = buildStudiesParams(q, center, null);
    expect(p.get('filter.geo')).toBe('distance(42.360100,-71.058900,10mi)');
    expect(p.get('query.cond')).toBe('melanoma');
  });

  it('omits an empty condition', () => {
    expect(buildStudiesParams({ ...q, condition: ' AND ' }, center, null).get('query.cond')).toBeNull();
  });
});
