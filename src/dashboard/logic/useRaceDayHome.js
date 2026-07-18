// src/dashboard/logic/useRaceDayHome.js
import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, RACE_DAY_CAR_KEYS, RACE_DAY_TRACK_KEYS } from './storageKeys';
import { safeParse } from './formatters';
import { resetRecentChangesForNewDay } from '../../../app/services/cloudSync';
import { buildRaceDayArchiveTrackGroups, getArchivedRaceDayBundle } from './raceDayArchiveReader';

function parseRaceDayActive(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { return null; }
}

function sessionSortMs(s) {
  return Number(s?.endedAtMs || s?.updatedAtMs || s?.startedAtMs || s?.createdAtMs || 0);
}

function normalizeSessionTrackId(s) {
  return String(s?.trackId || s?.track?.id || s?.track?.trackId || '').trim() || '__unknown__';
}

function pruneSessionsPerTrack(sessions) {
  const byId = new Map();
  (Array.isArray(sessions) ? sessions : []).forEach((s) => {
    const id = String(s?.id || s?.sessionId || s?.raceDayId || '').trim();
    const fallbackKey = `${normalizeSessionTrackId(s)}__${sessionSortMs(s)}__${String(s?.eventName || s?.selectedEventName || '').trim()}`;
    const key = id || fallbackKey;
    const prev = byId.get(key);
    if (!prev || sessionSortMs(s) >= sessionSortMs(prev)) byId.set(key, s);
  });
  return Array.from(byId.values()).sort((a, b) => sessionSortMs(b) - sessionSortMs(a));
}

