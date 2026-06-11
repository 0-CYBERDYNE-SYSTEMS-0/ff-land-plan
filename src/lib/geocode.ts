// Open-Meteo geocoding API (free, keyless). https://open-meteo.com/en/docs/geocoding-api

export interface GeocodeResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number | null;
  country: string | null;
  admin1: string | null; // state/region
}

export async function searchPlaces(query: string): Promise<GeocodeResult[]> {
  if (query.trim().length < 2) return [];
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query.trim());
  url.searchParams.set('count', '6');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const json = (await res.json()) as { results?: GeocodeResult[] };
  return (json.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    elevation: r.elevation ?? null,
    country: r.country ?? null,
    admin1: r.admin1 ?? null,
  }));
}
