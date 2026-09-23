import type { GeoCenter } from './ctgovRequest';
import { normalizeKey } from './normalize';
import { findUsState, findUsStateByName } from './usStates';
import { isAbortError, SearchError } from './searchErrors';
import type { FetchDeps } from './fetchStudies';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
/** Nominatim's usage policy allows at most one request per second and forbids autocomplete. */
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 15_000;

const cache = new Map<string, GeoCenter>();
let lastRequestAt = 0;

/** Reads the US state from Nominatim's address details. Puerto Rico comes back as its own country code. */
function parseStateCode(address: unknown): string | null {
  if (typeof address !== 'object' || address === null) return null;
  const a = address as Record<string, unknown>;
  const country = typeof a.country_code === 'string' ? a.country_code.toLowerCase() : '';
  if (country === 'pr') return findUsState('PR')?.code ?? null;
  if (country !== 'us' || typeof a.state !== 'string') return null;
  return findUsStateByName(a.state)?.code ?? null;
}

function parseFirstResult(json: unknown): GeoCenter | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const first: unknown = json[0];
  if (typeof first !== 'object' || first === null) return null;
  const r = first as Record<string, unknown>;
  const lat = typeof r.lat === 'string' ? Number(r.lat) : NaN;
  const lng = typeof r.lon === 'string' ? Number(r.lon) : NaN;
  const label = typeof r.display_name === 'string' ? r.display_name : '';
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, label: label || `${lat.toFixed(3)}, ${lng.toFixed(3)}`, stateCode: parseStateCode(r.address) };
}

/** Resolves a typed place to coordinates. Runs once per search, never while typing. */
export async function geocodePlace(place: string, signal: AbortSignal, deps: FetchDeps): Promise<GeoCenter> {
  const key = normalizeKey(place);
  const cached = cache.get(key);
  if (cached) return cached;

  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await deps.sleep(wait, signal);
  lastRequestAt = Date.now();

  const params = new URLSearchParams({ q: place, format: 'jsonv2', limit: '1', addressdetails: '1' });
  let resp: Response;
  try {
    resp = await deps.fetch(`${NOMINATIM_URL}?${params}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
      headers: { Accept: 'application/json' },
    });
  } catch {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new SearchError(deps.isOnline() ? 'geocoder_unavailable' : 'offline');
  }
  if (!resp.ok) throw new SearchError('geocoder_unavailable');

  let json: unknown;
  try {
    json = await resp.json();
  } catch (err) {
    if (isAbortError(err) || signal.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new SearchError('geocoder_unavailable');
  }
  if (Array.isArray(json) && json.length === 0) throw new SearchError('place_not_found');
  const center = parseFirstResult(json);
  if (!center) throw new SearchError('geocoder_unavailable');
  cache.set(key, center);
  return center;
}
