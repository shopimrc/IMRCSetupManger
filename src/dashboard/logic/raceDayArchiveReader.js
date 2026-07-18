// src/dashboard/logic/raceDayArchiveReader.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const ARCHIVE_INDEX_KEY = '@raceDayArchiveIndex_v1';
const HISTORY_KEY = '@raceDayHistory_v1';
const SESSIONS_KEY = '@raceDaySessions_v1';
const SETUPS_KEY = '@setups';

const NOTES_PREFIX = '@raceDayNotes_';
const SETUP_CHANGES_PREFIX = '@raceDaySetupChanges_';
const LEGACY_CHANGES_PREFIX = '@raceDayChanges_';
const RUNS_PREFIX = '@raceDayRuns_';

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function keySafe(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function pickId(item) {
  return String(item?.id || item?.raceDayId || item?.sessionId || '').trim();
}

function sortMs(item) {
  return Number(
    item?.endedAtMs ||
    item?.updatedAtMs ||
    item?.startedAtMs ||
    item?.createdAtMs ||
    Date.parse(item?.endedAt || item?.updatedAt || item?.startedAt || item?.createdAt || '') ||
    0
  ) || 0;
}

function trackIdOf(item) {
  return String(item?.trackId || item?.track?.id || item?.track?.trackId || '__unknown__').trim() || '__unknown__';
}

function trackNameOf(item) {
  return String(item?.trackName || item?.track?.name || item?.track?.trackName || item?.trackLabel || '').trim();
}

function eventNameOf(item) {
  return String(
    item?.eventName ||
    item?.eventTitle ||
    item?.selectedEventName ||
    item?.selectedEventTitle ||
    item?.liveRcEventName ||
    item?.liveRcEventTitle ||
    item?.raceEventName ||
    ''
  ).trim();
}

function getVehicleIds(session) {
  const ids = session?.vehicleIds || session?.selectedVehicleIds || session?.carIds || session?.vehicles;
  if (!Array.isArray(ids)) return [];
  return ids.map((v) => String(v?.id || v?.vehicleId || v || '').trim()).filter(Boolean);
}

function valueAt(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

function textValue(v) {
  if (v === null || v === undefined || v === '') return '--';
  return String(v);
}

function normalizeNote(note, idx) {
  if (typeof note === 'string') return { id: `note-${idx}`, text: note, createdAtMs: 0 };
  const notesText = note?.notes;
  return {
    ...note,
    id: note?.id || note?.noteId || `note-${idx}`,
    text: note?.text || note?.note || note?.body || note?.message || (typeof notesText === 'string' ? notesText : ''),
    createdAtMs: Number(note?.createdAtMs || note?.ts || note?.timeMs || Date.parse(note?.createdAt || note?.updatedAt || '') || 0) || 0,
  };
}

function normalizeChange(change, idx) {
  const before = change?.beforeValue ?? change?.oldValue ?? change?.fromValue ?? change?.fromV ?? change?.from;
  const after = change?.afterValue ?? change?.newValue ?? change?.toValue ?? change?.toV ?? change?.to;

  return {
    ...change,
    id: change?.id || change?.changeId || `change-${idx}`,
    vehicleId: change?.vehicleId || '',
    vehicleName: change?.vehicleName || change?.car || change?.carName || change?.setupName || 'Unknown Vehicle',
    trackId: change?.trackId || '',
    setupId: change?.setupId || '',
    fieldPath: change?.fieldPath || change?.field || change?.path || '',
    fieldLabel: change?.fieldLabel || change?.label || change?.what || change?.fieldPath || change?.field || change?.path || 'Change',
    beforeValue: textValue(before),
    afterValue: textValue(after),
    createdAtMs: Number(change?.createdAtMs || change?.ts || change?.timeMs || Date.parse(change?.createdAt || '') || 0) || 0,
  };
}

function normalizeRun(run, idx) {
  return {
    ...run,
    id: run?.id || run?.runId || run?.raceId || `run-${idx}`,
    className: run?.className || run?.class || run?.raceClass || '',
    round: run?.round || run?.roundName || run?.raceName || run?.name || '',
    position: run?.position || run?.pos || '',
    laps: run?.laps || run?.lapCount || '',
    time: run?.time || run?.totalTime || run?.lapsTime || '',
    fastLap: run?.fastLap || run?.fastestLap || '',
  };
}

async function readAllSetups() {
  const raw = await AsyncStorage.getItem(SETUPS_KEY);
  return asArray(safeParse(raw, []));
}

async function readArrayFromKeys(keys = []) {
  for (const key of keys) {
    const raw = await AsyncStorage.getItem(key);
    const parsed = safeParse(raw, null);
    const arr = asArray(parsed);
    if (arr.length) return arr;
  }
  return [];
}

function findCurrentSetup({ setups, session, change }) {
  const vehicleId = String(change?.vehicleId || session?.vehicleId || '').trim();
  const trackId = String(change?.trackId || session?.trackId || session?.track?.id || '').trim();
  const setupId = String(change?.setupId || session?.setupId || '').trim();

  return setups.find((s) => {
    const sid = String(s?.id || s?.setupId || '').trim();
    const vid = String(s?.vehicleId || s?.carId || '').trim();
    const tid = String(s?.trackId || '').trim();

    if (setupId && sid === setupId) return true;
    if (vehicleId && trackId && vid === vehicleId && tid === trackId) return true;
    if (vehicleId && vid === vehicleId && !trackId) return true;
    return false;
  }) || null;
}

function buildSetupComparisons({ session, changes, setups }) {
  return changes
    .map((change) => {
      const currentSetup = findCurrentSetup({ setups, session, change });
      const currentValue = currentSetup && change.fieldPath ? valueAt(currentSetup, change.fieldPath) : undefined;
      const eventValue = change.afterValue;
      const changed = currentValue !== undefined && textValue(currentValue) !== textValue(eventValue);

      return {
        id: change.id,
        vehicleName: change.vehicleName,
        fieldLabel: change.fieldLabel,
        fieldPath: change.fieldPath,
        eventValue: textValue(eventValue),
        currentValue: textValue(currentValue),
        changed,
      };
    })
    .filter((row) => row.fieldPath || row.fieldLabel);
}

export async function getRaceDayArchiveIndex() {
  const [indexRaw, historyRaw, sessionsRaw] = await Promise.all([
    AsyncStorage.getItem(ARCHIVE_INDEX_KEY),
    AsyncStorage.getItem(HISTORY_KEY),
    AsyncStorage.getItem(SESSIONS_KEY),
  ]);

  const index = asArray(safeParse(indexRaw, []));
  const history = asArray(safeParse(historyRaw, []));
  const sessions = asArray(safeParse(sessionsRaw, [])).filter((s) => {
    const status = String(s?.status || '').toLowerCase();
    return status === 'ended' || !!s?.endedAtMs || !!s?.endedAt;
  });

  const byId = new Map();

  [...index, ...history, ...sessions].forEach((item) => {
    const id = pickId(item);
    if (!id) return;

    const normalized = {
      ...item,
      id,
      raceDayId: id,
      sessionId: id,
      status: String(item?.status || 'ended').toLowerCase() === 'active' ? 'ended' : (item?.status || 'ended'),
    };

    const prev = byId.get(id);
    if (!prev || sortMs(normalized) >= sortMs(prev)) byId.set(id, normalized);
  });

  return Array.from(byId.values()).sort((a, b) => sortMs(b) - sortMs(a));
}

export async function getArchivedRaceDaySession(raceDayId) {
  const id = String(raceDayId || '').trim();
  if (!id) return null;
  const safeId = keySafe(id);

  const archiveRaw = await AsyncStorage.getItem(`@raceDayArchive_${safeId}`);
  const archive = safeParse(archiveRaw, null);
  if (archive && typeof archive === 'object') return { ...archive, id: pickId(archive) || id };

  const [historyRaw, sessionsRaw] = await Promise.all([
    AsyncStorage.getItem(HISTORY_KEY),
    AsyncStorage.getItem(SESSIONS_KEY),
  ]);

  const history = asArray(safeParse(historyRaw, []));
  const sessions = asArray(safeParse(sessionsRaw, []));
  const found = [...history, ...sessions].find((s) => pickId(s) === id || pickId(s) === safeId);
  return found ? { ...found, id: pickId(found) || id, raceDayId: pickId(found) || id, sessionId: pickId(found) || id } : null;
}

export async function getArchivedRaceDayRuns(raceDayId) {
  const id = keySafe(raceDayId);
  const rows = await readArrayFromKeys([
    `${RUNS_PREFIX}${id}`,
    `@raceDayResults_${id}`,
  ]);
  return rows.map(normalizeRun);
}

export async function getArchivedRaceDayNotes(raceDayId) {
  const id = keySafe(raceDayId);
  const raw = await AsyncStorage.getItem(`${NOTES_PREFIX}${id}`);
  const parsed = safeParse(raw, null);

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const normalized = normalizeNote(parsed, 0);
    return normalized.text ? [normalized] : [];
  }

  return asArray(parsed).map(normalizeNote).filter((n) => n.text);
}

export async function getArchivedRaceDayChanges(raceDayId) {
  const id = keySafe(raceDayId);
  const rows = await readArrayFromKeys([
    `${SETUP_CHANGES_PREFIX}${id}`,
    `${LEGACY_CHANGES_PREFIX}${id}`,
  ]);
  return rows.map(normalizeChange);
}

export async function getArchivedRaceDayBundle(raceDayId) {
  const [session, runs, notes, changes, setups] = await Promise.all([
    getArchivedRaceDaySession(raceDayId),
    getArchivedRaceDayRuns(raceDayId),
    getArchivedRaceDayNotes(raceDayId),
    getArchivedRaceDayChanges(raceDayId),
    readAllSetups(),
  ]);

  const comparisons = buildSetupComparisons({ session: session || {}, changes, setups });

  return {
    id: String(raceDayId || '').trim(),
    session,
    runs,
    notes,
    changes,
    comparisons,
  };
}

export async function buildRaceDayArchiveTrackGroups(trackNameMap = {}) {
  const index = await getRaceDayArchiveIndex();
  const groups = new Map();

  index.forEach((session) => {
    const id = pickId(session);
    if (!id) return;

    const trackId = trackIdOf(session);
    const trackName =
      trackNameOf(session) ||
      trackNameMap?.[trackId] ||
      (trackId === '__unknown__' ? 'Unknown Track' : trackId);

    if (!groups.has(trackId)) {
      groups.set(trackId, { trackId, trackLabel: trackName, sessions: [], latestMs: 0 });
    }

    const vehicleIds = getVehicleIds(session);
    const summary = {
      ...session,
      id,
      raceDayId: id,
      sessionId: id,
      trackId,
      trackName,
      eventName: eventNameOf(session),
      vehicleIds,
      vehicleCount: Number(session?.vehicleCount || vehicleIds.length || 0) || 0,
      notesCount: Number(session?.notesCount || session?.noteCount || 0) || 0,
      changesCount: Number(session?.changesCount || session?.setupChangesCount || session?.setupChangeCount || 0) || 0,
      runsCount: Number(session?.runsCount || session?.raceRunsCount || session?.resultsCount || 0) || 0,
      startedAtMs: Number(session?.startedAtMs || Date.parse(session?.startedAt || '') || 0) || 0,
      endedAtMs: Number(session?.endedAtMs || Date.parse(session?.endedAt || '') || 0) || 0,
      updatedAtMs: sortMs(session),
    };

    const group = groups.get(trackId);
    group.sessions.push(summary);
    group.latestMs = Math.max(group.latestMs, summary.updatedAtMs);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      sessions: group.sessions.sort((a, b) => sortMs(b) - sortMs(a)),
    }))
    .sort((a, b) => Number(b.latestMs || 0) - Number(a.latestMs || 0));
}
