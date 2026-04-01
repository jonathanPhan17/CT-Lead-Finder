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

interface CTInvestigator {
  name?: string;
  role?: string;
  affiliation?: string;
}

interface CTLocation {
  facility?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
  status?: string;
  contacts?: CTContact[];
  investigators?: CTInvestigator[];
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

/** Haversine distance in miles between two lat/lng points */
function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractContacts(
  study: CTStudy,
  searchLat: number,
  searchLng: number,
  maxDistanceMiles: number,
): ContactRow[] {
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

  // Central contacts — study-wide, always include
  for (let i = 0; i < (clm.centralContacts?.length ?? 0); i++) {
    const c = clm.centralContacts![i];
    rows.push({
      id: `${nctId}-cen-${i}`,
      nctId, status, phase, sponsor, conditions,
      studyTitle: title,
      facility: '', city: '', state: '', country: '',
      contactName: c.name ?? '',
      contactRole: formatRole(c.role),
      contactEmail: c.email ?? '',
      contactPhone: formatPhone(c.phone, c.phoneExt),
      isPrincipalInvestigator: isPI(c.role),
      source: 'central',
    });
  }

  // Location contacts & investigators — only from sites within the search radius
  for (let li = 0; li < (clm.locations?.length ?? 0); li++) {
    const loc = clm.locations![li];

    // Skip this site if it has no coordinates (can't verify it's in range)
    // or if it's outside the search radius
    if (!loc.geoPoint) continue;
    const d = distanceMiles(searchLat, searchLng, loc.geoPoint.lat, loc.geoPoint.lon);
    if (d > maxDistanceMiles) continue;

    const base = {
      nctId, status, phase, sponsor, conditions,
      studyTitle: title,
      facility: loc.facility ?? '',
      city: loc.city ?? '',
      state: loc.state ?? '',
      country: loc.country ?? '',
    };

    // Contacts (have phone/email)
    for (let ci = 0; ci < (loc.contacts?.length ?? 0); ci++) {
      const c = loc.contacts![ci];
      rows.push({
        ...base,
        id: `${nctId}-loc-${li}-c-${ci}`,
        contactName: c.name ?? '',
        contactRole: formatRole(c.role),
        contactEmail: c.email ?? '',
        contactPhone: formatPhone(c.phone, c.phoneExt),
        isPrincipalInvestigator: isPI(c.role),
        source: 'location',
      });
    }

    // Investigators (PIs listed separately — usually no email/phone)
    for (let ii = 0; ii < (loc.investigators?.length ?? 0); ii++) {
      const inv = loc.investigators![ii];
      rows.push({
        ...base,
        id: `${nctId}-loc-${li}-inv-${ii}`,
        contactName: inv.name ?? '',
        contactRole: formatRole(inv.role),
        contactEmail: '',
        contactPhone: '',
        isPrincipalInvestigator: isPI(inv.role),
        source: 'location',
      });
    }
  }

  return rows;
}

function formatRole(role?: string): string {
  if (!role) return '';
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPhone(phone?: string, ext?: string): string {
  if (!phone) return '';
  return ext ? `${phone} ext. ${ext}` : phone;
}

function dedupeContacts(contacts: ContactRow[]): ContactRow[] {
  const seen = new Set<string>();
  return contacts.filter((c) => {
    const key = `${c.nctId}|${c.contactName.toLowerCase()}|${c.facility.toLowerCase()}`;
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
    pageSize: '25',
  });

  if (opts.recruitingOnly) {
    params.set('filter.overallStatus', 'RECRUITING');
  }
  if (opts.pageToken) {
    params.set('pageToken', opts.pageToken);
  }

  const response = await axios.get<CTResponse>(`${CT_V2_API}?${params}`);
  const data = response.data;

  const allContacts = (data.studies ?? []).flatMap((s) =>
    extractContacts(s, opts.lat, opts.lng, opts.distance)
  );
  const contacts = dedupeContacts(allContacts);

  const uniqueStudies = new Set(contacts.map((c) => c.nctId)).size;

  return {
    contacts,
    nextPageToken: data.nextPageToken,
    totalStudies: uniqueStudies,
  };
}
