// src/dashboard/logic/useAuthCloudSync.js
// ✅ DROP-IN FILE
// Dashboard auth + cloud sync status wiring
// - Runs one real cloud restore/sync when an authenticated user is detected, even from a saved session.
// - Yellow while cloud sync is running.
// - Green only after cloud sync fully finishes or cloudSync reports synced.
// - Prevents heartbeat/auto-push React update loops.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import Constants from 'expo-constants';

import {
  listenToAuth,
  getUserFirstName,
  signInWithGoogle,
  signInWithApple,
  configureGoogleSignIn,
  signOut,
} from '../../../app/services/auth';
import { writeSyncHeartbeat } from '../../../app/services/sync';
import {
  runManualCloudSync,
  maybeAutoBackupIfChanged,
  subscribeCloudSyncStatus,
  getCloudSyncStatus,
} from '../../../app/services/cloudSync';

const HEARTBEAT_MIN_INTERVAL_MS = 30 * 60 * 1000;
const AUTO_PUSH_CHECK_INTERVAL_MS = 2 * 60 * 1000;

function statusSignature(status) {
  if (!status || typeof status !== 'object') return '';
  try {
    return JSON.stringify({
      state: status.state || '',
      color: status.color || '',
      label: status.label || '',
      dirty: !!status.dirty,
      pending: !!status.pending,
      paused: !!status.paused,
      lastSyncAt: Number(status.lastSyncAt || 0) || 0,
      lastPushAt: Number(status.lastPushAt || 0) || 0,
      lastPullAt: Number(status.lastPullAt || 0) || 0,
      schemaVersion: status.schemaVersion || '',
    });
  } catch {
    return String(status?.state || '');
  }
}

function setBooleanIfChanged(setter, next) {
  setter((prev) => (prev === next ? prev : next));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSettledCloudStatus({ uid, getStatus, timeoutMs = 15000, intervalMs = 750 } = {}) {
  const startedAt = Date.now();
  let latest = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      latest = await getStatus({ uid });
      const state = String(latest?.state || '').toLowerCase();
      if (state && state !== 'syncing') return latest;
    } catch {}
    await sleep(intervalMs);
  }

  return latest;
}

function showAuthError(error) {
  const message = String(error?.message || error || '').trim();
  if (!message) return;

  // Do not bother users when they intentionally cancel the Google/Apple prompt.
  if (/cancel|dismiss|closed/i.test(message)) return;

  try {
    Alert.alert('Sign in failed', message);
  } catch {}
}

function getDotColor({ authUser, syncStatus, syncBusy, cloudBusy, syncSettling, lastSyncAt }) {
  if (!authUser) return '#6B7280'; // signed out / neutral gray

  const state = String(syncStatus?.state || '').toLowerCase();
  const label = String(syncStatus?.label || '').toLowerCase();
  const message = String(syncStatus?.message || '').toLowerCase();

  // Green must never show while any real sync path is still running/settling.
  if (syncBusy || cloudBusy || syncSettling || state === 'syncing') return '#FACC15'; // yellow

  if (state === 'error') {
    // Do not leave the dashboard red for non-fatal write-back/schema repair
    // states after a successful pull. A fresh restore can succeed, then a
    // deferred cloud write-back can be paused/throttled. That should be yellow
    // or green, not a scary red failed-login/data-lost state.
    const hadSuccessfulSync = Number(syncStatus?.lastSyncAt || lastSyncAt || 0) > 0;
    const isTransientWriteIssue = /backoff|resource-exhausted|spacing|write|queued|slow down|throttle|deferred/i.test(
      `${label} ${message}`
    );
    if (hadSuccessfulSync && !syncStatus?.dirty && !syncStatus?.pending) return '#22C55E';
    if (hadSuccessfulSync && isTransientWriteIssue) return '#FACC15';
    return '#EF4444'; // red
  }

  if (
    state === 'paused' ||
    state === 'backoff' ||
    label.includes('paused') ||
    message.includes('backoff') ||
    message.includes('resource-exhausted')
  ) {
    return '#F97316'; // orange
  }

  if (state === 'dirty' || state === 'pending' || !!syncStatus?.dirty || !!syncStatus?.pending) {
    return '#FACC15'; // yellow
  }

  // Green only after cloudSync reports synced OR this hook completed a cloud sync.
  if (state === 'synced' || Number(lastSyncAt || 0) > 0) return '#22C55E';

  return '#6B7280'; // signed in, but no cloud sync completed yet
}

