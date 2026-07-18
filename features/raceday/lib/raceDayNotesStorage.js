import AsyncStorage from '@react-native-async-storage/async-storage';
import * as cloudSync from '../../../app/services/cloudSync';
import { appendRaceDayRecentChange, cleanFieldLabel } from './raceDayRecentChanges';
import { normalizeId } from './raceDayModel';

const NOTES_PREFIX = '@raceDayNotes_';
const SETUP_CHANGES_PREFIX = '@raceDaySetupChanges_';
const HISTORY_KEY = '@raceDayHistory_v1';
const NOTES_INDEX_KEY = '@raceDayNotesIndex_v1';
const MAX_SESSION_CHANGES = 500;
const MAX_HISTORY = 500;
const MAX_EVENTS_PER_TRACK = 3;


async function markRaceDayArchiveCloudDirty(reason = 'raceday-archive', keys = []) {
  const markCloudDirty = cloudSync?.markCloudDirty || cloudSync?.default?.markCloudDirty;
  if (typeof markCloudDirty !== 'function') return;
  try {
    await markCloudDirty({ reason, keys });
  } catch (error) {
    try { await markCloudDirty({ reason }); } catch {}
  }
}

function keySafe(value) {
  return String(value || 'active').replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function raceDayNotesKey(raceDayId) {
  return `${NOTES_PREFIX}${keySafe(raceDayId)}`;
}

export function raceDaySetupChangesKey(raceDayId) {
  return `${SETUP_CHANGES_PREFIX}${keySafe(raceDayId)}`;
}

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (error) {
    console.warn(`[RaceDayNotesStorage] Failed to read ${key}`, error);
    return fallback;
  }
}

async function writeJson(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function makeChangeId(change = {}) {
  const parts = [
    change.raceDayId,
    change.vehicleId,
    change.setupId,
    change.fieldPath,
    change.createdAt,
    Math.random().toString(36).slice(2, 8),
  ];
  return parts.filter(Boolean).join('_').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function normalizeChange(change = {}, raceDayId) {
  const createdAt = change.createdAt || new Date().toISOString();
  const fieldPath = change.fieldPath || change.path || '';
  const fieldLabel = change.fieldLabel || cleanFieldLabel(fieldPath) || 'Setup Change';

  return {
    id: change.id || makeChangeId({ ...change, raceDayId, createdAt }),
    raceDayId,
    createdAt,
    source: change.source || 'setup',
    vehicleId: normalizeId(change.vehicleId),
    vehicleName: change.vehicleName || '',
    trackId: normalizeId(change.trackId),
    setupId: normalizeId(change.setupId),
    setupName: change.setupName || change.name || '',
    fieldPath,
    fieldLabel,
    oldValue: change.oldValue,
    newValue: change.newValue,
    note: change.note || '',
  };
}

function groupByVehicle(changes = []) {
  return changes.reduce((acc, change) => {
    const key = normalizeId(change.vehicleId) || 'unknown';
    if (!acc[key]) {
      acc[key] = {
        vehicleId: key,
        vehicleName: change.vehicleName || 'Vehicle',
        changes: [],
      };
    }
    if (change.vehicleName && acc[key].vehicleName === 'Vehicle') acc[key].vehicleName = change.vehicleName;
    acc[key].changes.push(change);
    return acc;
  }, {});
}


function historySortMs(item = {}) {
  return Number(
    item.endedAtMs ||
    item.updatedAtMs ||
    item.startedAtMs ||
    Date.parse(item.endedAt || item.updatedAt || item.startedAt || '') ||
    0
  ) || 0;
}

function historyTrackKey(item = {}) {
  return normalizeId(item.trackId) || '__unknown__';
}

function pruneHistoryPerTrack(history = []) {
  const source = Array.isArray(history) ? history : [];
  const byTrack = new Map();

  source.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const key = historyTrackKey(item);
    if (!byTrack.has(key)) byTrack.set(key, []);
    byTrack.get(key).push(item);
  });

  const kept = [];

  byTrack.forEach((items) => {
    const sorted = [...items].sort((a, b) => historySortMs(b) - historySortMs(a));
    kept.push(...sorted.slice(0, MAX_EVENTS_PER_TRACK));
  });

  return kept
    .sort((a, b) => historySortMs(b) - historySortMs(a))
    .slice(0, MAX_HISTORY);
}

