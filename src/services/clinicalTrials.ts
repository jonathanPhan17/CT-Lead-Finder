import axios from 'axios';
import type { ContactRow } from '../types';

const CT_V2_API = '/ct-proxy/api/v2/studies';

// ── v2 API types ──────────────────────────────────────────────────────────────

interface CTContact {
  name?: string;
  role?: string;
  phone?: string;
  phoneExt?: string;
  email?: string;
}

interface CTLocation {
  facility?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
  status?: string;
  contacts?: CTContact[];
  geoPoint?: { lat: number; lon: number };
}

interface CTStudy {
  protocolSection: {
    identificationModule: {
      nctId: string;
      briefTitle?: string;
    };
    statusModule: {
      overallStatus?: string;
    };
    conditionsModule?: {
      conditions?: string[];
    };
    designModule?: {
      phases?: string[];
    };
    sponsorCollaboratorsModule?: {
      leadSponsor?: { name?: string };
    };
    contactsLocationsModule?: {
      centralContacts?: CTContact[];
      locations?: CTLocation[];
    };
  };
}

interface CTResponse {
  studies?: CTStudy[];
  nextPageToken?: string;
  totalCount?: number;
}

// ── public interface ──────────────────────────────────────────────────────────

export interface SearchOptions {
  lat: number;
  lng: number;
  distance: number; // miles
  recruitingOnly: boolean;
  pageToken?: string;
}

export interface SearchResponse {
  contacts: ContactRow[];
  nextPageToken?: string;
  totalStudies: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function isPI(role?: string): boolean {
  return (role ?? '').toUpperCase().includes('PRINCIPAL');
}

function extractContacts(study: CTStudy): ContactRow[] {
  const rows: ContactRow[] = [];
  const ps = study.protocolSection;
  const nctId = ps.identificationModule.nctId;
  const title = ps.identificationModule.briefTitle ?? '';
  const status = ps.statusModule.overallStatus ?? '';
  const conditions = (ps.conditionsModule?.conditions ?? []).join(', ');
  const phase = (ps.designModule?.phases ?? [])
    .map((p) => p.replace('PHASE', 'Phase '))
    .join(', ');
  const sponsor = ps.sponsorCollaboratorsModule?.leadSponsor?.name ?? '';
  const clm = ps.contactsLocationsModule;

  if (!clm) return rows;

  // Central contacts (study-wide, no specific facility)
  for (let i = 0; i < (clm.centralContacts?.length ?? 0); i++) {
    const c = clm.centralContacts![i];
    rows.push({
      id: `${nctId}-cen-${i}`,
      nctId, status, phase, sponsor, conditions,
      studyTitle: title,
      facility: '',
      city: '',
      state: '',
      country: '',
      contactName: c.name ?? '',
      contactRole: formatRole(c.role),
      contactEmail: c.email ?? '',
      contactPhone: formatPhone(c.phone, c.phoneExt),
      isPrincipalInvestigator: isPI(c.role),
      source: 'central',
    });
  }

  // Location contacts
  for (let li = 0; li < (clm.locations?.length ?? 0); li++) {
    const loc = clm.locations![li];
    for (let ci = 0; ci < (loc.contacts?.length ?? 0); ci++) {
      const c = loc.contacts![ci];
      rows.push({
        id: `${nctId}-loc-${li}-${ci}`,
        nctId, status, phase, sponsor, conditions,
        studyTitle: title,
        facility: loc.facility ?? '',
        city: loc.city ?? '',
        state: loc.state ?? '',
        country: loc.country ?? '',
        contactName: c.name ?? '',
        contactRole: formatRole(c.role),
        contactEmail: c.email ?? '',
        contactPhone: formatPhone(c.phone, c.phoneExt),
        isPrincipalInvestigator: isPI(c.role),
        source: 'location',
      });
    }
  }

  return rows;
}

function formatRole(role?: string): string {
  if (!role) return '';
  return role
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPhone(phone?: string, ext?: string): string {
  if (!phone) return '';
  return ext ? `${phone} ext. ${ext}` : phone;
}

function dedupeContacts(contacts: ContactRow[]): ContactRow[] {
  const seen = new Set<string>();
  return contacts.filter((c) => {
    const key = `${c.nctId}|${c.contactName.toLowerCase()}|${c.contactEmail.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── main export ───────────────────────────────────────────────────────────────

export async function searchTrials(opts: SearchOptions): Promise<SearchResponse> {
  const params = new URLSearchParams({
    format: 'json',
    'filter.geo': `distance(${opts.lat},${opts.lng},${opts.distance}mi)`,
    pageSize: '200',
  });

  if (opts.recruitingOnly) {
    params.set('filter.overallStatus', 'RECRUITING');
  }
  if (opts.pageToken) {
    params.set('pageToken', opts.pageToken);
  }

  const response = await axios.get<CTResponse>(`${CT_V2_API}?${params}`);
  const data = response.data;

  console.debug('[ClinicalTrials] raw response sample:', data.studies?.[0]);

  const allContacts = (data.studies ?? []).flatMap(extractContacts);
  const contacts = dedupeContacts(allContacts);

  return {
    contacts,
    nextPageToken: data.nextPageToken,
    totalStudies: data.totalCount ?? 0,
  };
}
