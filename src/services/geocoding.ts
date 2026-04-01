import axios from 'axios';
import type { GeoResult } from '../types';

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
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
