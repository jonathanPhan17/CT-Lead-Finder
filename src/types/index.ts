export interface GeoResult {
  lat: number;
  lng: number;
  displayName: string;
}

export interface ContactRow {
  id: string;
  nctId: string;
  studyTitle: string;
  status: string;
  phase: string;
  sponsor: string;
  conditions: string;
  facility: string;
  city: string;
  state: string;
  country: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  contactPhone: string;
  isPrincipalInvestigator: boolean;
  source: 'location' | 'central';
}

export type SortKey = keyof ContactRow;
export type SortDir = 'asc' | 'desc';
