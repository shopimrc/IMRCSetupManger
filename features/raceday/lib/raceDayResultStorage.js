import AsyncStorage from '@react-native-async-storage/async-storage';
import * as cloudSync from '../../../app/services/cloudSync';
import { raceDayRunsKey, normalizeId } from './raceDayModel';

async function markRaceDayResultCloudDirty(reason = 'raceday-results', keys = []) {
  const markCloudDirty = cloudSync?.markCloudDirty || cloudSync?.default?.markCloudDirty;
  if (typeof markCloudDirty !== 'function') return;
  try {
    await markCloudDirty({ reason, keys });
  } catch (error) {
    try { await markCloudDirty({ reason }); } catch {}
  }
}

async function getJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`[RaceDayResultStorage] Failed to read ${key}`, error);
    return fallback;
  }
}

async function setJson(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getRaceDayRuns(raceDayId) {
  const runs = await getJson(raceDayRunsKey(raceDayId), []);
  return Array.isArray(runs) ? runs : [];
}

export async function saveRaceDayRuns(raceDayId, runs = []) {
  const sorted = [...runs].sort((a, b) => String(b.syncedAt || b.createdAt || '').localeCompare(String(a.syncedAt || a.createdAt || '')));
  const key = raceDayRunsKey(raceDayId);
  await setJson(key, sorted);
  await markRaceDayResultCloudDirty('raceday-runs-saved', [key]);
  return sorted;
}

export async function addRaceDayRun(raceDayId, run) {
  const runs = await getRaceDayRuns(raceDayId);
  const nextRun = {
    id: run.id || `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    ...run,
  };
  const next = [nextRun, ...runs];
  await saveRaceDayRuns(raceDayId, next);
  return nextRun;
}

export async function addRaceDayRuns(raceDayId, newRuns = []) {
  const existing = await getRaceDayRuns(raceDayId);
  const byKey = new Map();

  [...newRuns, ...existing].forEach((run) => {
    const key = [run.vehicleId, run.eventUrl, run.roundLabel, run.raceUrl, run.resultType].map((x) => normalizeId(x)).join('|');
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: run.id || `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        ...run,
      });
    }
  });

  const next = Array.from(byKey.values());
  await saveRaceDayRuns(raceDayId, next);
  return next;
}

export function getRunsForVehicleFromList(runs = [], vehicleId) {
  const id = normalizeId(vehicleId);
  return (Array.isArray(runs) ? runs : []).filter((run) => normalizeId(run.vehicleId) === id);
}

export async function getRunsForVehicle(raceDayId, vehicleId) {
  const runs = await getRaceDayRuns(raceDayId);
  return getRunsForVehicleFromList(runs, vehicleId);
}

export function getLatestRunForVehicle(runs = [], vehicleId) {
  return getRunsForVehicleFromList(runs, vehicleId)[0] || null;
}
