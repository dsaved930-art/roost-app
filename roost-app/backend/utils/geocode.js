// Free, keyless geocoding via the US Census Bureau. No signup, no credit
// card, no spending cap to worry about — the tradeoff is that this API is
// built primarily for full street addresses (it interpolates a point along
// an address range), so a bare "City, State" query may not always find a
// match. When it doesn't, callers should treat that as "no coordinates
// available" and fall back gracefully, not as an error.

const BASE_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

async function geocodeCityState(city, state) {
  if (!city || !state) return null;
  const address = `${city}, ${state}`;
  const url = `${BASE_URL}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = await res.json();
    const matches = data && data.result && data.result.addressMatches;
    if (!matches || matches.length === 0) return null;

    const coords = matches[0].coordinates;
    if (!coords || typeof coords.y !== 'number' || typeof coords.x !== 'number') return null;
    return { lat: coords.y, lon: coords.x };
  } catch (e) {
    console.error('Geocoding failed for', address, '-', e.message);
    return null; // never let a geocoding failure break the caller
  }
}

// Haversine formula — great-circle distance between two lat/lon points, in miles.
function distanceMiles(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 3958.8; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { geocodeCityState, distanceMiles };