export function useAuthCloudSync({ onDashboardRefresh, onRaceDayRefresh } = {}) {
  const version = Constants.expoConfig?.version || Constants.manifest?.version || '—';

  const [authUser, setAuthUser] = useState(null);
  const [justSignedIn, setJustSignedIn] = useState(false);
  const [syncOk, setSyncOk] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [syncSettling, setSyncSettling] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);

  const settleTimerRef = useRef(null);
  const heartbeatRunningRef = useRef(false);
  const autoPushRunningRef = useRef(false);
  const initialCloudSyncRunningRef = useRef(false);
  const initialCloudSyncDoneUidRef = useRef('');
  const manualSyncRunningRef = useRef(false);
  const lastHeartbeatAtRef = useRef(0);
  const mountedRef = useRef(true);
  const syncStatusRef = useRef(null);
  const onDashboardRefreshRef = useRef(onDashboardRefresh);
  const onRaceDayRefreshRef = useRef(onRaceDayRefresh);

  useEffect(() => {
    onDashboardRefreshRef.current = onDashboardRefresh;
  }, [onDashboardRefresh]);

  useEffect(() => {
    onRaceDayRefreshRef.current = onRaceDayRefresh;
  }, [onRaceDayRefresh]);

  const markSyncStart = useCallback(() => {
    try {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    } catch {}
    setBooleanIfChanged(setSyncSettling, true);
  }, []);

  const markSyncEnd = useCallback(() => {
    try {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    } catch {}
    settleTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setBooleanIfChanged(setSyncSettling, false);
    }, 1200);
  }, []);

  const applySyncStatusToState = useCallback((next) => {
    if (!mountedRef.current) return;

    syncStatusRef.current = next || null;
    setSyncStatus((prev) => (statusSignature(prev) === statusSignature(next) ? prev : next));

    const nextLastSync = Number(next?.lastSyncAt || 0) || 0;
    if (nextLastSync) {
      setLastSyncAt((prev) => (Number(prev || 0) === nextLastSync ? prev : nextLastSync));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const unsub = listenToAuth((u) => {
      const nextUser = u || null;

      setAuthUser((prev) => {
        const prevUid = prev?.uid || '';
        const nextUid = nextUser?.uid || '';

        if (!nextUid) {
          initialCloudSyncDoneUidRef.current = '';
          initialCloudSyncRunningRef.current = false;
        }

        if (prevUid === nextUid) return prev;
        return nextUser;
      });
    });

    if (Platform.OS === 'android') {
      configureGoogleSignIn({
        webClientId: '839652493357-ufacb1n4qgvg6n8hvguin9g8njcthopd.apps.googleusercontent.com',
      });
    }

    return () => {
      mountedRef.current = false;
      try {
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      } catch {}
      try {
        unsub?.();
      } catch {}
    };
  }, []);

  const refreshAfterSync = useCallback(async () => {
    try {
      await onRaceDayRefreshRef.current?.();
    } catch {}
    try {
      await onDashboardRefreshRef.current?.();
    } catch {}
  }, []);

  // Local-only cloud sync status subscription. This does not read Firestore.
  useEffect(() => {
    let stopped = false;
    const uid = authUser?.uid || '';

    if (!uid) {
      syncStatusRef.current = null;
      setSyncStatus((prev) => (prev === null ? prev : null));
      setLastSyncAt((prev) => (prev === null ? prev : null));
      setSyncOk((prev) => (prev === false ? prev : false));
      return () => {};
    }

    const applyStatus = (next) => {
      if (stopped || !mountedRef.current) return;
      applySyncStatusToState(next);
    };

    getCloudSyncStatus({ uid }).then(applyStatus).catch(() => {});
    const off = subscribeCloudSyncStatus(applyStatus, { uid, intervalMs: 2500 });

    return () => {
      stopped = true;
      try {
        off?.();
      } catch {}
    };
  }, [authUser?.uid, applySyncStatusToState]);

  const runHeartbeat = useCallback(
    async ({ force = false, reason = 'heartbeat' } = {}) => {
      const uid = authUser?.uid;
      if (!uid) {
        setSyncOk((prev) => (prev === false ? prev : false));
        return { ok: false, mode: 'no-uid' };
      }

      if (heartbeatRunningRef.current) return { ok: false, mode: 'heartbeat-running' };

      const now = Date.now();
      if (!force && now - Number(lastHeartbeatAtRef.current || 0) < HEARTBEAT_MIN_INTERVAL_MS) {
        setSyncOk((prev) => (prev === true ? prev : true));
        return { ok: true, mode: 'heartbeat-throttled' };
      }

      heartbeatRunningRef.current = true;
      setBooleanIfChanged(setSyncBusy, true);

      try {
        const res = await writeSyncHeartbeat({ uid, appVersion: version, reason });
        const ok = !!res?.ok;
        lastHeartbeatAtRef.current = Date.now();
        setSyncOk((prev) => (prev === ok ? prev : ok));
        return res;
      } catch (e) {
        console.warn('[Sync] Heartbeat failed:', e?.message || e);
        setSyncOk((prev) => (prev === false ? prev : false));
        return { ok: false, error: e };
      } finally {
        heartbeatRunningRef.current = false;
        if (mountedRef.current) setBooleanIfChanged(setSyncBusy, false);
      }
    },
    [authUser?.uid, version]
  );

  useEffect(() => {
    if (!authUser?.uid) return;
    runHeartbeat({ force: true, reason: 'auth-ready' });
  }, [authUser?.uid, runHeartbeat]);

  useEffect(() => {
    if (!authUser?.uid) return;

    const onActive = (state) => {
      if (state === 'active') runHeartbeat({ reason: 'foreground' });
    };

    const sub = AppState.addEventListener('change', onActive);
    const intervalId = setInterval(() => runHeartbeat({ reason: 'interval' }), HEARTBEAT_MIN_INTERVAL_MS);

    return () => {
      try {
        sub.remove();
      } catch {}
      try {
        clearInterval(intervalId);
      } catch {}
    };
  }, [authUser?.uid, runHeartbeat]);

  // Important:
  // This runs a REAL cloud sync once whenever an auth user appears, including a
  // saved Firebase session after app launch. This is what changes the light from
  // gray -> yellow -> green and updates "last sync never".
  useEffect(() => {
    const uid = authUser?.uid || '';
    if (!uid) return;
    if (initialCloudSyncRunningRef.current) return;
    if (initialCloudSyncDoneUidRef.current === uid) return;

    let cancelled = false;

    async function runInitialCloudSync() {
      initialCloudSyncRunningRef.current = true;
      initialCloudSyncDoneUidRef.current = uid;

      markSyncStart();
      setBooleanIfChanged(setCloudBusy, true);

      try {
        await runHeartbeat({ reason: 'initial-cloud-sync' }).catch(() => null);

        // Use the same path as tapping the name pill. This always reads the
        // single cloud backup doc and can pull data on a fresh reinstall.
        let result = await runManualCloudSync({ uid, appVersion: version });
        if (result?.reason === 'sync-already-running') {
          // Older cloudSync builds returned this fake result while a real sync
          // was active. Wait for the real sync status instead of leaving the
          // dashboard stuck yellow/gray. Newer cloudSync builds return the active
          // sync result directly, so this path is only a safety fallback.
          const settled = await waitForSettledCloudStatus({ uid, getStatus: getCloudSyncStatus });
          if (settled) applySyncStatusToState(settled);
          await sleep(500);
          if (!cancelled && mountedRef.current) {
            result = await runManualCloudSync({ uid, appVersion: version });
          }
        }
        console.log('[CloudSync] initial restore result', result);

        if (!cancelled && mountedRef.current && !result?.error) {
          // This cloud sync/verification fully completed, or we waited for an
          // already-running sync to complete. It is safe for the dashboard
          // light/footer to leave gray and show synced when the service reports
          // a clean status.
          await refreshAfterSync();

          const nextStatus = await waitForSettledCloudStatus({
            uid,
            getStatus: getCloudSyncStatus,
            timeoutMs: 6000,
            intervalMs: 500,
          });

          const completedAt = Number(nextStatus?.lastSyncAt || 0) || Date.now();
          setSyncOk((prev) => (prev === true ? prev : true));
          setLastSyncAt((prev) => (Number(prev || 0) === completedAt ? prev : completedAt));

          if (nextStatus && !cancelled) applySyncStatusToState(nextStatus);
        }
      } catch (e) {
        console.warn('[CloudSync] initial cloud sync failed:', e?.message || e);
        if (!cancelled && mountedRef.current) setSyncOk((prev) => (prev === false ? prev : false));
      } finally {
        initialCloudSyncRunningRef.current = false;

        if (!cancelled && mountedRef.current) {
          setJustSignedIn(false);
          setBooleanIfChanged(setCloudBusy, false);
          markSyncEnd();
        }
      }
    }

    runInitialCloudSync();

    return () => {
      cancelled = true;
    };
  }, [authUser?.uid, applySyncStatusToState, markSyncEnd, markSyncStart, refreshAfterSync, runHeartbeat, version]);

  const runAutoPush = useCallback(
    async (reason = 'auto') => {
      const uid = authUser?.uid;
      if (!uid || autoPushRunningRef.current) return { didSync: false, reason: 'auto-skip' };

      // Let the first real cloud restore win the sync lock. Without this,
      // the post-auth auto-push check can start first, the initial pull can
      // return sync-already-running, and a fresh install will sit there until
      // the user manually taps the name pill.
      if (initialCloudSyncRunningRef.current || initialCloudSyncDoneUidRef.current !== uid) {
        return { didSync: false, reason: 'initial-cloud-sync-pending' };
      }

      autoPushRunningRef.current = true;

      const status = syncStatusRef.current;
      const shouldShowBusy =
        !!status?.dirty ||
        !!status?.pending ||
        ['dirty', 'pending', 'syncing'].includes(String(status?.state || '').toLowerCase());

      if (shouldShowBusy) {
        markSyncStart();
        setBooleanIfChanged(setCloudBusy, true);
      }

      try {
        const r = await maybeAutoBackupIfChanged({ uid, appVersion: version, reason });
        if (r?.didSync) {
          const now = Date.now();
          setLastSyncAt((prev) => (Number(prev || 0) === now ? prev : now));
          await refreshAfterSync();

          try {
            const nextStatus = await getCloudSyncStatus({ uid });
            applySyncStatusToState(nextStatus);
          } catch {}
        }
        return r;
      } catch (e) {
        console.warn('[CloudSync] Auto-push failed:', e?.message || e);
        return { didSync: false, error: e };
      } finally {
        autoPushRunningRef.current = false;
        if (shouldShowBusy && mountedRef.current) {
          setBooleanIfChanged(setCloudBusy, false);
          markSyncEnd();
        }
      }
    },
    [authUser?.uid, applySyncStatusToState, markSyncEnd, markSyncStart, refreshAfterSync, version]
  );

  useEffect(() => {
    if (!authUser?.uid) return;

    const onActive = (state) => {
      if (state === 'active') runAutoPush('foreground');
    };

    // Run a silent no-change check after auth is ready. The service will not read cloud unless dirty.
    runAutoPush('post-auth');

    const sub = AppState.addEventListener('change', onActive);
    const intervalId = setInterval(() => runAutoPush('interval'), AUTO_PUSH_CHECK_INTERVAL_MS);

    return () => {
      try {
        sub.remove();
      } catch {}
      try {
        clearInterval(intervalId);
      } catch {}
    };
  }, [authUser?.uid, runAutoPush]);

  const handleAuthPress = useCallback(async () => {
    try {
      if (!authUser) {
        setJustSignedIn(true);
        if (Platform.OS === 'ios') await signInWithApple();
        else await signInWithGoogle();
        return;
      }

      if (manualSyncRunningRef.current) return;
      manualSyncRunningRef.current = true;
      markSyncStart();
      setBooleanIfChanged(setCloudBusy, true);

      try {
        const r = await runManualCloudSync({ uid: authUser.uid, appVersion: version });

        if (!r?.error) {
          // Refresh the dashboard immediately after the service writes restored
          // AsyncStorage data, then read final sync status.
          await refreshAfterSync();

          const completedAt = Date.now();
          setSyncOk((prev) => (prev === true ? prev : true));
          setLastSyncAt((prev) => (Number(prev || 0) === completedAt ? prev : completedAt));

          try {
            const nextStatus = await getCloudSyncStatus({ uid: authUser.uid });
            applySyncStatusToState(nextStatus);
          } catch {}
        } else {
          await refreshAfterSync();
        }
      } finally {
        manualSyncRunningRef.current = false;
        setBooleanIfChanged(setCloudBusy, false);
        markSyncEnd();
      }
    } catch (e) {
      console.warn('[AuthUI] auth/sync action failed:', e?.message || e);
      showAuthError(e);
      setJustSignedIn(false);
      manualSyncRunningRef.current = false;
      setBooleanIfChanged(setCloudBusy, false);
      markSyncEnd();
    }
  }, [authUser, applySyncStatusToState, markSyncEnd, markSyncStart, refreshAfterSync, version]);

  const handleAuthLongPress = useCallback(async () => {
    if (!authUser) return;
    try {
      await signOut();
      initialCloudSyncDoneUidRef.current = '';
      initialCloudSyncRunningRef.current = false;
      setSyncOk((prev) => (prev === false ? prev : false));
      setLastSyncAt((prev) => (prev === null ? prev : null));
      setSyncStatus((prev) => (prev === null ? prev : null));
    } catch (e) {
      console.warn('[AuthUI] Sign-out failed:', e?.message || e);
    }
  }, [authUser]);

  const statusDotColor = useMemo(
    () =>
      getDotColor({
        authUser,
        syncStatus,
        syncBusy,
        cloudBusy,
        syncSettling,
        lastSyncAt,
      }),
    [authUser, cloudBusy, lastSyncAt, syncBusy, syncSettling, syncStatus]
  );

  return {
    version,
    authUser,
    userFirstName: getUserFirstName(authUser),
    syncOk,
    syncBusy,
    cloudBusy,
    syncSettling,
    syncStatus,
    lastSyncAt,
    statusDotColor,
    handleAuthPress,
    handleAuthLongPress,
    runHeartbeat,
  };
}
