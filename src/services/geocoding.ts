import axios from 'axios';
import type { GeoResult } from '../types';

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    amenity?: string;
    hospital?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

export interface LocationSuggestion {
  shortName: string;
  fullName: string;
  lat: number;
  lng: number;
}

function toShortName(r: NominatimResult): string {
  const parts = r.display_name.split(', ');
  const first = parts[0];
  const addr = r.address;
  if (addr) {
    const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? '';
    const state = addr.state ?? '';
    const pieces = [first, city, state].filter(Boolean);
    if (pieces.length > 1) return pieces.join(', ');
  }
  // fallback: first 3 comma-parts
  return parts.slice(0, 3).join(', ');
}

export async function fetchSuggestions(query: string): Promise<LocationSuggestion[]> {
  if (query.trim().length < 3) return [];

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '6',
    addressdetails: '1',
  });

  const response = await axios.get<NominatimResult[]>(
    `/nominatim-proxy/search?${params}`,
    { headers: { Accept: 'application/json' } }
  );

  return response.data.map((r) => ({
    shortName: toShortName(r),
    fullName: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
  }));
}

export async function geocodeLocation(query: string): Promise<GeoResult> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    addressdetails: '0',
  });

  const response = await axios.get<NominatimResult[]>(
    `/nominatim-proxy/search?${params}`,
    { headers: { Accept: 'application/json' } }
  );

  if (!response.data.length) {
    throw new Error(`No location found for: "${query}". Try a more specific address.`);
  }

  const result = response.data[0];
  return {
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    displayName: result.display_name,
  };
}
