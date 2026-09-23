/** Builders for raw ClinicalTrials.gov payloads, used only by tests. */

export interface RawContact {
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
  phoneExt?: string;
}

export interface RawLocation {
  facility?: string;
  city?: string;
  state?: string;
  country?: string;
  status?: string;
  geoPoint?: { lat: number; lon: number };
  contacts?: RawContact[];
}

export function rawStudy(nctId: string, locations: RawLocation[], extra: { title?: string; status?: string; phases?: string[] } = {}) {
  return {
    protocolSection: {
      identificationModule: { nctId, briefTitle: extra.title ?? `Study ${nctId}` },
      statusModule: { overallStatus: extra.status ?? 'RECRUITING' },
      conditionsModule: { conditions: ['Condition A'] },
      designModule: { phases: extra.phases ?? ['PHASE2'] },
      sponsorCollaboratorsModule: { leadSponsor: { name: 'Sponsor Inc' } },
      contactsLocationsModule: { locations },
    },
  };
}

export function rawPage(studies: unknown[], nextPageToken?: string, totalCount?: number) {
  return { studies, nextPageToken, totalCount };
}

export const BOSTON = { lat: 42.36008, lon: -71.05888 };
export const CAMBRIDGE = { lat: 42.3751, lon: -71.10561 };
export const LOS_ANGELES = { lat: 34.05223, lon: -118.24368 };
