import AsyncStorage from '@react-native-async-storage/async-storage';
import * as cloudSync from '../../../app/services/cloudSync';

const LINEUP_KEY_PREFIX = '@raceDayLineups_';

async function markRaceDayLineupCloudDirty(reason = 'raceday-lineups', keys = []) {
  const markCloudDirty = cloudSync?.markCloudDirty || cloudSync?.default?.markCloudDirty;
  if (typeof markCloudDirty !== 'function') return;
  try {
    await markCloudDirty({ reason, keys });
  } catch (error) {
    try { await markCloudDirty({ reason }); } catch {}
  }
}

function getRaceDayId(raceDayOrId) {
  if (!raceDayOrId) return '';
  if (typeof raceDayOrId === 'string') return raceDayOrId;
  return String(raceDayOrId.id || raceDayOrId.raceDayId || raceDayOrId.startedAt || '').trim();
}

function getLineupKey(raceDayOrId) {
  const raceDayId = getRaceDayId(raceDayOrId);
  return raceDayId ? `${LINEUP_KEY_PREFIX}${raceDayId}` : '';
}

async function getJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[RaceDayLineupStorage] Failed to read ${key}`, error);
    return fallback;
  }
}

async function setJson(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getRaceDayLineups(raceDayOrId) {
  const key = getLineupKey(raceDayOrId);
  if (!key) return [];
  const lineups = await getJson(key, []);
  return Array.isArray(lineups) ? lineups : [];
}

export async function saveRaceDayLineups(raceDayOrId, lineups = []) {
  const key = getLineupKey(raceDayOrId);
  if (!key) return [];
  const cleanLineups = Array.isArray(lineups) ? lineups.filter(Boolean) : [];
  await setJson(key, cleanLineups);
  await markRaceDayLineupCloudDirty('raceday-lineups-saved', [key]);
  return cleanLineups;
}

export async function mergeRaceDayLineups(raceDayOrId, lineups = []) {
  const existing = await getRaceDayLineups(raceDayOrId);
  const byVehicle = new Map(existing.map((lineup) => [String(lineup.vehicleId || ''), lineup]));

  for (const lineup of Array.isArray(lineups) ? lineups : []) {
    const vehicleId = String(lineup?.vehicleId || '').trim();
    if (!vehicleId) continue;
    byVehicle.set(vehicleId, {
      ...(byVehicle.get(vehicleId) || {}),
      ...lineup,
      updatedAt: lineup.updatedAt || new Date().toISOString(),
    });
  }

  return saveRaceDayLineups(raceDayOrId, Array.from(byVehicle.values()));
}

export async function getRaceDayLineupForVehicle(raceDayOrId, vehicleId) {
  const id = String(vehicleId || '').trim();
  if (!id) return null;
  const lineups = await getRaceDayLineups(raceDayOrId);
  return lineups.find((lineup) => String(lineup.vehicleId || '') === id) || null;
}

export function getRaceDayLineupKey(raceDayOrId) {
  return getLineupKey(raceDayOrId);
}
