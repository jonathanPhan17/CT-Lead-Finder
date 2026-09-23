export type SearchErrorKind =
  | 'offline'
  | 'ctgov_unavailable'
  | 'rate_limited'
  | 'invalid_query'
  | 'bad_response'
  | 'place_not_found'
  | 'geocoder_unavailable';

export class SearchError extends Error {
  readonly kind: SearchErrorKind;

  constructor(kind: SearchErrorKind) {
    super(kind);
    this.name = 'SearchError';
    this.kind = kind;
  }
}

/** Plain-language copy shown to users. Never show raw error text. */
export const SEARCH_ERROR_MESSAGES: Record<SearchErrorKind, { title: string; detail: string }> = {
  offline: {
    title: 'You appear to be offline',
    detail: 'Check your internet connection, then try the search again.',
  },
  ctgov_unavailable: {
    title: 'ClinicalTrials.gov is not responding',
    detail: 'Their service may be down or slow right now. Try again in a few minutes.',
  },
  rate_limited: {
    title: 'ClinicalTrials.gov is limiting requests',
    detail: 'Too many searches were sent in a short time. Wait a minute, then try again.',
  },
  invalid_query: {
    title: 'ClinicalTrials.gov could not read this search',
    detail: 'Try simpler wording in the location or condition fields.',
  },
  bad_response: {
    title: 'ClinicalTrials.gov sent back data this app does not recognize',
    detail: 'Try again. If it keeps happening, their data format may have changed.',
  },
  place_not_found: {
    title: 'That place could not be found',
    detail: 'Check the spelling, or add the state or country, for example "Springfield, Illinois".',
  },
  geocoder_unavailable: {
    title: 'The map lookup service is not responding',
    detail: 'Try again in a moment, or search by state, city or institution instead.',
  },
};

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
