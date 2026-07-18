import { getActiveRaceDay } from './raceDayStorage';
import { appendRaceDaySetupChanges } from './raceDayNotesStorage';
import { cleanFieldLabel } from './raceDayRecentChanges';
import { getVehicleDisplayName, normalizeId, normalizeIdList } from './raceDayModel';

const IGNORED_FIELD_NAMES = new Set([
  'id',
  'setupId',
  'vehicleId',
  'trackId',
  'createdAt',
  'updatedAt',
  'savedAt',
  'lastSavedAt',
  'syncedAt',
  'dirty',
  'isDirty',
  'deletedAt',
]);

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function stableValue(value) {
  if (value === undefined) return '';
  if (value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function displayValue(value) {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function shouldIgnorePath(path = '') {
  const parts = String(path).split('.').filter(Boolean);
  const last = parts[parts.length - 1];
  return IGNORED_FIELD_NAMES.has(last);
}

function collectDiffs(before = {}, after = {}, path = '', depth = 0, out = []) {
  if (depth > 6) return out;

  const keys = new Set([
    ...Object.keys(isObject(before) ? before : {}),
    ...Object.keys(isObject(after) ? after : {}),
  ]);

  keys.forEach((key) => {
    const nextPath = path ? `${path}.${key}` : key;
    if (shouldIgnorePath(nextPath)) return;

    const oldValue = before ? before[key] : undefined;
    const newValue = after ? after[key] : undefined;

    if (isObject(oldValue) && isObject(newValue)) {
      collectDiffs(oldValue, newValue, nextPath, depth + 1, out);
      return;
    }

    if (stableValue(oldValue) === stableValue(newValue)) return;

    out.push({
      fieldPath: nextPath,
      fieldLabel: cleanFieldLabel(nextPath),
      oldValue: displayValue(oldValue),
      newValue: displayValue(newValue),
    });
  });

  return out;
}

function getSetupVehicleId(setup = {}, fallback = '') {
  return normalizeId(
    fallback ||
    setup.vehicleId ||
    setup.carId ||
    setup.vehicle?.id ||
    setup.vehicle?.vehicleId ||
    setup.profile?.vehicleId ||
    '',
  );
}

function getSetupTrackId(setup = {}, fallback = '') {
  return normalizeId(
    fallback ||
    setup.trackId ||
    setup.track?.id ||
    setup.track?.trackId ||
    setup.profile?.trackId ||
    '',
  );
}

function getSetupName(setup = {}, fallback = '') {
  return fallback || setup.setupName || setup.name || setup.title || setup.versionName || 'Setup';
}

function isVehicleInActiveRaceDay(active = {}, vehicleId = '') {
  const id = normalizeId(vehicleId);
  if (!id) return false;
  const ids = new Set(normalizeIdList(active.vehicleIds || []));
  return ids.has(id);
}

function isTrackInActiveRaceDay(active = {}, trackId = '') {
  const id = normalizeId(trackId);
  if (!id || !active?.trackId) return true;
  return normalizeId(active.trackId) === id;
}

export function diffRaceDaySetupChanges(beforeSetup = {}, afterSetup = {}) {
  return collectDiffs(beforeSetup || {}, afterSetup || {});
}

export async function recordRaceDaySetupChanges({
  beforeSetup = {},
  afterSetup = {},
  vehicle,
  vehicleId,
  trackId,
  setupId,
  setupName,
  source = 'setup',
  note = '',
} = {}) {
  const active = await getActiveRaceDay();
  if (!active?.id && !active?.raceDayId) {
    return { recorded: false, reason: 'no-active-raceday', changes: [] };
  }

  const resolvedVehicleId = getSetupVehicleId(afterSetup, getSetupVehicleId(beforeSetup, vehicleId));
  const resolvedTrackId = getSetupTrackId(afterSetup, getSetupTrackId(beforeSetup, trackId));

  if (!isVehicleInActiveRaceDay(active, resolvedVehicleId)) {
    return { recorded: false, reason: 'vehicle-not-in-raceday', changes: [] };
  }

  if (!isTrackInActiveRaceDay(active, resolvedTrackId)) {
    return { recorded: false, reason: 'track-not-active-raceday', changes: [] };
  }

  const diffs = diffRaceDaySetupChanges(beforeSetup, afterSetup);
  if (!diffs.length) {
    return { recorded: false, reason: 'no-setup-changes', changes: [] };
  }

  const raceDayId = active.id || active.raceDayId;
  const resolvedSetupId = normalizeId(setupId || afterSetup.id || afterSetup.setupId || beforeSetup.id || beforeSetup.setupId || '');
  const resolvedSetupName = getSetupName(afterSetup, getSetupName(beforeSetup, setupName));
  const resolvedVehicleName = vehicle ? getVehicleDisplayName(vehicle) : (afterSetup.vehicleName || beforeSetup.vehicleName || 'Vehicle');

  const changes = diffs.map((diff) => ({
    ...diff,
    raceDayId,
    vehicleId: resolvedVehicleId,
    vehicleName: resolvedVehicleName,
    trackId: resolvedTrackId,
    setupId: resolvedSetupId,
    setupName: resolvedSetupName,
    source,
    note,
  }));

  const saved = await appendRaceDaySetupChanges(raceDayId, changes);
  return { recorded: true, reason: 'recorded', changes, saved };
}

export async function recordRaceDaySetupChange(change = {}) {
  const active = await getActiveRaceDay();
  if (!active?.id && !active?.raceDayId) {
    return { recorded: false, reason: 'no-active-raceday' };
  }

  const vehicleId = normalizeId(change.vehicleId);
  const trackId = normalizeId(change.trackId);

  if (!isVehicleInActiveRaceDay(active, vehicleId)) {
    return { recorded: false, reason: 'vehicle-not-in-raceday' };
  }

  if (!isTrackInActiveRaceDay(active, trackId)) {
    return { recorded: false, reason: 'track-not-active-raceday' };
  }

  const raceDayId = active.id || active.raceDayId;
  await appendRaceDaySetupChanges(raceDayId, [{ ...change, raceDayId }]);
  return { recorded: true, reason: 'recorded' };
}
