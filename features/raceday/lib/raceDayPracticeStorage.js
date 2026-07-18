import AsyncStorage from '@react-native-async-storage/async-storage';
import * as cloudSync from '../../../app/services/cloudSync';
import { normalizeId } from './raceDayModel';

const PRACTICE_PREFIX = '@raceDayPractice_';
const MAX_SESSIONS_PER_VEHICLE = 250;

async function markRaceDayPracticeCloudDirty(reason = 'raceday-practice', keys = []) {
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

export function raceDayPracticeKey(raceDayId) {
  return `${PRACTICE_PREFIX}${keySafe(raceDayId)}`;
}

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (error) {
    console.warn(`[RaceDayPracticeStorage] Failed to read ${key}`, error);
    return fallback;
  }
}

async function writeJson(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^0-9.:-]/g, '');
  if (!cleaned) return null;

  // mm:ss.mmm -> seconds
  if (cleaned.includes(':')) {
    const [minRaw, secRaw] = cleaned.split(':');
    const minutes = Number(minRaw || 0);
    const seconds = Number(secRaw || 0);
    if (Number.isFinite(minutes) && Number.isFinite(seconds)) return minutes * 60 + seconds;
  }

  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function compareLapValues(a, b) {
  const aNum = toNumber(a);
  const bNum = toNumber(b);
  if (aNum === null && bNum === null) return 0;
  if (aNum === null) return 1;
  if (bNum === null) return -1;
  return aNum - bNum;
}

function latestFirst(a = {}, b = {}) {
  const aTime = new Date(a.endedAt || a.startedAt || a.createdAt || 0).getTime();
  const bTime = new Date(b.endedAt || b.startedAt || b.createdAt || 0).getTime();
  return bTime - aTime;
}