function collectRaceDayIds(history = []) {
  return new Set(
    (Array.isArray(history) ? history : [])
      .map((item) => keySafe(item?.raceDayId || item?.id || item?.sessionId))
      .filter(Boolean)
  );
}

async function purgeArchivedRaceDayData(removedEntries = []) {
  const ids = collectRaceDayIds(removedEntries);
  if (!ids.size) return [];

  const keys = [];
  ids.forEach((id) => {
    keys.push(raceDayNotesKey(id));
    keys.push(raceDaySetupChangesKey(id));
    keys.push(`@raceDayRuns_${id}`);
    keys.push(`@raceDayChanges_${id}`);
    keys.push(`@raceDayArchive_${id}`);
    keys.push(`@raceDayResults_${id}`);
    keys.push(`@raceDayLineups_${id}`);
    keys.push(`@raceDayPractice_${id}`);
    keys.push(`@raceDayPracticeSelectedDay_${id}`);
  });

  try {
    await AsyncStorage.multiRemove(keys);
  } catch (error) {
    console.warn('[RaceDayNotesStorage] Failed to purge old RaceDay archive data', error);
  }

  return keys;
}

async function pruneNotesIndexToHistory(history = []) {
  const keepIds = collectRaceDayIds(history);
  const existing = await readJson(NOTES_INDEX_KEY, []);
  const next = (Array.isArray(existing) ? existing : [])
    .filter((item) => keepIds.has(keySafe(item?.raceDayId)))
    .slice(0, MAX_HISTORY);

  await writeJson(NOTES_INDEX_KEY, next);
  return next;
}

async function updateNotesIndex(entry) {
  const existing = await readJson(NOTES_INDEX_KEY, []);
  const nextEntry = {
    raceDayId: entry.raceDayId,
    trackId: entry.trackId || '',
    trackName: entry.trackName || '',
    startedAt: entry.startedAt || '',
    updatedAt: new Date().toISOString(),
  };
  const next = [nextEntry, ...existing.filter((item) => item.raceDayId !== nextEntry.raceDayId)].slice(0, MAX_HISTORY);
  await writeJson(NOTES_INDEX_KEY, next);
  return next;
}

export async function getRaceDayNotes(raceDayId) {
  const id = keySafe(raceDayId);
  const value = await readJson(raceDayNotesKey(id), null);
  if (value && typeof value === 'object') {
    return {
      raceDayId: id,
      notes: value.notes || '',
      createdAt: value.createdAt || null,
      updatedAt: value.updatedAt || null,
      ...value,
    };
  }
  return {
    raceDayId: id,
    notes: typeof value === 'string' ? value : '',
    createdAt: null,
    updatedAt: null,
  };
}

