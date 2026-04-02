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
  studyIds: string[];
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

  // Only extract contacts from locations within the search radius.
  // Central contacts and overall officials are excluded — they are typically
  // study leadership at a remote institution, not local site contacts.
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

/** Dedupe contacts by name+trial, merging the richest contact info across duplicates. */
function dedupeContacts(contacts: ContactRow[]): ContactRow[] {
  const map = new Map<string, ContactRow>();

  for (const c of contacts) {
    // Key by name + trial only (ignore facility so overallOfficials merge with location entries)
    const key = `${c.nctId}|${c.contactName.toLowerCase()}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, { ...c });
      continue;
    }

    // Merge: keep the richest info from either entry
    if (!existing.contactEmail && c.contactEmail) existing.contactEmail = c.contactEmail;
    if (!existing.contactPhone && c.contactPhone) existing.contactPhone = c.contactPhone;
    if (!existing.facility && c.facility) existing.facility = c.facility;
    if (!existing.city && c.city) existing.city = c.city;
    if (!existing.state && c.state) existing.state = c.state;
    if (!existing.country && c.country) existing.country = c.country;
    // Promote to PI if any entry marks them as PI
    if (c.isPrincipalInvestigator) existing.isPrincipalInvestigator = true;
    // Prefer location source over central (has facility info)
    if (existing.source === 'central' && c.source === 'location') existing.source = c.source;
  }

  return Array.from(map.values());
}

// ── main export ───────────────────────────────────────────────────────────────

export async function searchTrials(opts: SearchOptions, signal?: AbortSignal): Promise<SearchResponse> {
  const params = new URLSearchParams({
    format: 'json',
    'filter.geo': `distance(${opts.lat},${opts.lng},${opts.distance}mi)`,
    pageSize: '100',
  });

  if (opts.recruitingOnly) {
    params.set('filter.overallStatus', 'RECRUITING');
  }
  if (opts.pageToken) {
    params.set('pageToken', opts.pageToken);
  }

  const response = await axios.get<CTResponse>(`${CT_V2_API}?${params}`, { signal });
  const data = response.data;

  // Count studies with at least one location in radius (independent of contacts)
  const studyIds: string[] = [];
  for (const s of data.studies ?? []) {
    const locs = s.protocolSection.contactsLocationsModule?.locations ?? [];
    for (const loc of locs) {
      if (loc.geoPoint && distanceMiles(opts.lat, opts.lng, loc.geoPoint.lat, loc.geoPoint.lon) <= opts.distance) {
        studyIds.push(s.protocolSection.identificationModule.nctId);
        break;
      }
    }
  }

  const allContacts = (data.studies ?? []).flatMap((s) =>
    extractContacts(s, opts.lat, opts.lng, opts.distance)
  );
  const deduped = dedupeContacts(allContacts);

  // Only keep contacts from studies that have at least one PI in the results
  const studiesWithPI = new Set(
    deduped.filter((c) => c.isPrincipalInvestigator).map((c) => c.nctId),
  );
  const contacts = deduped.filter((c) => studiesWithPI.has(c.nctId));

  return {
    contacts,
    nextPageToken: data.nextPageToken,
    studyIds,
  };
}
