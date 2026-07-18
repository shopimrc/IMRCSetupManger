import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getEntityId,
  getTrackDisplayName,
  getVehicleDisplayName,
  makeSetupKey,
  normalizeSetup,
} from './setupModel';
import { applySetupCalculations } from './setupCalc';

export const SETUPS_MIGRATION_VERSION = 'setups-local-cloud-v2-2026-07-02';
export const SETUPS_MIGRATION_LOG_KEY = '@setups_migration_log_v2';

const VEHICLES_KEY = '@vehicles';
const TRACKS_KEY = '@tracks';
const SETUPS_KEY = '@setups';
const LAST_VIEWED_SETUP_KEY = '@lastViewedSetup';

const LEGACY_SETUP_KEYS = [
  '@setups',
  '@setupList',
  '@savedSetups',
  '@setups_v1',
  '@setupData',
  '@setupSheets',
  '@savedSetupSheets',
  'setups',
  'setupData',
  'savedSetups',
  'setupList',
  'setupSheets',
  'savedSetupSheets',
];

const LEGACY_HISTORY_KEYS = [
  '@setupHistory',
  '@setupHistory_v1',
  '@setup_history',
  '@setupVersions',
  '@setupVersions_v1',
  '@setup_versions',
  '@setupSavedVersions',
  '@setup_saved_versions',
  '@savedSetupVersions',
  '@saved_setup_versions',
];

const DYNAMIC_HISTORY_PREFIXES = [
  '@setupHistory_',
  '@setup_history_',
  '@setup_history_v1_',
  '@setupVersions_',
  '@setup_versions_',
  '@setup_versions_v1_',
  '@setupSavedVersions_',
  '@setup_saved_versions_',
  '@savedSetupVersions_',
  '@saved_setup_versions_',
  '@setupVersionHistory_',
  '@setup_version_history_',
];

const CATALOG_SETUP_FIELDS = [
  'setupId', 'setupName', 'title', 'label',
  'vehicleId', 'carId', 'vehicleID', 'vehicleName', 'carName', 'vehicle', 'car',
  'trackId', 'trackID', 'trackName', 'track', 'trackTitle', 'locationName',
  'gearing', 'spur', 'pinion', 'spurGear', 'pinionGear', 'rollout', 'rollOut', 'tireDiameter', 'tireDia', 'transmissionRatio', 'transRatio', 'internalRatio',
  'tires', 'lfTire', 'rfTire', 'lrTire', 'rrTire', 'tireLF', 'tireRF', 'tireLR', 'tireRR',
  'suspension', 'geometry', 'cornerWeights', 'weights', 'results', 'chassis', 'electronics', 'drivetrain',
  'notes', 'setupNotes', 'createdAt', 'updatedAt', 'savedAt', 'createdAtMs', 'updatedAtMs', 'savedAtMs',
];

function safeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function firstText(...values) {
  return values.find((value) => safeText(value)) || '';
}

function safeJsonParse(raw, fallback = null) {
  try {
    if (raw === null || raw === undefined || raw === '') return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function readJson(key, fallback) {
  return safeJsonParse(await AsyncStorage.getItem(key), fallback);
}

async function writeJsonIfChanged(key, value, changedKeys) {
  const next = JSON.stringify(value);
  const previous = await AsyncStorage.getItem(key);
  if (String(previous ?? '') !== next) {
    await AsyncStorage.setItem(key, next);
    changedKeys.add(key);
    return true;
  }
  return false;
}

function ensureArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'object') {
    const out = [];
    Object.entries(value).forEach(([bucketKey, bucketValue]) => {
      if (Array.isArray(bucketValue)) {
        bucketValue.forEach((item) => {
          if (item && typeof item === 'object') out.push({ ...item, _legacyBucketKey: bucketKey });
        });
      } else if (bucketValue && typeof bucketValue === 'object') {
        out.push({ ...bucketValue, _legacyBucketKey: bucketKey });
      }
    });
    return out;
  }
  return [];
}

function parseMaybeArrayRaw(raw) {
  return ensureArray(safeJsonParse(raw, []));
}