export async function saveRaceDayNotes(raceDayId, notes, meta = {}) {
  const id = keySafe(raceDayId);
  const existing = await getRaceDayNotes(id);
  const now = new Date().toISOString();
  const next = {
    ...existing,
    ...meta,
    raceDayId: id,
    notes: String(notes || ''),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
  await writeJson(raceDayNotesKey(id), next);
  await updateNotesIndex(next);
  await markRaceDayArchiveCloudDirty('raceday-notes-saved', [raceDayNotesKey(id), NOTES_INDEX_KEY]);
  return next;
}

export async function getRaceDaySetupChanges(raceDayId) {
  const id = keySafe(raceDayId);
  const value = await readJson(raceDaySetupChangesKey(id), []);
  return Array.isArray(value) ? value : [];
}

export async function appendRaceDaySetupChanges(raceDayId, changes = []) {
  const id = keySafe(raceDayId);
  const list = Array.isArray(changes) ? changes : [changes];
  const normalized = list
    .filter(Boolean)
    .map((change) => normalizeChange(change, id));

  if (!normalized.length) return getRaceDaySetupChanges(id);

  const existing = await getRaceDaySetupChanges(id);
  const next = [...normalized, ...existing].slice(0, MAX_SESSION_CHANGES);
  await writeJson(raceDaySetupChangesKey(id), next);

  await Promise.all(normalized.map((change) => appendRaceDayRecentChange({
    raceDayId: id,
    vehicleId: change.vehicleId,
    vehicleName: change.vehicleName,
    trackId: change.trackId,
    setupId: change.setupId,
    setupName: change.setupName,
    fieldPath: change.fieldPath,
    fieldLabel: change.fieldLabel,
    oldValue: change.oldValue,
    newValue: change.newValue,
    note: change.note,
    source: 'setup',
  })));

  await markRaceDayArchiveCloudDirty('raceday-setup-changes-saved', [raceDaySetupChangesKey(id), '@recentChanges_v1']);
  return next;
}

export async function appendRaceDaySetupChange(raceDayId, change) {
  return appendRaceDaySetupChanges(raceDayId, [change]);
}

export async function getRaceDayNotesBundle(raceDayId) {
  const id = keySafe(raceDayId);
  const [notes, changes] = await Promise.all([
    getRaceDayNotes(id),
    getRaceDaySetupChanges(id),
  ]);
  return {
    raceDayId: id,
    notes,
    changes,
    changesByVehicle: groupByVehicle(changes),
  };
}

export async function archiveRaceDaySession(raceDay = {}, extra = {}) {
  const raceDayId = raceDay.id || raceDay.raceDayId;
  if (!raceDayId) return null;

  const id = keySafe(raceDayId);
  const [notes, changes] = await Promise.all([
    getRaceDayNotes(id),
    getRaceDaySetupChanges(id),
  ]);
  const now = new Date().toISOString();
  const entry = {
    raceDayId: id,
    trackId: raceDay.trackId || '',
    trackName: raceDay.trackName || raceDay.track?.name || '',
    vehicleIds: Array.isArray(raceDay.vehicleIds) ? raceDay.vehicleIds : [],
    eventUrl: raceDay.eventUrl || null,
    eventTitle: raceDay.eventTitle || raceDay.eventName || null,
    eventDateLabel: raceDay.eventDateLabel || raceDay.eventDate || null,
    startedAt: raceDay.startedAt || null,
    endedAt: now,
    notesKey: raceDayNotesKey(id),
    setupChangesKey: raceDaySetupChangesKey(id),
    noteCount: notes?.notes ? 1 : 0,
    setupChangeCount: changes.length,
    ...extra,
  };

  const existing = await readJson(HISTORY_KEY, []);
  const unpruned = [entry, ...existing.filter((item) => item.raceDayId !== id)];
  const next = pruneHistoryPerTrack(unpruned);
  const keepIds = collectRaceDayIds(next);
  const removed = unpruned.filter((item) => !keepIds.has(keySafe(item?.raceDayId || item?.id || item?.sessionId)));

  await writeJson(HISTORY_KEY, next);
  await updateNotesIndex(entry);
  await pruneNotesIndexToHistory(next);
  const purgedKeys = await purgeArchivedRaceDayData(removed);
  await markRaceDayArchiveCloudDirty('raceday-archived', [HISTORY_KEY, NOTES_INDEX_KEY, raceDayNotesKey(id), raceDaySetupChangesKey(id), ...purgedKeys]);

  return entry;
}

export async function getRaceDayHistory() {
  const value = await readJson(HISTORY_KEY, []);
  return Array.isArray(value) ? value : [];
}
