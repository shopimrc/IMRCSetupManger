// features/tools/lib/trackDistance.js

const EARTH_RADIUS_MILES = 3958.7613;

export function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

export function distanceMiles(from, to) {
  const lat1 = Number(from?.latitude);
  const lon1 = Number(from?.longitude);
  const lat2 = Number(to?.latitude);
  const lon2 = Number(to?.longitude);

  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

export function formatMiles(value) {
  if (value == null || !Number.isFinite(value)) return 'Unknown';
  if (value < 10) return `${value.toFixed(1)} mi`;
  return `${Math.round(value)} mi`;
}


function parseCityStateZipFromAddress(value) {
  const text = String(value || '')
    .replace(/\bUSA\b/gi, '')
    .replace(/\bUnited States\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;

  const matches = Array.from(text.matchAll(/(?:^|,)\s*([^,]+?)\s*,?\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?/gi));
  const match = matches[matches.length - 1];
  if (!match) return null;

  return {
    city: String(match[1] || '').trim(),
    state: String(match[2] || '').trim().toUpperCase(),
    zip: String(match[3] || '').trim(),
  };
}

export function normalizeTrack(raw = {}) {
  const location = raw.location || raw.addressInfo || raw.place || {};
  const name = raw.name || raw.trackName || raw.title || raw.label || raw.venue || 'Unnamed Track';

  const fullAddress = raw.address || raw.street || raw.streetAddress || raw.fullAddress || location.address || location.street || '';
  const parsedAddress = parseCityStateZipFromAddress(fullAddress);

  const city = raw.city || raw.town || raw.locality || location.city || location.town || parsedAddress?.city || '';
  const state = raw.state || raw.region || raw.province || location.state || location.region || parsedAddress?.state || '';
  const zip = raw.zip || raw.zipCode || raw.postalCode || location.zip || location.postalCode || parsedAddress?.zip || '';
  const street = fullAddress;
  const country = raw.country || location.country || 'USA';

  const trackType =
    raw.trackType
    || raw.type
    || raw.style
    || raw.racingStyle
    || raw.raceStyle
    || raw.layoutType
    || raw.category
    || '';

  const racingStyle =
    raw.racingStyle
    || raw.raceStyle
    || raw.trackType
    || raw.type
    || raw.style
    || raw.layoutType
    || raw.category
    || '';

  const surface = raw.surface || raw.trackSurface || raw.surfaces || raw.trackSurfaces || '';
  const liverc = raw.liveRcUrl || raw.livercUrl || raw.liveRC || raw.liveRc || raw.url || raw.website || '';

  const latitude = Number(raw.latitude ?? raw.lat ?? raw.coords?.latitude ?? raw.coordinates?.latitude ?? location.latitude ?? location.lat);
  const longitude = Number(raw.longitude ?? raw.lng ?? raw.lon ?? raw.coords?.longitude ?? raw.coordinates?.longitude ?? location.longitude ?? location.lng ?? location.lon);

  const addressParts = [street, city, state, zip, country].filter(Boolean);
  const address = addressParts.join(', ');

  return {
    ...raw,
    id: raw.id || raw.trackId || raw.slug || `${name}-${city}-${state}-${zip}`,
    name,
    city,
    state,
    zip,
    street,
    country,
    address,
    trackType,
    racingStyle,
    surface,
    liverc,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}