function looksLikeSetup(item) {
  if (!item || typeof item !== 'object') return false;
  return CATALOG_SETUP_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(item, key));
}

function fingerprint(value) {
  const text = JSON.stringify(value || {});
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function stableId(prefix, value) {
  return `${prefix}_${fingerprint(value).slice(0, 12)}`;
}

function sameName(a, b) {
  const aa = safeText(a).toLowerCase();
  const bb = safeText(b).toLowerCase();
  return !!aa && !!bb && aa === bb;
}

function findByIdOrName(items, wantedId, wantedName, displayGetter) {
  const id = safeText(wantedId);
  if (id) {
    const byId = items.find((item) => safeText(getEntityId(item)) === id);
    if (byId) return byId;
  }
  const name = safeText(wantedName);
  if (name) {
    const exact = items.find((item) => sameName(displayGetter(item), name));
    if (exact) return exact;
  }
  return null;
}

function getBucketIds(bucketKey = '') {
  const cleaned = safeText(bucketKey).replace(/^@setup[^_]*_?/i, '');
  const parts = cleaned.split('__');
  if (parts.length >= 2) return { vehicleId: parts[0], trackId: parts.slice(1).join('__') };
  const single = cleaned.split('_');
  if (single.length >= 2) return { vehicleId: single[0], trackId: single.slice(1).join('_') };
  return { vehicleId: '', trackId: '' };
}

function sourceVehicleName(setup = {}) {
  return firstText(
    setup.vehicleName,
    setup.carName,
    setup.vehicle?.name,
    setup.vehicle?.vehicleName,
    setup.car?.name,
    setup.car?.vehicleName,
    setup.name,
    setup.setupName,
    'Migrated Vehicle'
  );
}

function sourceTrackName(setup = {}) {
  return firstText(
    setup.trackName,
    setup.track?.name,
    setup.track?.trackName,
    setup.track?.title,
    setup.trackTitle,
    setup.locationName,
    'Migrated Track'
  );
}

function sourceVehicleId(setup = {}) {
  const fromBucket = getBucketIds(setup._legacyBucketKey || '');
  return safeText(firstText(
    setup.vehicleId,
    setup.carId,
    setup.vehicleID,
    setup.vehicle?.id,
    setup.vehicle?.vehicleId,
    setup.car?.id,
    fromBucket.vehicleId
  ));
}

function sourceTrackId(setup = {}) {
  const fromBucket = getBucketIds(setup._legacyBucketKey || '');
  return safeText(firstText(
    setup.trackId,
    setup.trackID,
    setup.track?.id,
    setup.track?.trackId,
    fromBucket.trackId
  ));
}

function createVehicleFromSetup(setup = {}, wantedId = '') {
  const name = sourceVehicleName(setup);
  const id = safeText(wantedId) || stableId('vehicle_migrated', name || setup);
  const now = new Date().toISOString();
  return {
    id,
    vehicleName: name,
    name,
    manufacturer: firstText(setup.vehicleManufacturer, setup.manufacturer, setup.vehicle?.manufacturer),
    model: firstText(setup.vehicleModel, setup.model, setup.vehicle?.model),
    chassisStyle: firstText(setup.vehicleChassisStyle, setup.chassisStyle, setup.vehicle?.chassisStyle, setup.chassisProfile?.label),
    transponder: firstText(setup.transponder, setup.transponderNumber, setup.vehicle?.transponder),
    notes: firstText(setup.vehicleNotes, setup.vehicle?.notes),
    migratedFromSetup: true,
    createdAt: firstText(setup.createdAt, now),
    updatedAt: now,
  };
}

function createTrackFromSetup(setup = {}, wantedId = '') {
  const name = sourceTrackName(setup);
  const id = safeText(wantedId) || stableId('track_migrated', name || setup);
  const now = new Date().toISOString();
  return {
    id,
    trackName: name,
    name,
    trackType: firstText(setup.trackType, setup.trackStyle, setup.trackCategory, setup.track?.trackType),
    surface: firstText(setup.trackSurface, setup.surface, setup.track?.surface),
    runLine: firstText(setup.runLine, setup.track?.runLine, setup.raceLine),
    notes: firstText(setup.trackNotes, setup.track?.notes),
    migratedFromSetup: true,
    createdAt: firstText(setup.createdAt, now),
    updatedAt: now,
  };
}

function setIfBlank(obj, key, value) {
  if (!obj || !key) return;
  if (safeText(obj[key])) return;
  if (!safeText(value)) return;
  obj[key] = value;
}

function enrichLegacyFields(raw = {}) {
  const setup = { ...(raw || {}) };
  const generalNotes = firstText(setup.notes, setup.setupNotes, setup.generalNotes, setup.comment, setup.comments);
  const resultNotes = firstText(setup.resultNotes, setup.raceNotes, setup.resultsNotes);

  setup.gearing = { ...(setup.gearing || {}) };
  setIfBlank(setup.gearing, 'notes', firstText(setup.gearingNotes, setup.gearingNote));

  setup.tires = { ...(setup.tires || {}) };
  setIfBlank(setup.tires, 'notes', firstText(setup.tireNotes, setup.tiresNotes));

  setup.suspension = { ...(setup.suspension || {}) };
  setIfBlank(setup.suspension, 'centerSpring', firstText(setup.suspension.centerSpring, setup.centerSpring, setup.centerSpringRate));
  setIfBlank(setup.suspension, 'centerOil', firstText(setup.suspension.centerOil, setup.centerOil, setup.centerOilWt));
  setIfBlank(setup.suspension, 'podHeight', firstText(setup.suspension.podHeight, setup.podHeight));
  setIfBlank(setup.suspension, 'podDroop', firstText(setup.suspension.podDroop, setup.podDroop));
  setIfBlank(setup.suspension, 'notes', firstText(setup.suspensionNotes, setup.shockNotes));

  setup.geometry = { ...(setup.geometry || {}) };
  setIfBlank(setup.geometry, 'frontToe', firstText(setup.geometry.frontToe, setup.frontToe));
  setIfBlank(setup.geometry, 'rearToe', firstText(setup.geometry.rearToe, setup.rearToe));
  setIfBlank(setup.geometry, 'ackermanAngle', firstText(setup.geometry.ackermanAngle, setup.ackermanAngle, setup.ackerman));
  setIfBlank(setup.geometry, 'tweak', firstText(setup.geometry.tweak, setup.tweak));
  setIfBlank(setup.geometry, 'frontRollCenter', firstText(setup.geometry.frontRollCenter, setup.frontRollCenter));
  setIfBlank(setup.geometry, 'frontSwayBar', firstText(setup.geometry.frontSwayBar, setup.frontSwayBar, setup.frontBar));
  setIfBlank(setup.geometry, 'rearToeBlock', firstText(setup.geometry.rearToeBlock, setup.rearToeBlock));
  setIfBlank(setup.geometry, 'rearAxleHeight', firstText(setup.geometry.rearAxleHeight, setup.rearAxleHeight));
  setIfBlank(setup.geometry, 'antiSquat', firstText(setup.geometry.antiSquat, setup.antiSquat));
  setIfBlank(setup.geometry, 'rearRollCenter', firstText(setup.geometry.rearRollCenter, setup.rearRollCenter));
  setIfBlank(setup.geometry, 'rearSwayBar', firstText(setup.geometry.rearSwayBar, setup.rearSwayBar, setup.rearBar));
  setIfBlank(setup.geometry, 'rearSteer', firstText(setup.geometry.rearSteer, setup.rearSteer));
  setIfBlank(setup.geometry, 'notes', firstText(setup.geometryNotes, setup.alignmentNotes));

  setup.cornerWeights = { ...(setup.cornerWeights || setup.weights || {}) };
  setIfBlank(setup.cornerWeights, 'totalWeight', firstText(setup.cornerWeights.totalWeight, setup.totalWeight));
  setIfBlank(setup.cornerWeights, 'crossWeight', firstText(setup.cornerWeights.crossWeight, setup.crossWeight, setup.crossWeightPercent));
  setIfBlank(setup.cornerWeights, 'leftBias', firstText(setup.cornerWeights.leftBias, setup.leftBias));
  setIfBlank(setup.cornerWeights, 'rightBias', firstText(setup.cornerWeights.rightBias, setup.rightBias));
  setIfBlank(setup.cornerWeights, 'frontBias', firstText(setup.cornerWeights.frontBias, setup.frontBias));
  setIfBlank(setup.cornerWeights, 'rearBias', firstText(setup.cornerWeights.rearBias, setup.rearBias));
  setIfBlank(setup.cornerWeights, 'notes', firstText(setup.weightNotes, setup.cornerWeightNotes));

  setup.results = { ...(setup.results || {}) };
  setIfBlank(setup.results, 'round', firstText(setup.results.round, setup.round, setup.raceRound));
  setIfBlank(setup.results, 'fastLap', firstText(setup.results.fastLap, setup.fastLap));
  setIfBlank(setup.results, 'avgLap', firstText(setup.results.avgLap, setup.avgLap, setup.averageLap));
  setIfBlank(setup.results, 'totalLaps', firstText(setup.results.totalLaps, setup.totalLaps, setup.laps));
  setIfBlank(setup.results, 'totalTime', firstText(setup.results.totalTime, setup.totalTime, setup.raceTime));
  setIfBlank(setup.results, 'motorTempF', firstText(setup.results.motorTempF, setup.motorTempF, setup.motorTemp, setup.motorTempFinal));
  setIfBlank(setup.results, 'notes', resultNotes);

  setup.chassis = { ...(setup.chassis || {}) };
  setIfBlank(setup.chassis, 'notes', firstText(generalNotes, setup.chassisNotes));

  setup.electronics = { ...(setup.electronics || {}) };
  setIfBlank(setup.electronics, 'batteryOrientation', firstText(setup.batteryOrientation));
  setIfBlank(setup.electronics, 'batteryWeight', firstText(setup.batteryWeight));
  setIfBlank(setup.electronics, 'notes', firstText(setup.electronicsNotes, setup.electricalNotes));

  setup.drivetrain = { ...(setup.drivetrain || {}) };
  setIfBlank(setup.drivetrain, 'transmission', firstText(setup.transmission, setup.trans));
  setIfBlank(setup.drivetrain, 'slipper', firstText(setup.slipper));
  setIfBlank(setup.drivetrain, 'slipperPads', firstText(setup.slipperPads));
  setIfBlank(setup.drivetrain, 'rearHubPosition', firstText(setup.rearHubPosition));
  setIfBlank(setup.drivetrain, 'diffHeight', firstText(setup.diffHeight));
  setIfBlank(setup.drivetrain, 'internalGears', firstText(setup.internalGears));
  setIfBlank(setup.drivetrain, 'planetGears', firstText(setup.planetGears));
  setIfBlank(setup.drivetrain, 'frontDiffType', firstText(setup.frontDiffType));
  setIfBlank(setup.drivetrain, 'frontDiffSetting', firstText(setup.frontDiffSetting));
  setIfBlank(setup.drivetrain, 'frontDiffFluid', firstText(setup.frontDiffFluid, setup.frontDiffOil));
  setIfBlank(setup.drivetrain, 'centerDiffType', firstText(setup.centerDiffType));
  setIfBlank(setup.drivetrain, 'centerDiffSetting', firstText(setup.centerDiffSetting));
  setIfBlank(setup.drivetrain, 'centerDiffFluid', firstText(setup.centerDiffFluid, setup.centerDiffOil));
  setIfBlank(setup.drivetrain, 'rearDiffType', firstText(setup.rearDiffType, setup.diffType));
  setIfBlank(setup.drivetrain, 'rearDiffSetting', firstText(setup.rearDiffSetting, setup.diffSetting));
  setIfBlank(setup.drivetrain, 'rearDiffFluid', firstText(setup.rearDiffFluid, setup.rearDiffOil, setup.diffFluid, setup.diffOil));
  setIfBlank(setup.drivetrain, 'rearDiffHeight', firstText(setup.rearDiffHeight));
  setIfBlank(setup.drivetrain, 'rearDiffGears', firstText(setup.rearDiffGears));
  setIfBlank(setup.drivetrain, 'notes', firstText(setup.drivetrainNotes, setup.diffNotes));

  return setup;
}

function versionSortMs(setup = {}) {
  const candidates = [setup.savedAtMs, setup.updatedAtMs, setup.createdAtMs, setup.savedAt, setup.updatedAt, setup.createdAt, setup.ts];
  for (const value of candidates) {
    if (!value) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 100000) return numeric;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeVersion(raw, { vehicles, tracks, vehicleMap, trackMap, sourceKey }) {
  if (!looksLikeSetup(raw)) return null;

  const enriched = enrichLegacyFields(raw);
  const rawVehicleId = sourceVehicleId(enriched);
  const rawTrackId = sourceTrackId(enriched);
  const vehicleName = sourceVehicleName(enriched);
  const trackName = sourceTrackName(enriched);

  let vehicle = findByIdOrName(vehicles, rawVehicleId, vehicleName, getVehicleDisplayName);
  if (!vehicle) {
    vehicle = createVehicleFromSetup(enriched, rawVehicleId);
    vehicles.unshift(vehicle);
    vehicleMap.set(String(getEntityId(vehicle)), vehicle);
  }

  let track = findByIdOrName(tracks, rawTrackId, trackName, getTrackDisplayName);
  if (!track) {
    track = createTrackFromSetup(enriched, rawTrackId);
    tracks.unshift(track);
    trackMap.set(String(getEntityId(track)), track);
  }

  const vehicleId = String(getEntityId(vehicle) || rawVehicleId);
  const trackId = String(getEntityId(track) || rawTrackId);
  const now = new Date().toISOString();
  const normalized = applySetupCalculations(normalizeSetup({
    ...enriched,
    id: enriched.id || enriched.setupId || stableId('setup_migrated', { sourceKey, enriched, vehicleId, trackId }),
    setupId: enriched.setupId || enriched.id,
    vehicleId,
    trackId,
    vehicleName: enriched.vehicleName || getVehicleDisplayName(vehicle),
    trackName: enriched.trackName || getTrackDisplayName(track),
    savedAt: enriched.savedAt || enriched.updatedAt || enriched.createdAt || now,
    updatedAt: enriched.updatedAt || enriched.savedAt || now,
    createdAt: enriched.createdAt || enriched.savedAt || now,
    migratedFromOldFormat: enriched.migratedFromOldFormat || true,
    migrationSourceKey: enriched.migrationSourceKey || sourceKey,
    migratedAt: enriched.migratedAt || now,
    readOnly: false,
  }, { vehicle, track, vehicleId, trackId }));

  return normalized;
}

function mergeVersions(existing = [], incoming = []) {
  const byKey = new Map();
  [...existing, ...incoming].forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const id = safeText(item.id || item.setupId || item.versionId) || stableId('setup_version', item);
    const prev = byKey.get(id);
    if (!prev || versionSortMs(item) >= versionSortMs(prev)) byKey.set(id, item);
  });
  return Array.from(byKey.values())
    .sort((a, b) => versionSortMs(b) - versionSortMs(a))
    .slice(0, 10);
}