function makePracticeSessionId(session = {}) {
  const parts = [
    session.raceDayId,
    session.vehicleId,
    session.startedAt,
    session.endedAt,
    session.source,
    Math.random().toString(36).slice(2, 8),
  ];
  return parts.filter(Boolean).join('_').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function pickMetric(session = {}, keys = []) {
  for (const key of keys) {
    const value = session[key] ?? session.stats?.[key] ?? session.result?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

export function normalizePracticeSession(session = {}, context = {}) {
  const raceDayId = keySafe(context.raceDayId || session.raceDayId);
  const vehicleId = normalizeId(context.vehicleId || session.vehicleId);
  const createdAt = session.createdAt || new Date().toISOString();
  const startedAt = session.startedAt || session.startTime || createdAt;
  const endedAt = session.endedAt || session.endTime || startedAt;
  const laps = Array.isArray(session.laps || session.stats?.laps) ? (session.laps || session.stats?.laps) : [];
  const lapCount = Number(session.lapCount || session.lapsCompleted || session.lapsCount || laps.length || 0) || 0;
  const practiceDayKey = session.practiceDayKey || session.dayKey || context.practiceDayKey || context.dayKey || '';
  const practiceDayLabel = session.practiceDayLabel || session.dayLabel || context.practiceDayLabel || context.dayLabel || practiceDayKey;

  const next = {
    ...session,
    id: session.id || session.sessionId || makePracticeSessionId({ ...session, raceDayId, vehicleId, startedAt, endedAt }),
    raceDayId,
    vehicleId,
    label: session.label || session.name || session.sessionName || '',
    source: session.source || 'manual',
    createdAt,
    startedAt,
    endedAt,
    lapCount,
    practiceDayKey,
    practiceDayLabel,
    practiceUrl: session.practiceUrl || context.practiceUrl || '',
    laps,
    fastLap: pickMetric(session, ['fastLap', 'fastestLap', 'bestLap']),
    avgLap: pickMetric(session, ['avgLap', 'averageLap']),
    top5Avg: pickMetric(session, ['top5Avg', 'avgTop5', 'top5Average']),
    top10Avg: pickMetric(session, ['top10Avg', 'avgTop10', 'top10Average']),
    top15Avg: pickMetric(session, ['top15Avg', 'avgTop15', 'top15Average']),
    consistency: pickMetric(session, ['consistency']),
    stdDeviation: pickMetric(session, ['stdDeviation', 'standardDeviation', 'stdDev']),
    totalTime: pickMetric(session, ['totalTime', 'time', 'lapsTime']),
    notes: session.notes || '',
  };

  next.stats = {
    ...(session.stats || {}),
    fastLap: next.fastLap,
    avgLap: next.avgLap,
    top5Avg: next.top5Avg,
    top10Avg: next.top10Avg,
    top15Avg: next.top15Avg,
    consistency: next.consistency,
    stdDeviation: next.stdDeviation,
    totalTime: next.totalTime,
    laps: next.laps,
  };

  return next;
}

function normalizeBundle(bundle = {}, raceDayId) {
  const id = keySafe(raceDayId || bundle.raceDayId);
  const vehicles = bundle.vehicles && typeof bundle.vehicles === 'object' ? bundle.vehicles : {};
  return {
    raceDayId: id,
    createdAt: bundle.createdAt || new Date().toISOString(),
    updatedAt: bundle.updatedAt || null,
    vehicles,
  };
}

export async function getRaceDayPractice(raceDayId) {
  const id = keySafe(raceDayId);
  const bundle = await readJson(raceDayPracticeKey(id), null);
  return normalizeBundle(bundle || { raceDayId: id }, id);
}

export async function saveRaceDayPractice(raceDayId, bundle = {}) {
  const id = keySafe(raceDayId);
  const next = normalizeBundle({ ...bundle, raceDayId: id }, id);
  next.updatedAt = new Date().toISOString();
  const key = raceDayPracticeKey(id);
  await writeJson(key, next);
  await markRaceDayPracticeCloudDirty('raceday-practice-saved', [key]);
  return next;
}

export async function getPracticeSessionsForVehicle(raceDayId, vehicleId, practiceDayKey = '') {
  const id = keySafe(raceDayId);
  const vId = normalizeId(vehicleId);
  const dayKey = String(practiceDayKey?.key || practiceDayKey || '').trim();
  const bundle = await getRaceDayPractice(id);
  const vehicleBucket = bundle.vehicles?.[vId] || {};
  const sessions = Array.isArray(vehicleBucket.sessions) ? vehicleBucket.sessions : [];
  return sessions
    .map((session) => normalizePracticeSession(session, { raceDayId: id, vehicleId: vId }))
    .filter((session) => !dayKey || session.practiceDayKey === dayKey)
    .sort(latestFirst);
}

export function buildPracticeSummary(vehicleId, sessions = [], practiceDayKey = '') {
  const dayKey = String(practiceDayKey?.key || practiceDayKey || '').trim();
  const normalized = sessions
    .map((session) => normalizePracticeSession(session, { vehicleId }))
    .filter((session) => !dayKey || session.practiceDayKey === dayKey);
  const sorted = [...normalized].sort(latestFirst);
  const latestSession = sorted[0] || null;
  const bestLapSession = normalized
    .filter((session) => session.fastLap)
    .sort((a, b) => compareLapValues(a.fastLap, b.fastLap))[0] || null;
  const bestTop5Session = normalized
    .filter((session) => session.top5Avg)
    .sort((a, b) => compareLapValues(a.top5Avg, b.top5Avg))[0] || null;
  const totalLaps = normalized.reduce((sum, session) => sum + (Number(session.lapCount) || 0), 0);

  return {
    vehicleId: normalizeId(vehicleId),
    runCount: normalized.length,
    totalLaps,
    latestSession,
    bestLapSession,
    bestTop5Session,
    latestFastLap: latestSession?.fastLap || '',
    latestAvgLap: latestSession?.avgLap || '',
    latestTop5Avg: latestSession?.top5Avg || '',
    bestLap: bestLapSession?.fastLap || '',
    bestTop5: bestTop5Session?.top5Avg || '',
    updatedAt: latestSession?.endedAt || latestSession?.startedAt || null,
  };
}

export async function getPracticeSummaryForVehicle(raceDayId, vehicleId, practiceDayKey = '') {
  const sessions = await getPracticeSessionsForVehicle(raceDayId, vehicleId, practiceDayKey);
  return buildPracticeSummary(vehicleId, sessions, practiceDayKey);
}

export async function getPracticeSummariesForVehicles(raceDayId, vehicles = [], practiceDayKey = '') {
  const id = keySafe(raceDayId);
  const dayKey = String(practiceDayKey?.key || practiceDayKey || '').trim();
  const bundle = await getRaceDayPractice(id);
  const result = {};

  for (const vehicle of vehicles || []) {
    const vehicleId = normalizeId(vehicle?.id || vehicle?.vehicleId || vehicle);
    const sessions = Array.isArray(bundle.vehicles?.[vehicleId]?.sessions) ? bundle.vehicles[vehicleId].sessions : [];
    result[vehicleId] = buildPracticeSummary(vehicleId, sessions, dayKey);
  }

  return result;
}

export async function upsertRaceDayPracticeSession(raceDayId, vehicleId, session = {}) {
  const id = keySafe(raceDayId);
  const vId = normalizeId(vehicleId || session.vehicleId);
  if (!id || !vId) return null;

  const bundle = await getRaceDayPractice(id);
  const existingBucket = bundle.vehicles?.[vId] || { vehicleId: vId, sessions: [] };
  const nextSession = normalizePracticeSession(session, {
    raceDayId: id,
    vehicleId: vId,
    practiceDayKey: session.practiceDayKey || session.dayKey || '',
    practiceDayLabel: session.practiceDayLabel || session.dayLabel || '',
    practiceUrl: session.practiceUrl || '',
  });
  const existingSessions = Array.isArray(existingBucket.sessions) ? existingBucket.sessions : [];
  const nextSessions = [
    nextSession,
    ...existingSessions.filter((item) => item.id !== nextSession.id),
  ].sort(latestFirst).slice(0, MAX_SESSIONS_PER_VEHICLE);

  const nextBucket = {
    ...existingBucket,
    vehicleId: vId,
    sessions: nextSessions,
    summary: buildPracticeSummary(vId, nextSessions),
    updatedAt: new Date().toISOString(),
  };

  const nextBundle = {
    ...bundle,
    vehicles: {
      ...(bundle.vehicles || {}),
      [vId]: nextBucket,
    },
  };

  await saveRaceDayPractice(id, nextBundle);
  return nextSession;
}

export async function appendRaceDayPracticeSessions(raceDayId, vehicleId, sessions = []) {
  const list = Array.isArray(sessions) ? sessions : [sessions];
  const saved = [];
  for (const session of list.filter(Boolean)) {
    saved.push(await upsertRaceDayPracticeSession(raceDayId, vehicleId, session));
  }
  return saved.filter(Boolean);
}

export async function getRaceDayPracticeArchiveSummary(raceDayId) {
  const bundle = await getRaceDayPractice(raceDayId);
  const vehicleSummaries = {};
  let runCount = 0;
  let totalLaps = 0;

  Object.keys(bundle.vehicles || {}).forEach((vehicleId) => {
    const sessions = Array.isArray(bundle.vehicles[vehicleId]?.sessions) ? bundle.vehicles[vehicleId].sessions : [];
    const summary = buildPracticeSummary(vehicleId, sessions);
    vehicleSummaries[vehicleId] = summary;
    runCount += summary.runCount || 0;
    totalLaps += summary.totalLaps || 0;
  });

  return {
    raceDayId: keySafe(raceDayId),
    practiceKey: raceDayPracticeKey(raceDayId),
    vehicleSummaries,
    runCount,
    totalLaps,
  };
}
