import AsyncStorage from '@react-native-async-storage/async-storage';
import * as cloudSync from '../../../app/services/cloudSync';
import { RACE_DAY_KEYS } from './raceDayModel';

const COALESCE_MS = 30 * 1000;

async function markRaceDayRecentChangesCloudDirty(reason = 'raceday-recent-changes', keys = []) {
  const markCloudDirty = cloudSync?.markCloudDirty || cloudSync?.default?.markCloudDirty;
  if (typeof markCloudDirty !== 'function') return;
  try {
    await markCloudDirty({ reason, keys });
  } catch (error) {
    try { await markCloudDirty({ reason }); } catch {}
  }
}

export async function readRecentChanges() {
  try {
    const raw = await AsyncStorage.getItem(RACE_DAY_KEYS.RECENT_CHANGES);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendRaceDayRecentChange(change) {
  const existing = await readRecentChanges();
  const now = Date.now();
  const nextChange = {
    ts: now,
    source: 'raceday',
    ...change,
  };

  const withoutDuplicate = existing.filter((item) => {
    const sameField = item.vehicleId === nextChange.vehicleId && item.fieldPath === nextChange.fieldPath;
    const close = Math.abs(Number(item.ts || 0) - now) <= COALESCE_MS;
    return !(sameField && close);
  });

  const next = [nextChange, ...withoutDuplicate].slice(0, 50);
  await AsyncStorage.setItem(RACE_DAY_KEYS.RECENT_CHANGES, JSON.stringify(next));
  await markRaceDayRecentChangesCloudDirty('raceday-recent-change-added', [RACE_DAY_KEYS.RECENT_CHANGES]);
  return next;
}

export function cleanFieldLabel(fieldPath = '') {
  return String(fieldPath).replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function getRaceDayRecentChanges({ raceDayId, vehicleId } = {}) {
  const items = await readRecentChanges();
  return items.filter((item) => {
    if (raceDayId && item.raceDayId !== raceDayId) return false;
    if (vehicleId && String(item.vehicleId || '') !== String(vehicleId)) return false;
    return true;
  });
}
