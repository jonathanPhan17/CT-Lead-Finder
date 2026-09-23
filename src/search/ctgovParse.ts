export type ContactRole = 'PRINCIPAL_INVESTIGATOR' | 'SUB_INVESTIGATOR' | 'CONTACT' | 'OTHER';

export interface StudyContact {
  name: string | null;
  role: ContactRole;
  emails: string[];
  phone: string | null;
}

export interface StudySite {
  facility: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  status: string | null;
  geo: { lat: number; lng: number } | null;
  contacts: StudyContact[];
}

export interface Study {
  nctId: string;
  title: string;
  overallStatus: string | null;
  conditions: string[];
  phases: string[];
  sponsor: string | null;
  sites: StudySite[];
}

export interface StudiesPage {
  studies: Study[];
  nextPageToken: string | null;
  totalCount: number | null;
  /** Records dropped because they lacked an NCT id or were not objects. */
  skippedRecords: number;
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function obj(v: unknown): Obj {
  return isObj(v) ? v : {};
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(str).filter((s): s is string => s !== null);
}

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const EMAIL_RE = /^[^\s@;,]+@[^\s@;,]+\.[a-z]{2,}$/i;

/** Contact emails are free text: some hold two addresses, "n/a", or trailing punctuation. */
export function parseEmails(v: unknown): string[] {
  const raw = str(v);
  if (!raw) return [];
  const found = raw
    .split(/[\s;,/]+/)
    .map((p) => p.replace(/^[<(["']+|[>)\]"'.]+$/g, '').toLowerCase())
    .filter((p) => EMAIL_RE.test(p));
  return [...new Set(found)];
}

function parseRole(v: unknown): ContactRole {
  const r = str(v)?.toUpperCase();
  if (r === 'PRINCIPAL_INVESTIGATOR' || r === 'SUB_INVESTIGATOR' || r === 'CONTACT') return r;
  return 'OTHER';
}

function parseContact(v: unknown): StudyContact | null {
  if (!isObj(v)) return null;
  const phone = str(v.phone);
  const ext = str(v.phoneExt);
  const contact: StudyContact = {
    name: str(v.name),
    role: parseRole(v.role),
    emails: parseEmails(v.email),
    phone: phone ? (ext ? `${phone} ext. ${ext}` : phone) : null,
  };
  return contact.name || contact.emails.length > 0 || contact.phone ? contact : null;
}

function parseGeo(v: unknown): StudySite['geo'] {
  if (!isObj(v)) return null;
  const lat = finite(v.lat);
  const lng = finite(v.lon);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function parseSite(v: unknown): StudySite | null {
  if (!isObj(v)) return null;
  const contacts = Array.isArray(v.contacts)
    ? v.contacts.map(parseContact).filter((c): c is StudyContact => c !== null)
    : [];
  return {
    facility: str(v.facility),
    city: str(v.city),
    state: str(v.state),
    country: str(v.country),
    status: str(v.status)?.toUpperCase() ?? null,
    geo: parseGeo(v.geoPoint),
    contacts,
  };
}

function parseStudy(v: unknown): Study | null {
  if (!isObj(v)) return null;
  const ps = obj(v.protocolSection);
  const nctId = str(obj(ps.identificationModule).nctId);
  if (!nctId) return null;
  const locations = obj(ps.contactsLocationsModule).locations;
  return {
    nctId,
    title: str(obj(ps.identificationModule).briefTitle) ?? nctId,
    overallStatus: str(obj(ps.statusModule).overallStatus)?.toUpperCase() ?? null,
    conditions: strList(obj(ps.conditionsModule).conditions),
    phases: strList(obj(ps.designModule).phases),
    sponsor: str(obj(obj(ps.sponsorCollaboratorsModule).leadSponsor).name),
    sites: Array.isArray(locations)
      ? locations.map(parseSite).filter((s): s is StudySite => s !== null)
      : [],
  };
}

/** Returns null when the payload is not a studies response at all. */
export function parseStudiesPage(json: unknown): StudiesPage | null {
  if (!isObj(json) || (json.studies !== undefined && !Array.isArray(json.studies))) return null;
  const raw: unknown[] = Array.isArray(json.studies) ? json.studies : [];
  const studies = raw.map(parseStudy).filter((s): s is Study => s !== null);
  const total = finite(json.totalCount);
  return {
    studies,
    nextPageToken: str(json.nextPageToken),
    totalCount: total !== null && total >= 0 ? total : null,
    skippedRecords: raw.length - studies.length,
  };
}

const PHASE_LABELS: Record<string, string> = {
  EARLY_PHASE1: 'Early Phase 1',
  PHASE1: 'Phase 1',
  PHASE2: 'Phase 2',
  PHASE3: 'Phase 3',
  PHASE4: 'Phase 4',
};

/** "Phase 1/2" style label; empty when not applicable or unknown. */
export function phaseLabel(phases: readonly string[]): string {
  const labels = phases.map((p) => PHASE_LABELS[p.toUpperCase()]).filter((l): l is string => l !== undefined);
  if (labels.length === 0) return '';
  if (labels.every((l) => l.startsWith('Phase '))) return 'Phase ' + labels.map((l) => l.slice(6)).join('/');
  return labels.join(' / ');
}
