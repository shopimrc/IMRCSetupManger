// features/tracks/utils/trackModel.js

const nowIso = () => new Date().toISOString();

function clean(value) {
  return String(value || '').trim();
}

function cleanUpper(value) {
  return clean(value).toUpperCase();
}

function parseCityState(cityState = '') {
  const value = clean(cityState);

  if (!value) {
    return { city: '', state: '' };
  }

  const parts = value.split(',').map(part => clean(part));

  if (parts.length >= 2) {
    return {
      city: parts[0],
      state: cleanUpper(parts[1]),
    };
  }

  return {
    city: value,
    state: '',
  };
}

export function generateTrackId() {
  return `track_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function buildTrackLocation(track = {}) {
  const address = clean(track.address || track.streetAddress);
  const city = clean(track.city);
  const state = cleanUpper(track.state);
  const zipCode = clean(track.zipCode || track.zip || track.postalCode);

  const cityState = [city, state].filter(Boolean).join(', ');
  const cityStateZip = [cityState, zipCode].filter(Boolean).join(' ');
  const splitLocation = [address, cityStateZip].filter(Boolean).join(' • ');

  return splitLocation || clean(track.location);
}

export function normalizeTrack(track = {}) {
  const createdAt = track.createdAt || nowIso();
  const parsedCityState = parseCityState(track.cityState);

  const city = clean(track.city) || parsedCityState.city;
  const state = cleanUpper(track.state) || parsedCityState.state;

  const normalized = {
    id: track.id || generateTrackId(),

    schemaVersion: Number(track.schemaVersion || track.imrcTrackExportVersion || 1),

    trackName: clean(track.trackName || track.name),
    trackType: clean(track.trackType || track.type),

    address: clean(track.address || track.streetAddress || track.street || track.locationAddress),
    city,
    state,
    cityState: clean(track.cityState) || [city, state].filter(Boolean).join(', '),
    zipCode: clean(track.zipCode || track.zip || track.postalCode),

    liveRcUrl: clean(
      track.liveRcUrl ||
        track.livercUrl ||
        track.liveRCUrl ||
        track.liveRc ||
        track.liverc
    ),
    phone: clean(track.phone),

    direction: clean(track.direction),
    surface: clean(track.surface),
    tractionLevel: clean(track.tractionLevel),
    runLine: clean(track.runLine),
    trackDimensions: clean(track.trackDimensions),

    location: clean(track.location),
    notes: clean(track.notes),

    createdAt,
    updatedAt: track.updatedAt || createdAt,
  };

  return {
    ...normalized,
    locationDisplay: buildTrackLocation(normalized),
  };
}

export function validateTrack(track = {}) {
  const errors = {};

  if (!clean(track.trackName)) {
    errors.trackName = 'Track Name is required.';
  }

  if (!clean(track.trackType)) {
    errors.trackType = 'Track Type is required.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
