// app/services/sync.js
// ✅ Firestore heartbeat for IMRC Setup Manager 2.0
// - Write-only heartbeat: no read-back after write.
// - Adds an in-device throttle so render/effect loops cannot queue writes.
// - Firestore sync data lives in cloudSync.js; this file only writes the user heartbeat.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { db } from "./firebaseClient";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

const CLOUD_SCHEMA_VERSION = "2.0.0";
const HEARTBEAT_META_KEY = "@imrc_cloud_heartbeat_meta_v2";
const HEARTBEAT_MIN_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const HEARTBEAT_ERROR_BACKOFF_MS = 10 * 60 * 1000; // 10 minutes

let heartbeatInFlight = null;

function isResourceExhaustedError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  const code = String(e?.code || "").toLowerCase();
  return (
    code.includes("resource-exhausted") ||
    msg.includes("resource-exhausted") ||
    msg.includes("maximum allowed queued writes") ||
    msg.includes("write stream exhausted") ||
    msg.includes("maximum backoff delay")
  );
}

async function getHeartbeatMeta() {
  try {
    const raw = await AsyncStorage.getItem(HEARTBEAT_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setHeartbeatMeta(next) {
  try {
    await AsyncStorage.setItem(HEARTBEAT_META_KEY, JSON.stringify(next || {}));
  } catch {}
}

/**
 * Writes a simple heartbeat to:
 *   users/{uid}
 *
 * This intentionally does NOT call getDoc() after setDoc().
 */
export async function writeSyncHeartbeat({ uid, appVersion = "", force = false } = {}) {
  if (!uid) return { ok: false, mode: "no-uid" };

  if (heartbeatInFlight) {
    return {
      ok: true,
      mode: "js-sdk",
      skipped: true,
      reason: "heartbeat-already-running",
      reads: 0,
      writes: 0,
      schemaVersion: CLOUD_SCHEMA_VERSION,
    };
  }

  const now = Date.now();
  const meta = await getHeartbeatMeta();
  const backoffUntil = Number(meta?.backoffUntilAt || 0) || 0;
  const lastWriteAt = Number(meta?.lastWriteAt || 0) || 0;

  if (!force && backoffUntil && now < backoffUntil) {
    return {
      ok: true,
      mode: "js-sdk",
      skipped: true,
      reason: "heartbeat-backoff",
      retryAt: backoffUntil,
      reads: 0,
      writes: 0,
      schemaVersion: CLOUD_SCHEMA_VERSION,
    };
  }

  if (!force && lastWriteAt && now - lastWriteAt < HEARTBEAT_MIN_INTERVAL_MS) {
    return {
      ok: true,
      mode: "js-sdk",
      skipped: true,
      reason: "heartbeat-throttled",
      nextAllowedAt: lastWriteAt + HEARTBEAT_MIN_INTERVAL_MS,
      reads: 0,
      writes: 0,
      schemaVersion: CLOUD_SCHEMA_VERSION,
    };
  }

  const path = `users/${uid}`;
  const ref = doc(db, path);

  heartbeatInFlight = (async () => {
    try {
      await setDoc(
        ref,
        {
          lastLoginAt: serverTimestamp(),
          lastHeartbeatAt: serverTimestamp(),
          platform: Platform.OS,
          appVersion: String(appVersion || ""),
          schemaVersion: CLOUD_SCHEMA_VERSION,
        },
        { merge: true }
      );

      await setHeartbeatMeta({
        lastWriteAt: Date.now(),
        backoffUntilAt: 0,
        lastError: "",
      });

      return {
        ok: true,
        mode: "js-sdk",
        path,
        wrote: true,
        reads: 0,
        writes: 1,
        schemaVersion: CLOUD_SCHEMA_VERSION,
      };
    } catch (e) {
      const msg = e?.message || String(e);
      const nextMeta = {
        ...meta,
        lastError: msg,
        lastFailedAt: Date.now(),
      };
      if (isResourceExhaustedError(e)) {
        nextMeta.backoffUntilAt = Date.now() + HEARTBEAT_ERROR_BACKOFF_MS;
      }
      await setHeartbeatMeta(nextMeta);

      return {
        ok: false,
        mode: "js-sdk",
        path,
        reads: 0,
        writes: 0,
        error: msg,
        retryAt: nextMeta.backoffUntilAt || 0,
      };
    } finally {
      heartbeatInFlight = null;
    }
  })();

  return heartbeatInFlight;
}