function latestByCombo(historiesByKey) {
  const latest = [];
  historiesByKey.forEach((history) => {
    if (Array.isArray(history) && history[0]) latest.push(history[0]);
  });
  return latest.sort((a, b) => versionSortMs(b) - versionSortMs(a));
}

async function collectRawSetupsFromStorage() {
  const keys = await AsyncStorage.getAllKeys();
  const dynamicKeys = keys.filter((key) => DYNAMIC_HISTORY_PREFIXES.some((prefix) => String(key).startsWith(prefix)));
  const wanted = Array.from(new Set([...LEGACY_SETUP_KEYS, ...LEGACY_HISTORY_KEYS, ...dynamicKeys]));
  const pairs = await AsyncStorage.multiGet(wanted);
  const items = [];

  pairs.forEach(([key, raw]) => {
    if (!raw) return;
    const arr = parseMaybeArrayRaw(raw);
    arr.forEach((item) => {
      if (item && typeof item === 'object') items.push({ ...item, _legacyStorageKey: key });
    });
  });

  return items;
}

export async function migrateSetupsFromLegacyStorage({ reason = 'setup-migration', markDirty = false } = {}) {
  const changedKeys = new Set();
  const notes = [];

  const [vehiclesRaw, tracksRaw, currentSetupsRaw, rawItems] = await Promise.all([
    readJson(VEHICLES_KEY, []),
    readJson(TRACKS_KEY, []),
    readJson(SETUPS_KEY, []),
    collectRawSetupsFromStorage(),
  ]);

  const vehicles = Array.isArray(vehiclesRaw) ? [...vehiclesRaw] : [];
  const tracks = Array.isArray(tracksRaw) ? [...tracksRaw] : [];
  const currentSetups = Array.isArray(currentSetupsRaw) ? currentSetupsRaw : [];
  const vehicleMap = new Map(vehicles.map((item) => [String(getEntityId(item)), item]));
  const trackMap = new Map(tracks.map((item) => [String(getEntityId(item)), item]));
  const historiesByKey = new Map();

  // Seed current setup list first so migration never hides new-format saved setups.
  currentSetups.forEach((setup) => {
    const normalized = normalizeVersion(setup, { vehicles, tracks, vehicleMap, trackMap, sourceKey: SETUPS_KEY });
    if (!normalized?.vehicleId || !normalized?.trackId) return;
    const key = makeSetupKey(normalized.vehicleId, normalized.trackId);
    historiesByKey.set(key, mergeVersions(historiesByKey.get(key) || [], [normalized]));
  });

  rawItems.forEach((raw) => {
    const sourceKey = raw._legacyStorageKey || raw._legacyBucketKey || 'legacy-setup';
    const normalized = normalizeVersion(raw, { vehicles, tracks, vehicleMap, trackMap, sourceKey });
    if (!normalized?.vehicleId || !normalized?.trackId) return;
    const key = makeSetupKey(normalized.vehicleId, normalized.trackId);
    historiesByKey.set(key, mergeVersions(historiesByKey.get(key) || [], [normalized]));
  });

  if (!historiesByKey.size) {
    return { changed: false, changedKeys: [], migratedSetups: 0, reason, notes: ['no-setup-data-found'] };
  }

  await writeJsonIfChanged(VEHICLES_KEY, vehicles, changedKeys);
  await writeJsonIfChanged(TRACKS_KEY, tracks, changedKeys);

  for (const [comboKey, history] of historiesByKey.entries()) {
    const historyKey = `@setupHistory_${comboKey}`;
    await writeJsonIfChanged(historyKey, history, changedKeys);
  }

  const latestSetups = latestByCombo(historiesByKey);
  await writeJsonIfChanged(SETUPS_KEY, latestSetups, changedKeys);

  const lastViewed = await readJson(LAST_VIEWED_SETUP_KEY, null);
  if (!lastViewed?.vehicleId && latestSetups[0]) {
    const latest = latestSetups[0];
    await writeJsonIfChanged(LAST_VIEWED_SETUP_KEY, {
      setupId: latest.id || latest.setupId,
      vehicleId: latest.vehicleId,
      trackId: latest.trackId,
      vehicleName: latest.vehicleName,
      trackName: latest.trackName,
      savedAt: latest.savedAt || latest.updatedAt,
    }, changedKeys);
  }

  if (changedKeys.size) {
    notes.push(`migrated:${latestSetups.length}:latest-setups`);
    notes.push(`historyKeys:${historiesByKey.size}`);
    const log = {
      version: SETUPS_MIGRATION_VERSION,
      migratedAt: new Date().toISOString(),
      reason,
      changedKeys: Array.from(changedKeys),
      migratedSetups: latestSetups.length,
      historyKeys: historiesByKey.size,
      markDirty,
    };
    await AsyncStorage.setItem(SETUPS_MIGRATION_LOG_KEY, JSON.stringify(log));
  }

  return {
    changed: changedKeys.size > 0,
    changedKeys: Array.from(changedKeys),
    migratedSetups: latestSetups.length,
    historyKeys: historiesByKey.size,
    reason,
    notes,
  };
}

export async function getLastSetupsMigrationLog() {
  return readJson(SETUPS_MIGRATION_LOG_KEY, null);
}
