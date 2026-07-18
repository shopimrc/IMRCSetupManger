// features/tracks/storage/trackStorage.js

import AsyncStorage from '@react-native-async-storage/async-storage';

export const TRACKS_STORAGE_KEY = '@tracks';

const nowIso = () => new Date().toISOString();

function clean(value) {
  return String(value || '').trim();
}

function cleanUpper(value) {
  return clean(value).toUpperCase();
}

function cleanComparable(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function cleanKey(value) {
  return cleanComparable(value).replace(/\s+/g, '');
}

function cleanZip(value) {
  return clean(value).replace(/[^0-9]/g, '').slice(0, 5);
}

function cleanUrl(value) {
  return clean(value)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

function sortTracksAlphabetically(tracks = []) {
  return [...tracks].sort((a, b) => {
    const nameCompare = clean(a.trackName).localeCompare(
      clean(b.trackName),
      undefined,
      { sensitivity: 'base', numeric: true }
    );

    if (nameCompare !== 0) return nameCompare;

    const cityCompare = clean(a.city).localeCompare(
      clean(b.city),
      undefined,
      { sensitivity: 'base', numeric: true }
    );

    if (cityCompare !== 0) return cityCompare;

    return clean(a.state).localeCompare(
      clean(b.state),
      undefined,
      { sensitivity: 'base', numeric: true }
    );
  });
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

function trackIdentityParts(track = {}) {
  const normalized = normalizeTrack(track);

  return {
    id: clean(normalized.id),
    nameKey: cleanKey(normalized.trackName),
    typeKey: cleanKey(normalized.trackType),
    addressKey: cleanKey(normalized.address),
    cityKey: cleanKey(normalized.city),
    stateKey: cleanKey(normalized.state),
    zipKey: cleanZip(normalized.zipCode),
    liveRcKey: cleanUrl(normalized.liveRcUrl),
  };
}

export function findTrackImportMatch(existingTracks = [], incomingTrack = {}) {
  const incoming = trackIdentityParts(incomingTrack);

  if (!incoming.nameKey && !incoming.liveRcKey && !incoming.id) {
    return null;
  }

  const normalizedExistingTracks = existingTracks.map(track => ({
    track,
    parts: trackIdentityParts(track),
  }));

  const idMatch = normalizedExistingTracks.find(({ parts }) => (
    incoming.id &&
    parts.id &&
    String(parts.id) === String(incoming.id)
  ));

  if (idMatch) {
    return idMatch.track;
  }

  const liveRcMatch = normalizedExistingTracks.find(({ parts }) => (
    incoming.liveRcKey &&
    parts.liveRcKey &&
    incoming.liveRcKey === parts.liveRcKey
  ));

  if (liveRcMatch) {
    return liveRcMatch.track;
  }

  const nameTypeZipMatch = normalizedExistingTracks.find(({ parts }) => (
    incoming.nameKey &&
    parts.nameKey === incoming.nameKey &&
    incoming.typeKey &&
    parts.typeKey === incoming.typeKey &&
    incoming.zipKey &&
    parts.zipKey === incoming.zipKey
  ));

  if (nameTypeZipMatch) {
    return nameTypeZipMatch.track;
  }

  const nameTypeCityStateMatch = normalizedExistingTracks.find(({ parts }) => (
    incoming.nameKey &&
    parts.nameKey === incoming.nameKey &&
    incoming.typeKey &&
    parts.typeKey === incoming.typeKey &&
    incoming.cityKey &&
    parts.cityKey === incoming.cityKey &&
    incoming.stateKey &&
    parts.stateKey === incoming.stateKey
  ));

  if (nameTypeCityStateMatch) {
    return nameTypeCityStateMatch.track;
  }

  const nameAddressCityMatch = normalizedExistingTracks.find(({ parts }) => (
    incoming.nameKey &&
    parts.nameKey === incoming.nameKey &&
    incoming.addressKey &&
    parts.addressKey === incoming.addressKey &&
    incoming.cityKey &&
    parts.cityKey === incoming.cityKey
  ));

  if (nameAddressCityMatch) {
    return nameAddressCityMatch.track;
  }

  const nameZipMatch = normalizedExistingTracks.find(({ parts }) => (
    incoming.nameKey &&
    parts.nameKey === incoming.nameKey &&
    incoming.zipKey &&
    parts.zipKey === incoming.zipKey
  ));

  if (nameZipMatch) {
    return nameZipMatch.track;
  }

  return null;
}

function withNonBlankIncomingFields(existing = {}, incoming = {}) {
  const merged = {
    ...existing,
  };

  const fields = [
    'schemaVersion',
    'trackName',
    'trackType',
    'address',
    'city',
    'state',
    'cityState',
    'zipCode',
    'liveRcUrl',
    'phone',
    'direction',
    'surface',
    'tractionLevel',
    'runLine',
    'trackDimensions',
    'location',
    'notes',
  ];

  fields.forEach(field => {
    const incomingValue = incoming[field];

    if (field === 'schemaVersion') {
      merged.schemaVersion = Math.max(
        Number(existing.schemaVersion || 1),
        Number(incoming.schemaVersion || 1)
      );
      return;
    }

    if (clean(incomingValue)) {
      merged[field] = incomingValue;
    }
  });

  return merged;
}

export async function getTracks() {
  try {
    const raw = await AsyncStorage.getItem(TRACKS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) return [];

    return sortTracksAlphabetically(parsed.map(normalizeTrack));
  } catch (error) {
    console.warn('Failed to load tracks:', error);
    return [];
  }
}

export async function saveTracks(tracks = []) {
  const normalized = Array.isArray(tracks)
    ? sortTracksAlphabetically(tracks.map(normalizeTrack))
    : [];

  await AsyncStorage.setItem(TRACKS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function getTrackById(trackId) {
  if (!trackId) return null;
  const tracks = await getTracks();
  return tracks.find(track => String(track.id) === String(trackId)) || null;
}

export async function upsertTrack(track = {}) {
  const { isValid, errors } = validateTrack(track);

  if (!isValid) {
    const error = new Error('Track validation failed.');
    error.validationErrors = errors;
    throw error;
  }

  const tracks = await getTracks();
  const incomingId = track.id || generateTrackId();
  const existingIndex = tracks.findIndex(item => String(item.id) === String(incomingId));

  const existing = existingIndex >= 0 ? tracks[existingIndex] : {};
  const normalized = normalizeTrack({
    ...existing,
    ...track,
    id: incomingId,
    createdAt: existing.createdAt || track.createdAt || nowIso(),
    updatedAt: nowIso(),
  });

  let nextTracks;

  if (existingIndex >= 0) {
    nextTracks = [...tracks];
    nextTracks[existingIndex] = normalized;
  } else {
    nextTracks = [normalized, ...tracks];
  }

  await saveTracks(nextTracks);
  return normalized;
}

export async function importTrack(track = {}) {
  const { isValid, errors } = validateTrack(track);

  if (!isValid) {
    const error = new Error('Track validation failed.');
    error.validationErrors = errors;
    throw error;
  }

  const tracks = await getTracks();
  const normalizedIncoming = normalizeTrack({
    ...track,
    id: track.id || generateTrackId(),
    createdAt: track.createdAt || nowIso(),
    updatedAt: nowIso(),
  });

  const existingMatch = findTrackImportMatch(tracks, normalizedIncoming);

  if (existingMatch) {
    const merged = normalizeTrack({
      ...withNonBlankIncomingFields(existingMatch, normalizedIncoming),
      id: existingMatch.id,
      createdAt: existingMatch.createdAt || normalizedIncoming.createdAt || nowIso(),
      updatedAt: nowIso(),
    });

    const nextTracks = [
      merged,
      ...tracks.filter(item => String(item.id) !== String(existingMatch.id)),
    ];

    await saveTracks(nextTracks);

    return {
      ...merged,
      importAction: 'updated',
      matchedTrackId: existingMatch.id,
    };
  }

  const imported = normalizeTrack({
    ...normalizedIncoming,
    id: normalizedIncoming.id || generateTrackId(),
    createdAt: normalizedIncoming.createdAt || nowIso(),
    updatedAt: nowIso(),
  });

  await saveTracks([imported, ...tracks]);

  return {
    ...imported,
    importAction: 'created',
  };
}

function isBlank(value) {
  return !clean(value);
}

function appendMergedNotes(target = {}, source = {}) {
  const targetNotes = clean(target.notes);
  const sourceNotes = clean(source.notes);

  if (!sourceNotes) return targetNotes;
  if (targetNotes.includes(sourceNotes)) return targetNotes;

  const sourceName = clean(source.trackName) || 'Merged Track';
  const mergedNote = `Merged from ${sourceName}:\n${sourceNotes}`;

  return targetNotes ? `${targetNotes}\n\n${mergedNote}` : mergedNote;
}

function fillMissingTrackFields(target = {}, source = {}) {
  const next = { ...target };

  [
    'trackType',
    'surface',
    'address',
    'city',
    'state',
    'cityState',
    'zipCode',
    'liveRcUrl',
    'phone',
    'direction',
    'tractionLevel',
    'runLine',
    'trackDimensions',
    'location',
  ].forEach(field => {
    if (isBlank(next[field]) && clean(source[field])) {
      next[field] = source[field];
    }
  });

  next.notes = appendMergedNotes(target, source);
  return next;
}

function looksLikeSetupStorageKey(key = '') {
  const value = String(key || '').toLowerCase();
  return value.includes('setup') || value.includes('setups');
}

function stableJson(value) {
  try {
    return JSON.stringify(value, Object.keys(value || {}).sort());
  } catch (error) {
    return JSON.stringify(value);
  }
}

function getRecordMergeKey(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return '';

  const directId = record.id || record.setupId || record.versionId || record.historyId;
  if (directId) return `id:${directId}`;

  const vehicleId = record.vehicleId || record.carId || record.vehicle?.id || record.car?.id;
  const trackId = record.trackId || record.track?.id;
  const name = record.name || record.setupName || record.title || record.versionName;
  const createdAt = record.createdAt || record.savedAt || record.updatedAt;

  if (vehicleId && trackId && (name || createdAt)) {
    return `combo:${vehicleId}:${trackId}:${name || ''}:${createdAt || ''}`;
  }

  return stableJson(record);
}

function mergeJsonValues(targetValue, sourceValue) {
  if (targetValue == null) return sourceValue;
  if (sourceValue == null) return targetValue;

  if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
    const map = new Map();

    [...targetValue, ...sourceValue].forEach(item => {
      const key = getRecordMergeKey(item);
      if (!map.has(key)) {
        map.set(key, item);
        return;
      }

      const existing = map.get(key);
      map.set(key, mergeJsonValues(existing, item));
    });

    return Array.from(map.values());
  }

  if (
    targetValue &&
    sourceValue &&
    typeof targetValue === 'object' &&
    typeof sourceValue === 'object' &&
    !Array.isArray(targetValue) &&
    !Array.isArray(sourceValue)
  ) {
    const merged = { ...targetValue };

    Object.keys(sourceValue).forEach(key => {
      if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
        merged[key] = sourceValue[key];
      } else {
        merged[key] = mergeJsonValues(merged[key], sourceValue[key]);
      }
    });

    return merged;
  }

  return targetValue === '' || targetValue == null ? sourceValue : targetValue;
}

function replaceTrackRefsInJson(value, sourceTrackId, targetTrackId, targetTrackName) {
  let replacements = 0;
  const sourceId = String(sourceTrackId);
  const targetId = String(targetTrackId);

  function visit(node) {
    if (Array.isArray(node)) {
      return node.map(visit);
    }

    if (node && typeof node === 'object') {
      const wasSourceTrackRecord =
        String(node.trackId || '') === sourceId ||
        String(node.selectedTrackId || '') === sourceId ||
        String(node.activeTrackId || '') === sourceId ||
        String(node.track?.id || '') === sourceId;

      const next = {};

      Object.keys(node).forEach(key => {
        const valueForKey = node[key];

        if (
          ['trackId', 'selectedTrackId', 'activeTrackId'].includes(key) &&
          String(valueForKey) === sourceId
        ) {
          next[key] = targetId;
          replacements += 1;
          return;
        }

        if (
          wasSourceTrackRecord &&
          ['trackName', 'selectedTrackName', 'activeTrackName'].includes(key)
        ) {
          next[key] = targetTrackName;
          replacements += 1;
          return;
        }

        if (key === 'track' && valueForKey && typeof valueForKey === 'object') {
          const nextTrack = visit(valueForKey);

          if (String(valueForKey.id || '') === sourceId) {
            nextTrack.id = targetId;
            nextTrack.trackName = targetTrackName;
            nextTrack.name = targetTrackName;
            replacements += 1;
          }

          next[key] = nextTrack;
          return;
        }

        next[key] = visit(valueForKey);
      });

      return next;
    }

    if (typeof node === 'string' && node === sourceId) {
      replacements += 1;
      return targetId;
    }

    return node;
  }

  return {
    value: visit(value),
    replacements,
  };
}

async function migrateSetupStorageForTrackMerge(sourceTrackId, targetTrackId, targetTrackName) {
  const keys = await AsyncStorage.getAllKeys();
  const setupKeys = keys.filter(looksLikeSetupStorageKey);

  let setupKeysTouched = 0;
  let setupValuesUpdated = 0;
  let setupKeysMerged = 0;
  let setupKeysRemoved = 0;

  for (const key of setupKeys) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;

    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      continue;
    }

    const keyContainsSource = String(key).includes(String(sourceTrackId));
    const nextKey = keyContainsSource
      ? String(key).split(String(sourceTrackId)).join(String(targetTrackId))
      : key;

    const result = replaceTrackRefsInJson(
      parsed,
      sourceTrackId,
      targetTrackId,
      targetTrackName
    );

    if (!keyContainsSource && result.replacements <= 0) {
      continue;
    }

    let nextValue = result.value;

    if (nextKey !== key) {
      const existingRaw = await AsyncStorage.getItem(nextKey);

      if (existingRaw) {
        try {
          const existingParsed = JSON.parse(existingRaw);
          nextValue = mergeJsonValues(existingParsed, nextValue);
          setupKeysMerged += 1;
        } catch (error) {
          // Keep migrated value if existing target value is not JSON.
        }
      }

      await AsyncStorage.setItem(nextKey, JSON.stringify(nextValue));
      await AsyncStorage.removeItem(key);
      setupKeysRemoved += 1;
    } else {
      await AsyncStorage.setItem(key, JSON.stringify(nextValue));
    }

    setupKeysTouched += 1;
    setupValuesUpdated += result.replacements;
  }

  return {
    setupKeysTouched,
    setupValuesUpdated,
    setupKeysMerged,
    setupKeysRemoved,
  };
}

export async function mergeTracksWithSetups({
  sourceTrackId,
  targetTrackId,
} = {}) {
  if (!sourceTrackId || !targetTrackId) {
    const error = new Error('Both sourceTrackId and targetTrackId are required.');
    error.userMessage = 'Choose two tracks to merge.';
    throw error;
  }

  if (String(sourceTrackId) === String(targetTrackId)) {
    const error = new Error('Cannot merge a track into itself.');
    error.userMessage = 'Choose a different track to merge into.';
    throw error;
  }

  const tracks = await getTracks();
  const sourceTrack = tracks.find(track => String(track.id) === String(sourceTrackId));
  const targetTrack = tracks.find(track => String(track.id) === String(targetTrackId));

  if (!sourceTrack || !targetTrack) {
    const error = new Error('Source or target track was not found.');
    error.userMessage = 'One of the selected tracks no longer exists.';
    throw error;
  }

  const mergedTarget = normalizeTrack({
    ...fillMissingTrackFields(targetTrack, sourceTrack),
    id: targetTrack.id,
    createdAt: targetTrack.createdAt || nowIso(),
    updatedAt: nowIso(),
  });

  const nextTracks = [
    mergedTarget,
    ...tracks.filter(track => (
      String(track.id) !== String(sourceTrack.id) &&
      String(track.id) !== String(targetTrack.id)
    )),
  ];

  await saveTracks(nextTracks);

  const setupMigration = await migrateSetupStorageForTrackMerge(
    sourceTrack.id,
    mergedTarget.id,
    mergedTarget.trackName
  );

  return {
    sourceTrack,
    targetTrack: mergedTarget,
    ...setupMigration,
  };
}

export async function deleteTrack(trackId) {
  if (!trackId) return false;

  const tracks = await getTracks();
  const nextTracks = tracks.filter(track => String(track.id) !== String(trackId));

  await saveTracks(nextTracks);
  return nextTracks.length !== tracks.length;
}