export function useRaceDayHome({ router, authUser, version, onRefresh } = {}) {
  const [raceDayReady, setRaceDayReady] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showPastEventsModal, setShowPastEventsModal] = useState(false);
  const [showActiveModal, setShowActiveModal] = useState(false);
  const [activeChoices, setActiveChoices] = useState([]);
  const [pastTrackChoices, setPastTrackChoices] = useState([]);
  const [pastSessionChoices, setPastSessionChoices] = useState([]);
  const [selectedPastTrackId, setSelectedPastTrackId] = useState('');
  const [trackNameMap, setTrackNameMap] = useState({});
  const [archiveDetail, setArchiveDetail] = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const getRaceDayActiveState = useCallback(async () => {
    const rawCanon = await AsyncStorage.getItem(STORAGE_KEYS.raceDayActiveCanon);
    const rawLegacy = await AsyncStorage.getItem(STORAGE_KEYS.raceDayActiveLegacy);
    const endedFlag = String((await AsyncStorage.getItem(STORAGE_KEYS.raceDayEnded)) ?? '').trim();

    const canonObj = parseRaceDayActive(rawCanon);
    const legacyObj = parseRaceDayActive(rawLegacy);

    function hasUsableActive(obj) {
      if (!obj || typeof obj !== 'object') return false;
      const trackId = String(obj?.trackId || obj?.track?.id || obj?.track?.trackId || '').trim();
      const identity = String(obj?.id || obj?.raceDayId || obj?.sessionId || obj?.startedAt || '').trim();
      return !!trackId && !!identity;
    }

    function normalizeActivePointer(obj) {
      if (!obj || typeof obj !== 'object') return null;
      const id = String(obj?.id || obj?.raceDayId || obj?.sessionId || '').trim();
      const trackId = String(obj?.trackId || obj?.track?.id || obj?.track?.trackId || '').trim();
      const vehicleIds = Array.isArray(obj?.vehicleIds) ? obj.vehicleIds : [];

      return {
        ...obj,
        ...(id ? { id, raceDayId: id, sessionId: id } : {}),
        trackId,
        vehicleIds,
        status: obj?.status || 'active',
      };
    }

    let obj = hasUsableActive(canonObj)
      ? normalizeActivePointer(canonObj)
      : hasUsableActive(legacyObj)
        ? normalizeActivePointer(legacyObj)
        : null;

    // Transition bridge:
    // If the old Dashboard wrote only @activeRaceDay, copy that same valid object
    // into @raceDayActive_v1 so the new RaceDay dashboard reads the same source.
    if (obj && !hasUsableActive(canonObj) && hasUsableActive(legacyObj)) {
      const str = JSON.stringify(obj);
      try { await AsyncStorage.setItem(STORAGE_KEYS.raceDayActiveCanon, str); } catch {}
    }

    const status = String(obj?.status || '').trim().toLowerCase();
    const ended =
      endedFlag === '1' ||
      endedFlag === 'true' ||
      status === 'ended' ||
      status === 'inactive' ||
      status === 'dead' ||
      !!obj?.endedAtMs ||
      !!obj?.endedAt;

    if (ended) {
      return { obj, active: false, ended: true };
    }

    const active = !!obj && hasUsableActive(obj);

    return { obj, active, ended: false };
  }, []);

  const readRaceDaySessions = useCallback(async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.raceDaySessions);
    const arr = safeParse(raw, []);
    return Array.isArray(arr) ? arr : [];
  }, []);

  const writeRaceDaySessions = useCallback(async (nextSessions) => {
    const incoming = Array.isArray(nextSessions) ? nextSessions : [];
    const existing = await readRaceDaySessions();
    const kept = pruneSessionsPerTrack([...incoming, ...existing]);
    await AsyncStorage.setItem(STORAGE_KEYS.raceDaySessions, JSON.stringify(kept));
    return kept;
  }, [readRaceDaySessions]);

  const getRaceDayUiState = useCallback(async () => {
    const sessions = await readRaceDaySessions();
    const st = await getRaceDayActiveState();
    const activeId = String(st?.obj?.id || st?.obj?.raceDayId || st?.obj?.sessionId || '').trim();
    const anyActiveSession = sessions.some((s) => String(s?.status || '').toLowerCase() === 'active');
    const endedInSessions = !!activeId && sessions.some((s) => String(s?.id || '').trim() === activeId && String(s?.status || '').toLowerCase() === 'ended');
    const endedAndPointerCleared = !activeId && !!st?.ended;
    const canContinue =
      !!st.active &&
      !!st?.obj &&
      !endedAndPointerCleared &&
      !endedInSessions;
    return { canContinue, activeId, anyActiveSession: endedAndPointerCleared ? false : anyActiveSession, endedInSessions, endedAndPointerCleared, sessions };
  }, [getRaceDayActiveState, readRaceDaySessions]);

  const clearLocalRaceDayUiKeys = useCallback(async () => {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.raceDayStarted, ''],
      [STORAGE_KEYS.raceDayReady, ''],
      [STORAGE_KEYS.raceDayEnded, '1'],
    ]);
    try { await AsyncStorage.removeItem('@raceDay_trackId'); } catch {}
    try { await AsyncStorage.removeItem('@raceDay_vehicleIds'); } catch {}
  }, []);

  const syncRaceDayReady = useCallback(async () => {
    try {
      const ui = await getRaceDayUiState();
      if (ui?.endedInSessions) {
        await clearLocalRaceDayUiKeys();
        try { await AsyncStorage.removeItem(STORAGE_KEYS.raceDayActiveCanon); } catch {}
        try { await AsyncStorage.removeItem(STORAGE_KEYS.raceDayActiveLegacy); } catch {}
      }
      if (ui?.canContinue) {
        await AsyncStorage.setItem(STORAGE_KEYS.raceDayReady, '1');
        await AsyncStorage.setItem(STORAGE_KEYS.raceDayStarted, '1');
        setRaceDayReady(true);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.raceDayReady);
        setRaceDayReady(false);
      }
      return ui;
    } catch {
      setRaceDayReady(false);
      return { canContinue: false };
    }
  }, [clearLocalRaceDayUiKeys, getRaceDayUiState]);

  const hasRaceDaySelections = useCallback(async () => {
    const st = await getRaceDayActiveState();
    if (st.ended) return false;
    if (st.active) return true;

    const active = await AsyncStorage.getItem(STORAGE_KEYS.raceDayActiveLegacy);
    if (active) {
      const a = safeParse(active, null);
      if (a?.trackId && Array.isArray(a?.vehicleIds) && a.vehicleIds.length > 0) return true;
    }

    let trackOk = false;
    for (const k of RACE_DAY_TRACK_KEYS) {
      const raw = await AsyncStorage.getItem(k);
      if (String(raw || '').trim()) { trackOk = true; break; }
    }
    let carsOk = false;
    for (const k of RACE_DAY_CAR_KEYS) {
      const raw = await AsyncStorage.getItem(k);
      const trimmed = String(raw || '').trim();
      if (!trimmed) continue;
      const parsed = safeParse(trimmed, trimmed);
      if (Array.isArray(parsed) ? parsed.length > 0 : !!parsed) { carsOk = true; break; }
    }
    return trackOk && carsOk;
  }, [getRaceDayActiveState]);

  const loadTrackNameMap = useCallback(async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.tracks);
    const arr = safeParse(raw, []);
    const next = {};
    (Array.isArray(arr) ? arr : []).forEach((t) => {
      const id = String(t?.id ?? t?.trackId ?? '').trim();
      const name = String(t?.name ?? t?.trackName ?? t?.title ?? '').trim();
      if (id) next[id] = name || id;
    });
    setTrackNameMap(next);
    return next;
  }, []);

  const openActiveRaceDayPickerIfNeeded = useCallback(async () => {
    const st = await getRaceDayActiveState();
    const pointerId = String(st?.obj?.id || st?.obj?.sessionId || st?.obj?.raceDayId || '').trim();
    if (!pointerId && st?.ended) {
      setActiveChoices([]);
      setShowActiveModal(false);
      return false;
    }
    const sessions = await readRaceDaySessions();
    const active = sessions.filter((s) => String(s?.status || '').toLowerCase() === 'active' && !s?.endedAt && !s?.endedAtMs);
    if (active.length) {
      setActiveChoices(active);
      setShowActiveModal(true);
      return true;
    }
    return false;
  }, [getRaceDayActiveState, readRaceDaySessions]);

  const handleRaceDayPress = useCallback(async () => {
    const ui = await getRaceDayUiState();
    if (ui?.canContinue) {
      router?.replace('/raceday/dashboard');
      return;
    }
    const hadActive = await openActiveRaceDayPickerIfNeeded();
    if (hadActive) return;
    setShowStartModal(true);
  }, [getRaceDayUiState, openActiveRaceDayPickerIfNeeded, router]);

  const startNewRaceDayFlow = useCallback(async () => {
    try { await resetRecentChangesForNewDay({ uid: authUser?.uid, appVersion: version, alsoPush: true }); } catch {}
    try { await AsyncStorage.removeItem(STORAGE_KEYS.raceDayActiveCanon); } catch {}
    try { await AsyncStorage.removeItem(STORAGE_KEYS.raceDayActiveLegacy); } catch {}
    try { await AsyncStorage.setItem(STORAGE_KEYS.raceDayEnded, ''); } catch {}
    try { await AsyncStorage.setItem(STORAGE_KEYS.raceDayStarted, '1'); } catch {}
    try { await AsyncStorage.setItem(STORAGE_KEYS.raceDayReady, ''); } catch {}
    setShowStartModal(false);
    setShowPastEventsModal(false);
    router?.push('/raceday/select-track');
  }, [authUser?.uid, router, version]);

  const openPastEventsPicker = useCallback(async () => {
    setArchiveLoading(true);
    setArchiveDetail(null);

    try {
      const nameMap = Object.keys(trackNameMap || {}).length
        ? trackNameMap
        : await loadTrackNameMap();

      const trackChoices = await buildRaceDayArchiveTrackGroups(nameMap);

      setPastTrackChoices(Array.isArray(trackChoices) ? trackChoices : []);
      setPastSessionChoices([]);
      setSelectedPastTrackId('');
      setShowPastEventsModal(true);
      return trackChoices;
    } catch (error) {
      console.warn('[RaceDayArchive] Failed to open Past Events:', error?.message || error);
      setPastTrackChoices([]);
      setPastSessionChoices([]);
      setSelectedPastTrackId('');
      setShowPastEventsModal(true);
      return [];
    } finally {
      setArchiveLoading(false);
    }
  }, [loadTrackNameMap, trackNameMap]);

  const selectPastTrack = useCallback((trackId) => {
    const tid = String(trackId || '').trim();

    if (!tid) {
      setSelectedPastTrackId('');
      setPastSessionChoices([]);
      setArchiveDetail(null);
      return;
    }

    const match = (pastTrackChoices || []).find((t) => String(t?.trackId || '') === tid);
    setSelectedPastTrackId(tid);
    setPastSessionChoices(Array.isArray(match?.sessions) ? match.sessions : []);
    setArchiveDetail(null);
  }, [pastTrackChoices]);

  const recallPastRaceDaySession = useCallback(async (session) => {
    const id = String(session?.id || session?.sessionId || session?.raceDayId || '').trim();
    if (!id) return;

    setArchiveLoading(true);
    try {
      const bundle = await getArchivedRaceDayBundle(id);
      setArchiveDetail({
        id,
        session: bundle?.session || session || { id },
        runs: Array.isArray(bundle?.runs) ? bundle.runs : [],
        notes: Array.isArray(bundle?.notes) ? bundle.notes : [],
        changes: Array.isArray(bundle?.changes) ? bundle.changes : [],
        comparisons: Array.isArray(bundle?.comparisons) ? bundle.comparisons : [],
      });
      setShowPastEventsModal(true);
    } catch (error) {
      console.warn('[RaceDayArchive] Failed to open archived RaceDay:', error?.message || error);
      setArchiveDetail({
        id,
        session: session || { id },
        runs: [],
        notes: [],
        changes: [],
        comparisons: [],
        error: String(error?.message || error || 'Unable to load archived RaceDay.'),
      });
      setShowPastEventsModal(true);
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  const setActivePointerFromSession = useCallback(async (session) => {
    const s = session && typeof session === 'object' ? session : {};
    const id = String(s.id || s.sessionId || s.raceDayId || '').trim();
    if (!id) return false;
    const now = Date.now();
    const trackId = String(s.trackId || s?.track?.id || s?.track?.trackId || '').trim();
    const vehicleIds = Array.isArray(s.vehicleIds) ? s.vehicleIds.map((x) => String(x || '')).filter(Boolean) : [];
    const pointer = { ...s, id, sessionId: id, raceDayId: id, status: 'active', trackId, vehicleIds, updatedAtMs: now, recalledFromPast: true };
    const str = JSON.stringify(pointer);
    await AsyncStorage.setItem(STORAGE_KEYS.raceDayActiveCanon, str);
    await AsyncStorage.setItem(STORAGE_KEYS.raceDayActiveLegacy, str);
    await AsyncStorage.setItem('@raceDay_trackId', trackId || '');
    await AsyncStorage.setItem('@raceDay_vehicleIds', JSON.stringify(vehicleIds));
    await AsyncStorage.setItem(STORAGE_KEYS.raceDayReady, '1');
    await AsyncStorage.setItem(STORAGE_KEYS.raceDayStarted, '1');
    await AsyncStorage.removeItem(STORAGE_KEYS.raceDayEnded);
    setRaceDayReady(true);
    return true;
  }, []);

  const endRaceDaySessionById = useCallback(async (sessionId) => {
    const id = String(sessionId || '').trim();
    if (!id) return;
    const now = Date.now();
    const sessions = await readRaceDaySessions();
    const next = sessions.map((s) => {
      const sid = String(s?.id || s?.sessionId || s?.raceDayId || '').trim();
      if (sid !== id) return s;
      return { ...s, id, status: 'ended', endedAtMs: Number(s?.endedAtMs || 0) || now, updatedAtMs: now };
    });
    await writeRaceDaySessions(next);
    const st = await getRaceDayActiveState();
    const pid = String(st?.obj?.id || st?.obj?.sessionId || st?.obj?.raceDayId || '').trim();
    if (pid === id) {
      await AsyncStorage.removeItem(STORAGE_KEYS.raceDayActiveCanon);
      await AsyncStorage.removeItem(STORAGE_KEYS.raceDayActiveLegacy);
      await AsyncStorage.setItem(STORAGE_KEYS.raceDayReady, '');
      await AsyncStorage.setItem(STORAGE_KEYS.raceDayStarted, '');
    }
    await AsyncStorage.setItem(STORAGE_KEYS.raceDayEnded, '1');
    setRaceDayReady(false);
    await onRefresh?.();
  }, [getRaceDayActiveState, onRefresh, readRaceDaySessions, writeRaceDaySessions]);

  useEffect(() => { syncRaceDayReady(); loadTrackNameMap(); }, [syncRaceDayReady, loadTrackNameMap]);

  return {
    raceDayReady,
    hasRaceDaySelections,
    syncRaceDayReady,
    handleRaceDayPress,
    startNewRaceDayFlow,
    openPastEventsPicker,
    selectPastTrack,
    recallPastRaceDaySession,
    setActivePointerFromSession,
    endRaceDaySessionById,
    modals: {
      showStartModal, setShowStartModal,
      showPastEventsModal, setShowPastEventsModal,
      showActiveModal, setShowActiveModal,
      activeChoices,
      pastTrackChoices,
      pastSessionChoices,
      selectedPastTrackId,
      trackNameMap,
      archiveDetail,
      archiveLoading,
      setArchiveDetail,
    },
  };
}

export default useRaceDayHome;
