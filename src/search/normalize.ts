/** Lowercase, accent-free, punctuation-free form for comparing free-text names. */
export function normalizeKey(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** True when `needle` appears as a whole-word phrase inside `haystack` ("UCLA" matches "UCLA Health", not "Euclalpha"). */
export function containsPhrase(haystack: string, needle: string): boolean {
  const n = normalizeKey(needle);
  return n !== '' && ` ${normalizeKey(haystack)} `.includes(` ${n} `);
}

const TITLE_RE = /^(dr|prof|professor|mr|mrs|ms|miss)\.?\s+/i;

/** "Dr. Jane Doe, MD, PhD" and "Jane Doe" compare equal. */
export function normalizePersonName(name: string): string {
  return normalizeKey(name.split(',')[0].trim().replace(TITLE_RE, ''));
}

/** Haversine distance in miles. */
export function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
