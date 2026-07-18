import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createDefaultSetup,
  getEntityId,
  getTrackDisplayName,
  getVehicleDisplayName,
  makeSetupId,
  makeSetupKey,
  normalizeSetup,
} from './setupModel';
import { applySetupCalculations } from './setupCalc';
import { recordRaceDaySetupChanges } from '../../raceday/lib/raceDaySetupChangeRecorder';
import { markCloudDirty } from '../../../app/services/cloudSync';

export const VEHICLES_KEY = '@vehicles';
export const TRACKS_KEY = '@tracks';
export const SETUPS_KEY = '@setups';
export const LAST_VIEWED_SETUP_KEY = '@lastViewedSetup';
export const SETUPS_EXPORT_SCHEMA = 'imrc-setups-export-v1';

export function getDraftKey(vehicleId, trackId) {
  return `@draft_setup_${makeSetupKey(vehicleId, trackId)}`;
}

export function getHistoryKey(vehicleId, trackId) {
  return `@setupHistory_${makeSetupKey(vehicleId, trackId)}`;
}

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Unable to read ${key}`, error);
    return fallback;
  }
}

async function writeJson(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

async function markSetupStorageDirty({ reason = 'setup-change', keys = [], type = 'setup', id = '' } = {}) {
  try {
    await markCloudDirty({
      reason,
      keys: Array.from(new Set(keys.filter(Boolean))),
      type,
      id,
    });
  } catch (error) {
    console.warn('Setup cloud dirty mark failed', error);
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function setupTimeValue(setup) {
  const raw = setup?.savedAt || setup?.updatedAt || setup?.createdAt || setup?.id || '';
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeImportSetup(setup) {
  if (!setup || typeof setup !== 'object') return null;
  const vehicleId = String(setup.vehicleId || setup.carId || setup.vehicleID || setup.vehicle?.id || '');
  const trackId = String(setup.trackId || setup.trackID || setup.track?.id || '');
  const normalized = normalizeSetup({
    ...setup,
    vehicleId,
    trackId,
    id: setup.id || setup.setupId || makeSetupId(),
    readOnly: false,
  }, { vehicleId, trackId });
  const next = applySetupCalculations(normalized);

  if (!next.vehicleId || !next.trackId) return null;
  return next;
}

function mergeSetupVersions(existing = [], incoming = []) {
  const byId = new Map();

  [...ensureArray(existing), ...ensureArray(incoming)]
    .map(normalizeImportSetup)
    .filter(Boolean)
    .forEach((setup) => {
      const id = setup.id || setup.setupId || makeSetupId();
      const current = byId.get(id);
      if (!current || setupTimeValue(setup) >= setupTimeValue(current)) {
        byId.set(id, { ...setup, id });
      }
    });

  return Array.from(byId.values())
    .sort((a, b) => setupTimeValue(b) - setupTimeValue(a))
    .slice(0, 10);
}

function pickLatestBySetupKey(setups = []) {
  const byKey = new Map();

  ensureArray(setups)
    .map(normalizeImportSetup)
    .filter(Boolean)
    .forEach((setup) => {
      const key = makeSetupKey(setup.vehicleId, setup.trackId);
      const current = byKey.get(key);
      if (!current || setupTimeValue(setup) >= setupTimeValue(current)) {
        byKey.set(key, setup);
      }
    });

  return Array.from(byKey.values()).sort((a, b) => setupTimeValue(b) - setupTimeValue(a));
}

export async function getVehicles() {
  return ensureArray(await readJson(VEHICLES_KEY, []));
}

export async function getTracks() {
  return ensureArray(await readJson(TRACKS_KEY, []));
}

export async function getSetups() {
  return ensureArray(await readJson(SETUPS_KEY, []));
}

export async function getLastViewedSetup() {
  return readJson(LAST_VIEWED_SETUP_KEY, null);
}

export async function setLastViewedSetup(value) {
  await writeJson(LAST_VIEWED_SETUP_KEY, value);
}

export async function getSetupHistory(vehicleId, trackId) {
  return ensureArray(await readJson(getHistoryKey(vehicleId, trackId), []));
}

export async function getDraftSetup(vehicleId, trackId) {
  return readJson(getDraftKey(vehicleId, trackId), null);
}

export async function saveDraftSetup(vehicleId, trackId, setup) {
  const now = new Date().toISOString();
  const draft = applySetupCalculations({
    ...(setup || {}),
    vehicleId: String(vehicleId),
    trackId: String(trackId),
    updatedAt: now,
  });
  await writeJson(getDraftKey(vehicleId, trackId), draft);
  return draft;
}

export async function clearDraftSetup(vehicleId, trackId) {
  await AsyncStorage.removeItem(getDraftKey(vehicleId, trackId));
}

export async function loadSetupForEditor({ vehicleId, trackId, setupId, readOnly }) {
  const [vehicles, tracks, history, draft] = await Promise.all([
    getVehicles(),
    getTracks(),
    getSetupHistory(vehicleId, trackId),
    getDraftSetup(vehicleId, trackId),
  ]);

  const vehicle = vehicles.find((item) => getEntityId(item) === String(vehicleId));
  const track = tracks.find((item) => getEntityId(item) === String(trackId));
  const latestSaved = history[0] || null;

  let selected = null;

  if (readOnly && setupId) {
    selected = history.find((item) => item.id === setupId) || null;
  } else if (draft?.updatedAt && (!latestSaved?.savedAt || new Date(draft.updatedAt) >= new Date(latestSaved.savedAt))) {
    selected = draft;
  } else if (latestSaved) {
    selected = latestSaved;
  }

  const setup = selected
    ? normalizeSetup(selected, { vehicle, track, vehicleId, trackId })
    : createDefaultSetup({ vehicle, track, vehicleId, trackId });

  return {
    setup: applySetupCalculations({
      ...setup,
      readOnly: Boolean(readOnly),
      vehicleName: setup.vehicleName || getVehicleDisplayName(vehicle),
      trackName: setup.trackName || getTrackDisplayName(track),
    }),
    vehicle,
    track,
    history,
  };
}

export async function saveSetupVersion(setup, options = {}) {
  const now = new Date().toISOString();
  const version = applySetupCalculations({
    ...setup,
    id: makeSetupId(),
    savedAt: now,
    updatedAt: now,
    readOnly: false,
  });

  const historyKey = getHistoryKey(version.vehicleId, version.trackId);
  const existingHistory = await getSetupHistory(version.vehicleId, version.trackId);
  const nextHistory = [version, ...existingHistory].slice(0, 10);
  await writeJson(historyKey, nextHistory);

  const setupKey = makeSetupKey(version.vehicleId, version.trackId);
  const list = await getSetups();
  const filtered = list.filter((item) => makeSetupKey(item.vehicleId, item.trackId) !== setupKey);
  await writeJson(SETUPS_KEY, [version, ...filtered]);

  await setLastViewedSetup({
    setupId: version.id,
    vehicleId: version.vehicleId,
    trackId: version.trackId,
    vehicleName: version.vehicleName,
    trackName: version.trackName,
    savedAt: version.savedAt,
  });

  await clearDraftSetup(version.vehicleId, version.trackId);

  await markSetupStorageDirty({
    reason: 'setup-save',
    keys: [SETUPS_KEY, historyKey, LAST_VIEWED_SETUP_KEY],
    type: 'setup',
    id: version.id || version.setupId || setupKey,
  });

  if (options?.beforeSetup) {
    try {
      await recordRaceDaySetupChanges({
        beforeSetup: options.beforeSetup,
        afterSetup: version,
        vehicleId: version.vehicleId,
        trackId: version.trackId,
        setupId: version.id || version.setupId,
        setupName: version.name || version.setupName,
      });
    } catch (error) {
      console.warn('RaceDay setup change recording failed', error);
    }
  }

  return version;
}



export async function saveSetupCopyToTarget(sourceSetup, options = {}) {
  if (!sourceSetup || typeof sourceSetup !== 'object') {
    throw new Error('No setup was selected to copy.');
  }

  const vehicleId = String(options.vehicleId || getEntityId(options.vehicle) || sourceSetup.vehicleId || '');
  const trackId = String(options.trackId || getEntityId(options.track) || sourceSetup.trackId || '');

  if (!vehicleId || !trackId) {
    throw new Error('Choose both a car and a track before importing this setup.');
  }

  const now = new Date().toISOString();
  const vehicleName = getVehicleDisplayName(options.vehicle) || sourceSetup.vehicleName || sourceSetup.vehicle || 'Vehicle';
  const trackName = getTrackDisplayName(options.track) || sourceSetup.trackName || sourceSetup.track || 'Track';

  const copiedSetup = applySetupCalculations(normalizeSetup({
    ...sourceSetup,
    id: undefined,
    setupId: undefined,
    readOnly: false,
    vehicleId,
    trackId,
    vehicleName,
    trackName,
    copiedFromSetupId: sourceSetup.id || sourceSetup.setupId || sourceSetup.copiedFromSetupId || null,
    copiedFromVehicleId: sourceSetup.vehicleId || null,
    copiedFromTrackId: sourceSetup.trackId || null,
    copiedFromVehicleName: sourceSetup.vehicleName || null,
    copiedFromTrackName: sourceSetup.trackName || null,
    copySource: options.source || 'setup-copy',
    copiedAt: now,
    importedAt: options.source === 'imrc-import' ? now : sourceSetup.importedAt,
  }, { vehicle: options.vehicle, track: options.track, vehicleId, trackId }));

  return saveSetupVersion(copiedSetup, { skipRaceDayRecord: true });
}

export async function deleteSetupVersion(vehicleId, trackId, setupId) {
  const history = await getSetupHistory(vehicleId, trackId);
  const nextHistory = history.filter((item) => item.id !== setupId);
  await writeJson(getHistoryKey(vehicleId, trackId), nextHistory);

  const latest = nextHistory[0];
  const setupKey = makeSetupKey(vehicleId, trackId);
  const list = await getSetups();
  const filtered = list.filter((item) => makeSetupKey(item.vehicleId, item.trackId) !== setupKey);

  if (latest) {
    await writeJson(SETUPS_KEY, [latest, ...filtered]);
  } else {
    await writeJson(SETUPS_KEY, filtered);
  }

  await markSetupStorageDirty({
    reason: 'setup-delete',
    keys: [SETUPS_KEY, getHistoryKey(vehicleId, trackId)],
    type: 'setup',
    id: setupId || setupKey,
  });

  return nextHistory;
}

export async function getAllSetupHistoryExports() {
  const keys = await AsyncStorage.getAllKeys();
  const historyKeys = keys.filter((key) => key.startsWith('@setupHistory_'));
  const pairs = await AsyncStorage.multiGet(historyKeys);

  return pairs.map(([key, raw]) => {
    let history = [];
    try {
      history = raw ? ensureArray(JSON.parse(raw)) : [];
    } catch {
      history = [];
    }

    const first = history[0] || {};
    return {
      key,
      vehicleId: String(first.vehicleId || ''),
      trackId: String(first.trackId || ''),
      history,
    };
  }).filter((item) => item.history.length);
}

export async function buildSetupExportBundle() {
  const [setups, vehicles, tracks, lastViewedSetup, setupHistories] = await Promise.all([
    getSetups(),
    getVehicles(),
    getTracks(),
    getLastViewedSetup(),
    getAllSetupHistoryExports(),
  ]);

  return {
    schema: SETUPS_EXPORT_SCHEMA,
    exportedAt: new Date().toISOString(),
    app: 'IMRC Setup Manager 2.0',
    data: {
      setups,
      setupHistories,
      lastViewedSetup,
      vehiclesSnapshot: vehicles,
      tracksSnapshot: tracks,
    },
  };
}

export async function importSetupExportBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('Invalid setup export file.');
  }

  const data = bundle.data || bundle;
  const importedSetups = ensureArray(data.setups || bundle.setups);
  const importedHistories = ensureArray(data.setupHistories || bundle.setupHistories || data.histories || bundle.histories);
  const importedLastViewed = data.lastViewedSetup || bundle.lastViewedSetup || null;

  if (!importedSetups.length && !importedHistories.length) {
    throw new Error('No setup records were found in this import file.');
  }

  const touchedSetupKeys = new Set();
  const importedLatestCandidates = [];

  for (const group of importedHistories) {
    const history = ensureArray(group.history || group.versions || group.items)
      .map(normalizeImportSetup)
      .filter(Boolean);

    if (!history.length) continue;

    const vehicleId = String(group.vehicleId || history[0]?.vehicleId || '');
    const trackId = String(group.trackId || history[0]?.trackId || '');
    if (!vehicleId || !trackId) continue;

    const key = makeSetupKey(vehicleId, trackId);
    const existing = await getSetupHistory(vehicleId, trackId);
    const merged = mergeSetupVersions(existing, history);
    await writeJson(getHistoryKey(vehicleId, trackId), merged);

    touchedSetupKeys.add(key);
    importedLatestCandidates.push(...merged);
  }

  for (const setup of importedSetups.map(normalizeImportSetup).filter(Boolean)) {
    const key = makeSetupKey(setup.vehicleId, setup.trackId);
    const existing = await getSetupHistory(setup.vehicleId, setup.trackId);
    const merged = mergeSetupVersions(existing, [setup]);
    await writeJson(getHistoryKey(setup.vehicleId, setup.trackId), merged);

    touchedSetupKeys.add(key);
    importedLatestCandidates.push(setup, ...merged);
  }

  const existingSetups = await getSetups();
  const nextSetups = pickLatestBySetupKey([...existingSetups, ...importedLatestCandidates]);
  await writeJson(SETUPS_KEY, nextSetups);

  if (importedLastViewed?.vehicleId && importedLastViewed?.trackId) {
    await setLastViewedSetup(importedLastViewed);
  }

  await markSetupStorageDirty({
    reason: 'setup-import',
    keys: [
      SETUPS_KEY,
      LAST_VIEWED_SETUP_KEY,
      ...Array.from(touchedSetupKeys).map((key) => `@setupHistory_${key}`),
    ],
    type: 'setup-import',
    id: `setup-import-${Date.now()}`,
  });

  return {
    importedSetupCount: importedSetups.length,
    importedHistoryGroupCount: importedHistories.length,
    mergedSetupCount: touchedSetupKeys.size,
    latestSetupCount: nextSetups.length,
  };
}

function makeImportedEntityId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanImportedName(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function sameDisplayName(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function getSetupVehicleSourceName(setup = {}) {
  return cleanImportedName(
    setup.vehicleName || setup.carName || setup.vehicle || setup.name || setup.setupName,
    'Imported Vehicle'
  );
}

function getSetupTrackSourceName(setup = {}) {
  return cleanImportedName(
    setup.trackName || setup.track || setup.trackTitle || setup.locationName,
    'Imported Track'
  );
}

export async function ensureVehicleForImportedSetup(setup = {}) {
  const vehicles = await getVehicles();
  const wantedName = getSetupVehicleSourceName(setup);
  const existing = vehicles.find((vehicle) => sameDisplayName(getVehicleDisplayName(vehicle), wantedName));
  if (existing) return existing;

  const now = new Date().toISOString();
  const vehicle = {
    id: makeImportedEntityId('vehicle_import'),
    vehicleName: wantedName,
    name: wantedName,
    manufacturer: setup.vehicleManufacturer || setup.manufacturer || '',
    model: setup.vehicleModel || setup.model || '',
    chassisStyle: setup.vehicleChassisStyle || setup.chassisStyle || setup.chassisProfile?.label || '',
    transponder: setup.transponder || setup.transponderNumber || '',
    notes: setup.vehicleNotes || '',
    importedFromSetup: true,
    createdAt: now,
    updatedAt: now,
  };

  await writeJson(VEHICLES_KEY, [vehicle, ...vehicles]);
  await markSetupStorageDirty({ reason: 'setup-import-vehicle-created', keys: [VEHICLES_KEY], type: 'vehicle', id: vehicle.id });
  return vehicle;
}

export async function ensureTrackForImportedSetup(setup = {}) {
  const tracks = await getTracks();
  const wantedName = getSetupTrackSourceName(setup);
  const existing = tracks.find((track) => sameDisplayName(getTrackDisplayName(track), wantedName));
  if (existing) return existing;

  const now = new Date().toISOString();
  const track = {
    id: makeImportedEntityId('track_import'),
    trackName: wantedName,
    name: wantedName,
    trackType: setup.trackType || setup.trackStyle || setup.trackCategory || '',
    surface: setup.trackSurface || setup.surface || '',
    runLine: setup.runLine || '',
    notes: setup.trackNotes || '',
    importedFromSetup: true,
    createdAt: now,
    updatedAt: now,
  };

  await writeJson(TRACKS_KEY, [track, ...tracks]);
  await markSetupStorageDirty({ reason: 'setup-import-track-created', keys: [TRACKS_KEY], type: 'track', id: track.id });
  return track;
}
