import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATUSES,
  describeQuery,
  nearestRadius,
  paramsToQuery,
  queryKey,
  queryToParams,
  searchableText,
  validateQuery,
  type SearchQuery,
} from './searchQuery';

const base = { statuses: ['RECRUITING' as const], condition: '' };

describe('URL round trip', () => {
  const cases: SearchQuery[] = [
    { mode: 'state', stateCode: 'CA', ...base },
    { mode: 'city', city: 'Boston', stateCode: 'MA', ...base, condition: 'breast cancer' },
    { mode: 'institution', institution: 'UCLA', stateCode: null, ...base },
    { mode: 'institution', institution: "Children's Hospital", stateCode: 'PA', ...base },
    { mode: 'radius', place: 'Toronto, Canada', miles: 50, ...base },
  ];
  for (const q of cases) {
    it(`preserves a ${q.mode} query`, () => {
      expect(paramsToQuery(queryToParams(q))).toEqual(q);
    });
  }
});

describe('paramsToQuery', () => {
  it('returns null when there is no search in the URL', () => {
    expect(paramsToQuery(new URLSearchParams(''))).toBeNull();
    expect(paramsToQuery(new URLSearchParams('mode=bogus'))).toBeNull();
  });

  it('turns old ?loc=&dist= links into a radius search with a valid radius', () => {
    const q = paramsToQuery(new URLSearchParams('loc=Massachusetts%20General%20Hospital&dist=1'));
    expect(q).toMatchObject({ mode: 'radius', place: 'Massachusetts General Hospital', miles: 5 });
  });

  it('falls back to default statuses when the status list is empty or garbage', () => {
    expect(paramsToQuery(new URLSearchParams('mode=state&state=CA&status='))?.statuses).toEqual(DEFAULT_STATUSES);
    expect(paramsToQuery(new URLSearchParams('mode=state&state=CA&status=FOO,BAR'))?.statuses).toEqual(DEFAULT_STATUSES);
  });

  it('keeps only known statuses, case-insensitively', () => {
    const q = paramsToQuery(new URLSearchParams('mode=state&state=ca&status=recruiting,NOPE,active_not_recruiting'));
    expect(q?.statuses).toEqual(['RECRUITING', 'ACTIVE_NOT_RECRUITING']);
    expect(q).toMatchObject({ stateCode: 'CA' });
  });

  it('caps absurdly long text', () => {
    const q = paramsToQuery(new URLSearchParams({ mode: 'city', city: 'x'.repeat(5000), state: 'TX' }));
    expect(q?.mode === 'city' && q.city.length).toBe(100);
  });

  it('snaps a non-numeric radius to a sane default', () => {
    expect(paramsToQuery(new URLSearchParams('mode=radius&place=Boston&miles=abc'))).toMatchObject({ miles: 25 });
  });
});

describe('validateQuery', () => {
  it('rejects unknown or missing states', () => {
    expect(validateQuery({ mode: 'state', stateCode: '', ...base })).toBe('missing_state');
    expect(validateQuery({ mode: 'state', stateCode: 'ZZ', ...base })).toBe('missing_state');
  });

  it('rejects text that is empty once unsafe characters are removed', () => {
    expect(validateQuery({ mode: 'city', city: ' "" \\ ', stateCode: 'MA', ...base })).toBe('missing_city');
  });

  it('requires 3 usable characters for an institution', () => {
    expect(validateQuery({ mode: 'institution', institution: 'ab', stateCode: null, ...base })).toBe('institution_too_short');
    expect(validateQuery({ mode: 'institution', institution: 'Mayo', stateCode: null, ...base })).toBeNull();
  });

  it('requires at least one status', () => {
    expect(validateQuery({ mode: 'state', stateCode: 'CA', statuses: [], condition: '' })).toBe('no_status');
  });
});

describe('helpers', () => {
  it('nearestRadius snaps to offered values', () => {
    expect(nearestRadius(1)).toBe(5);
    expect(nearestRadius(37)).toBe(25);
    expect(nearestRadius(1000)).toBe(100);
    expect(nearestRadius(NaN)).toBe(25);
  });

  it('searchableText strips quotes and backslashes', () => {
    expect(searchableText('foo" bar\\')).toBe('foo bar');
  });

  it('queryKey ignores whitespace differences', () => {
    const a: SearchQuery = { mode: 'city', city: '  Boston ', stateCode: 'MA', ...base };
    const b: SearchQuery = { mode: 'city', city: 'Boston', stateCode: 'MA', ...base };
    expect(queryKey(a)).toBe(queryKey(b));
  });

  it('describeQuery names the state in full', () => {
    expect(describeQuery({ mode: 'state', stateCode: 'CA', ...base, condition: 'lupus' })).toBe(
      'Sites in California, condition "lupus"',
    );
  });

  it('describeQuery title-cases a place typed in lower case and keeps mixed case as typed', () => {
    expect(describeQuery({ mode: 'city', city: ' san  diego ', stateCode: 'CA', ...base })).toBe('Sites in San Diego, CA');
    expect(describeQuery({ mode: 'city', city: 'winston-salem', stateCode: 'NC', ...base })).toBe('Sites in Winston-Salem, NC');
    expect(describeQuery({ mode: 'radius', place: 'McAllen TX', miles: 25, ...base })).toBe('Sites within 25 miles of McAllen TX');
    expect(describeQuery({ mode: 'radius', place: 'boston, ma', miles: 25, ...base })).toBe('Sites within 25 miles of Boston, MA');
  });
});
