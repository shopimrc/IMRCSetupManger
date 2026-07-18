// app/services/cloudSync.js
// ✅ Local-first Firestore sync for IMRC Setup Manager 2.0
//
// Rules enforced here:
// - Vehicle / Track / Setup screens save to AsyncStorage only.
// - Screens should call markCloudDirty() or markItemDeletedForCloud() only; they must not call Firestore.
// - Autosave setup drafts stay local only and are excluded from the cloud payload.
// - Firestore reads/writes only happen inside this service.
// - No collection reads. We read the main backup doc and fixed chunk docs only:
//     users/{uid}/imrc/backup_main
//     users/{uid}/imrc/backup_payload_chunk_###
// - Pushes use a pre-write doc read when needed so another device's newer data is merged first.
// - Merges compare updatedAt-style timestamps and deletedAt tombstones.
// - Dynamic setup history/version keys are discovered and synced, while draft keys are excluded.
// - Saved setups/setup versions are capped at 10 per vehicleId + trackId combo.
// - V2 migration converts legacy local/cloud payloads, purges graveyard keys, and stamps schemaVersion.
// - Dashboard sync light can read local sync status without Firestore reads.
// - Cloud payload is chunked when it grows beyond Firestore's per-document limit.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { db, auth } from "./firebaseClient";
import { doc, getDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { migrateSetupsFromLegacyStorage } from "../../features/setups/lib/setupMigration";
import {
  beginSetupsMigrationProgress,
  updateSetupsMigrationProgress,
  finishSetupsMigrationProgress,
} from "../../features/setups/lib/setupMigrationProgress";

// -----------------------------------------------------------------------------
// Static + dynamic sync model
// -----------------------------------------------------------------------------
const BASE_SYNC_KEYS = [
  "@vehicles",
  "@tracks",
  "@setups",
  "@recentChanges_v1",
  "@raceDayHistory_v1",
  "@raceDayArchiveIndex_v1",
  "@raceDayNotesIndex_v1",
  "@raceDayCompareFields",
  "@raceDayTop5Fields_v1",
  "@raceDayActive_v1",
  "@raceDayEnded_v1",
  "@activeRaceDay",
  "@deleted_v1", // timestamp-aware tombstones
];

// Setup saved versions/history are now often stored per vehicleId + trackId.
// We sync these dynamic history/version keys, but never draft keys.
const DYNAMIC_SYNC_PREFIXES = [
  "@setupHistory_",
  "@setup_history_",
  "@setup_history_v1_",
  "@setupVersions_",
  "@setup_versions_",
  "@setup_versions_v1_",
  "@setupSavedVersions_",
  "@setup_saved_versions_",
  "@savedSetupVersions_",
  "@saved_setup_versions_",
  "@setupVersionHistory_",
  "@setup_version_history_",
];

const RACEDAY_DYNAMIC_SYNC_PREFIXES = [
  "@raceDayNotes_",
  "@raceDaySetupChanges_",
  "@raceDayChanges_",
  "@raceDayRuns_",
  "@raceDayResults_",
  "@raceDayArchive_",
  "@raceDayLineups_",
  "@raceDayPractice_",
  "@raceDayPracticeSelectedDay_",
];

// Old RaceDay aggregate keys are read during migration, converted into the
// new archive/per-event keys above, and then purged locally. Keep them out
// of BASE_SYNC_KEYS so future writes only use the new RaceDay storage model.
const LEGACY_RACEDAY_RUN_KEYS = ["@raceDayRuns_v1", "@raceDayRuns", "raceDayRuns"];
const LEGACY_RACEDAY_SESSION_KEYS = [
  "@raceDaySessions_v1",
  "@raceDaySessions",
  "raceDaySessions",
  "@raceDayHistory",
  "raceDayHistory",
  "@raceDayArchiveIndex",
  "raceDayArchiveIndex",
];
const LEGACY_RACEDAY_MAP_KEYS = {
  "@raceDayNotes": "@raceDayNotes_",
  raceDayNotes: "@raceDayNotes_",
  "@raceDaySetupChanges": "@raceDaySetupChanges_",
  raceDaySetupChanges: "@raceDaySetupChanges_",
  "@raceDayChanges": "@raceDayChanges_",
  raceDayChanges: "@raceDayChanges_",
  "@raceDayResults": "@raceDayResults_",
  raceDayResults: "@raceDayResults_",
  "@raceDayLineups": "@raceDayLineups_",
  raceDayLineups: "@raceDayLineups_",
  "@raceDayPractice": "@raceDayPractice_",
  raceDayPractice: "@raceDayPractice_",
  "@raceDayPracticeSelectedDay": "@raceDayPracticeSelectedDay_",
  raceDayPracticeSelectedDay: "@raceDayPracticeSelectedDay_",
};
const LEGACY_RACEDAY_EXACT_KEYS = [
  ...LEGACY_RACEDAY_RUN_KEYS,
  ...LEGACY_RACEDAY_SESSION_KEYS,
  ...Object.keys(LEGACY_RACEDAY_MAP_KEYS),
];

const LOCAL_ONLY_PREFIXES = [
  "@draft_setup_",
  "@setupDraft_",
  "@setup_draft_",
  "@draftSetup_",
];

const META_LOCAL_KEY = "@cloudSync_meta_v5";
const DIRTY_LOCAL_KEY = "@cloudSync_dirty_v1";
const DEVICE_ID_KEY = "@cloudSync_deviceId_v1";

const AUTO_SYNC_DEBOUNCE_MS = 12 * 1000;
const AUTO_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;

// Emergency write guards. These protect Firebase from queued-write storms caused by
// repeated renders/effects, bad network retries, or multiple screens requesting sync.
// Manual/device sync still goes through this same gate because the goal is to keep
// exactly one cloud write active at a time.
const CLOUD_WRITE_MIN_SPACING_MS = 60 * 1000;
const CLOUD_WRITE_ERROR_BACKOFF_MS = 10 * 60 * 1000;

const TOMBSTONE_KEEP_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_SETUPS_PER_VEHICLE_TRACK = 10;
const SETUP_CORNERS = ["LF", "RF", "LR", "RR"];

// -----------------------------------------------------------------------------
// Cloud payload format / future compression gate
// -----------------------------------------------------------------------------
// Small backups stay readable in backup_main.payload. Large backups are split into
// fixed payload chunk documents so Firestore's 1 MiB document limit cannot block
// vehicle/track/setup/RaceDay uploads. No collection query is used; backup_main
// stores the exact chunk document ids to read.
const CLOUD_PAYLOAD_ENCODING_JSON = "json-v1";
const CLOUD_PAYLOAD_ENCODING_JSON_CHUNKS = "json-chunks-v1";
const CLOUD_PAYLOAD_ENCODING_LZ_UTF16 = "lz-string-utf16-v1"; // reserved for future use
const CLOUD_PAYLOAD_COMPRESSED_ENABLED = false;
const CLOUD_PAYLOAD_CHUNKING_ENABLED = true;
const CLOUD_PAYLOAD_INLINE_MAX_BYTES = 650 * 1000;
const CLOUD_PAYLOAD_CHUNK_SIZE = 500 * 1000;
const CLOUD_PAYLOAD_CHUNK_DOC_PREFIX = "backup_payload_chunk_";
const CLOUD_PAYLOAD_MAX_STALE_CHUNKS_TO_CLEAN = 40;

const CLOUD_SCHEMA_VERSION = "2.1.3";
const LOCAL_SCHEMA_KEY = "@imrc_schema_version_v1";
const LOCAL_MIGRATION_LOG_KEY = "@imrc_v2_migration_log_v1";

// Setups 2.0 migration is a one-time user/account action. The migration can
// be requested from sign-in, manual sync, and push paths, so keep a UID-scoped
// done flag plus a short-lived running guard to stop duplicate popups/runs.
const SETUPS_CLOUD_MIGRATION_VERSION = "setups2_v1";
const SETUPS_CLOUD_MIGRATION_RUNNING_STALE_MS = 10 * 60 * 1000;

function safeMigrationUid(uid) {
  return String(uid || auth?.currentUser?.uid || "local")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, "_") || "local";
}

function setupsMigrationDoneKey(uid) {
  return `@imrc:setupsMigrationDone:${SETUPS_CLOUD_MIGRATION_VERSION}:${safeMigrationUid(uid)}`;
}

function setupsMigrationRunningKey(uid) {
  return `@imrc:setupsMigrationRunning:${SETUPS_CLOUD_MIGRATION_VERSION}:${safeMigrationUid(uid)}`;
}

async function isSetupsCloudMigrationDone(uid) {
  try {
    return (await AsyncStorage.getItem(setupsMigrationDoneKey(uid))) === "1";
  } catch {
    return false;
  }
}

async function markSetupsCloudMigrationDone(uid, details = {}) {
  try {
    await AsyncStorage.setItem(setupsMigrationDoneKey(uid), "1");
    await AsyncStorage.setItem(
      `${setupsMigrationDoneKey(uid)}:meta`,
      JSON.stringify({
        version: SETUPS_CLOUD_MIGRATION_VERSION,
        completedAt: new Date().toISOString(),
        completedAtMs: Date.now(),
        uid: safeMigrationUid(uid),
        ...details,
      })
    );
  } catch {}
}

async function tryStartSetupsCloudMigration(uid, reason = "setups-migration") {
  if (await isSetupsCloudMigrationDone(uid)) {
    return { ok: false, done: true, reason: "already-complete" };
  }

  const key = setupsMigrationRunningKey(uid);
  const now = Date.now();
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? safeJsonParse(raw, {}) : {};
    const startedAtMs = Number(parsed?.startedAtMs || 0) || 0;
    if (startedAtMs && now - startedAtMs < SETUPS_CLOUD_MIGRATION_RUNNING_STALE_MS) {
      return { ok: false, running: true, reason: "already-running", startedAtMs };
    }
    await AsyncStorage.setItem(key, JSON.stringify({ startedAtMs: now, reason: String(reason || "") }));
    return { ok: true, startedAtMs: now };
  } catch {
    return { ok: true, startedAtMs: now, storageGuardFailed: true };
  }
}

async function clearSetupsCloudMigrationRunning(uid) {
  try {
    await AsyncStorage.removeItem(setupsMigrationRunningKey(uid));
  } catch {}
}

// Legacy/common old storage names that can be converted into the V2 sync model.
// Keeping this list broad lets older installs upgrade without requiring old screens to run.
const LEGACY_KEY_ALIASES = {
  "@vehicles": ["@vehicleList", "@savedVehicles", "@vehicles_v1", "vehicles", "vehicleData", "savedVehicles"],
  "@tracks": ["@trackList", "@savedTracks", "@tracks_v1", "tracks", "trackData", "savedTracks"],
  "@setups": ["@setupList", "@savedSetups", "@setups_v1", "setups", "setupData", "savedSetups"],
  "@recentChanges_v1": ["@recentChanges", "recentChanges"],
  "@raceDayHistory_v1": ["@raceDayHistory", "raceDayHistory", "@raceDayArchiveIndex", "raceDayArchiveIndex"],
  "@raceDayNotesIndex_v1": ["@raceDayNotesIndex", "raceDayNotesIndex"],
  "@deleted_v1": ["@deleted", "@deletedItems", "deletedItems", "@tombstones", "tombstones"],
};

const LEGACY_SETUP_VERSION_KEYS = [
  "@setupHistory",
  "@setupHistory_v1",
  "@setup_history",
  "@setupVersions",
  "@setupVersions_v1",
  "@setup_versions",
  "@setupSavedVersions",
  "@setup_saved_versions",
  "@savedSetupVersions",
  "@saved_setup_versions",
];

const GRAVEYARD_EXACT_KEYS = [
  "@cloudSync_meta_v1",
  "@cloudSync_meta_v2",
  "@cloudSync_meta_v3",
  "@cloudSync_meta_v4",
  "@cloudSync_lastHash",
  "@cloudSync_lastSync",
  "@cloudSync_pending",
  "@syncCache",
  "@syncQueue",
  "@oldSyncQueue",
  "@migrationBackup_v1",
  "@migrationBackup_v2",
  ...Object.values(LEGACY_KEY_ALIASES).flat(),
  ...LEGACY_SETUP_VERSION_KEYS,
  ...LEGACY_RACEDAY_EXACT_KEYS,
];

const GRAVEYARD_PREFIXES = [
  "@old_",
  "@legacy_",
  "@graveyard_",
  "@tmp_",
  "@temp_",
  "@syncTemp_",
  "@cloudSync_tmp_",
  "@draft_setup_",
  "@setupDraft_",
  "@setup_draft_",
  "@draftSetup_",
];

let pendingTimer = null;
let pendingRequest = null;

// Whole-sync activity guard. This is separate from the cloud-write guard so
// Dashboard can show Syncing during reads/pulls too, and not turn green until
// the complete sync path finishes.
let syncInFlight = null;
let syncInFlightLabel = "";
let syncInFlightStartedAt = 0;

// Cloud write guard state. This must be module-level so all sync entry points
// share one write queue and cannot accidentally stack Firestore writes.
let cloudPushInFlight = null;
let cloudPushStartedAt = 0;

const statusListeners = new Set();

async function notifySyncStatusListeners() {
  const listeners = Array.from(statusListeners);
  for (const entry of listeners) {
    try {
      const status = await getCloudSyncStatus({ uid: entry.uid });
      entry.cb(status);
    } catch {}
  }
}

const syncCounters = {
  reads: 0,
  writes: 0,
  blockedAutoReads: 0,
};

function backupDocRef(uid) {
  return doc(db, `users/${uid}/imrc/backup_main`);
}

function hashString(str) {
  const s = String(str || "");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function safeJsonParse(raw, fallback) {
  try {
    if (raw === null || raw === undefined || raw === "") return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function stableStringify(obj) {
  if (obj === null) return "null";
  if (typeof obj !== "object") return JSON.stringify(obj);
  const seen = new WeakSet();
  const walk = (v) => {
    if (v === null) return "null";
    if (typeof v !== "object") return JSON.stringify(v);
    if (seen.has(v)) return '"[Circular]"';
    seen.add(v);
    if (Array.isArray(v)) return "[" + v.map(walk).join(",") + "]";
    const keys = Object.keys(v).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + walk(v[k])).join(",") + "}";
  };
  return walk(obj);
}

function getJsonByteLength(value) {
  try {
    return JSON.stringify(value || {}).length;
  } catch {
    return 0;
  }
}

function payloadChunkDocId(index) {
  return `${CLOUD_PAYLOAD_CHUNK_DOC_PREFIX}${String(index).padStart(3, "0")}`;
}

function payloadChunkDocRef(uid, chunkDocId) {
  return doc(db, `users/${uid}/imrc/${chunkDocId}`);
}

function splitStringIntoChunks(value, chunkSize = CLOUD_PAYLOAD_CHUNK_SIZE) {
  const text = String(value || "");
  const out = [];
  for (let i = 0; i < text.length; i += chunkSize) out.push(text.slice(i, i + chunkSize));
  return out.length ? out : [""];
}

function encodePayloadForCloudDoc(payload) {
  const safePayload = payload || {};
  const json = JSON.stringify(safePayload);
  const rawBytes = json.length;

  // Keep small backups easy to inspect in Firebase.
  if (!CLOUD_PAYLOAD_CHUNKING_ENABLED || rawBytes <= CLOUD_PAYLOAD_INLINE_MAX_BYTES) {
    return {
      payload: safePayload,
      payloadEncoding: CLOUD_PAYLOAD_ENCODING_JSON,
      payloadCompressed: null,
      payloadCodecVersion: 1,
      payloadBytesRaw: rawBytes,
      payloadBytesStored: rawBytes,
      payloadChunked: false,
      payloadChunkCount: 0,
      payloadChunkDocIds: [],
      __payloadChunks: null,
      compressionReady: true,
      compressionEnabled: false,
    };
  }

  // Large backups must not be written into backup_main.payload because Firestore
  // rejects any document above 1 MiB. Store the JSON payload in fixed chunk docs,
  // and keep only a small manifest on backup_main.
  const chunks = splitStringIntoChunks(json, CLOUD_PAYLOAD_CHUNK_SIZE);
  const chunkDocIds = chunks.map((_, index) => payloadChunkDocId(index));

  return {
    payload: null,
    payloadEncoding: CLOUD_PAYLOAD_ENCODING_JSON_CHUNKS,
    payloadCompressed: null,
    payloadCodecVersion: 1,
    payloadBytesRaw: rawBytes,
    payloadBytesStored: rawBytes,
    payloadChunked: true,
    payloadChunkCount: chunks.length,
    payloadChunkSize: CLOUD_PAYLOAD_CHUNK_SIZE,
    payloadChunkDocIds: chunkDocIds,
    __payloadChunks: chunks,
    compressionReady: true,
    compressionEnabled: false,
  };
}

function isLegacyCloudPayloadKey(key) {
  const k = String(key || "");
  if (!k) return false;
  if (Object.values(LEGACY_KEY_ALIASES).flat().includes(k)) return true;
  if (LEGACY_SETUP_VERSION_KEYS.includes(k)) return true;
  if (LEGACY_RACEDAY_EXACT_KEYS.includes(k)) return true;
  return false;
}

function extractDirectPayloadFromCloudDoc(data) {
  const docData = data && typeof data === "object" ? data : {};
  const out = {};

  for (const [key, value] of Object.entries(docData)) {
    // Newer docs store everything inside `payload`, but older/debug builds may
    // have written AsyncStorage keys directly on backup_main. Keep supporting
    // those so old accounts can restore instead of looking empty.
    if (isSyncKey(key) || isLegacyCloudPayloadKey(key)) out[key] = value;
  }

  return out;
}

function decodePayloadFromCloudDoc(data) {
  const docData = data && typeof data === "object" ? data : {};
  const encoding = String(docData.payloadEncoding || "").trim();
  const directPayload = extractDirectPayloadFromCloudDoc(docData);
  const hasDirectPayload = Object.keys(directPayload).length > 0;

  // Existing / legacy cloud docs.
  if (docData.payload && typeof docData.payload === "object") {
    return {
      // Payload wins when both formats exist, but direct top-level keys are kept
      // as a recovery source for older backup documents.
      payload: hasDirectPayload ? { ...directPayload, ...(docData.payload || {}) } : docData.payload || {},
      encoding: encoding || CLOUD_PAYLOAD_ENCODING_JSON,
      compressed: false,
      needsRewrite: encoding !== CLOUD_PAYLOAD_ENCODING_JSON || !!docData.payloadCompressed || hasDirectPayload,
    };
  }

  // Future compressed cloud docs. This branch is intentionally centralized so
  // compression can be added later without screen changes.
  if (docData.payloadCompressed) {
    if (encoding === CLOUD_PAYLOAD_ENCODING_LZ_UTF16) {
      // Future hook:
      // const raw = LZString.decompressFromUTF16(String(docData.payloadCompressed || ""));
      // return { payload: raw ? JSON.parse(raw) : {}, encoding, compressed: true, needsRewrite: false };
      throw new Error(
        "[CloudSync] This backup uses compressed payloads, but this build does not include the compression codec yet."
      );
    }

    throw new Error(`[CloudSync] Unsupported cloud payload encoding: ${encoding || "unknown"}`);
  }

  return {
    payload: directPayload,
    encoding: encoding || CLOUD_PAYLOAD_ENCODING_JSON,
    compressed: false,
    needsRewrite: hasDirectPayload,
  };
}

async function decodePayloadFromCloudDocAsync(uid, data) {
  const docData = data && typeof data === "object" ? data : {};
  const encoding = String(docData.payloadEncoding || "").trim();
  const chunked = !!docData.payloadChunked || encoding === CLOUD_PAYLOAD_ENCODING_JSON_CHUNKS;

  if (!chunked) return decodePayloadFromCloudDoc(docData);

  const directPayload = extractDirectPayloadFromCloudDoc(docData);
  const hasDirectPayload = Object.keys(directPayload).length > 0;
  const ids = Array.isArray(docData.payloadChunkDocIds)
    ? docData.payloadChunkDocIds.map((id) => String(id || "").trim()).filter(Boolean)
    : Array.from({ length: Number(docData.payloadChunkCount || 0) || 0 }, (_, index) => payloadChunkDocId(index));

  if (!uid || !ids.length) {
    return {
      payload: hasDirectPayload ? directPayload : {},
      encoding: CLOUD_PAYLOAD_ENCODING_JSON_CHUNKS,
      compressed: false,
      chunked: true,
      needsRewrite: true,
    };
  }

  const parts = [];
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const snap = await getDoc(payloadChunkDocRef(uid, id));
    logRead(`payloadChunk:${id}`);
    if (!snap.exists()) {
      throw new Error(`[CloudSync] Missing cloud payload chunk ${id}`);
    }
    const chunkData = snap.data() || {};
    parts.push(String(chunkData.chunk || ""));
  }

  const json = parts.join("");
  const parsed = safeJsonParse(json, {});

  return {
    payload: hasDirectPayload ? { ...directPayload, ...(parsed || {}) } : parsed || {},
    encoding: CLOUD_PAYLOAD_ENCODING_JSON_CHUNKS,
    compressed: false,
    chunked: true,
    needsRewrite: hasDirectPayload,
  };
}

function lowerKey(key) {
  return String(key || "").toLowerCase();
}

function isLocalOnlyKey(key) {
  const k = String(key || "");
  const l = lowerKey(k);
  if (LOCAL_ONLY_PREFIXES.some((p) => k.startsWith(p))) return true;

  // Any setup draft/autosave key must stay local-only.
  if (l.includes("setup") && (l.includes("draft") || l.includes("autosave"))) return true;
  return false;
}

function isDynamicSetupHistoryKey(key) {
  const k = String(key || "");
  // Legacy non-parameterized history/version buckets are converted into
  // @setupHistory_{vehicleId}_{trackId} and then purged.
  if (LEGACY_SETUP_VERSION_KEYS.includes(k)) return false;
  if (DYNAMIC_SYNC_PREFIXES.some((p) => k.startsWith(p))) return true;

  // Fallback for future names, as long as it is clearly a setup saved-history/version key.
  const l = lowerKey(k);
  return (
    k.startsWith("@") &&
    l.includes("setup") &&
    (l.includes("history") || l.includes("version") || l.includes("saved")) &&
    !isLocalOnlyKey(k)
  );
}

function isDynamicRaceDayArchiveKey(key) {
  const k = String(key || "");
  if (!k || isLocalOnlyKey(k)) return false;
  if (LEGACY_RACEDAY_EXACT_KEYS.includes(k)) return false;
  return RACEDAY_DYNAMIC_SYNC_PREFIXES.some((p) => k.startsWith(p));
}

function isSyncKey(key) {
  const k = String(key || "");
  if (!k || isLocalOnlyKey(k)) return false;
  if (BASE_SYNC_KEYS.includes(k)) return true;
  if (isDynamicSetupHistoryKey(k)) return true;
  if (isDynamicRaceDayArchiveKey(k)) return true;
  return false;
}

async function discoverLocalSyncKeys(extraPayload = null) {
  const set = new Set(BASE_SYNC_KEYS);

  try {
    const keys = await AsyncStorage.getAllKeys();
    for (const key of Array.isArray(keys) ? keys : []) {
      if (isSyncKey(key)) set.add(key);
    }
  } catch {}

  if (extraPayload && typeof extraPayload === "object") {
    for (const key of Object.keys(extraPayload)) {
      if (isSyncKey(key)) set.add(key);
    }
  }

  return Array.from(set).sort();
}

function logRead(label, count = 1) {
  syncCounters.reads += count;
  console.log(`[CloudSync READ] ${label}`, { count, totalReads: syncCounters.reads });
}

function logWrite(label, count = 1) {
  syncCounters.writes += count;
  console.log(`[CloudSync WRITE] ${label}`, { count, totalWrites: syncCounters.writes });
}

export function getCloudSyncDebugStats() {
  return { ...syncCounters };
}

export function resetCloudSyncDebugStats() {
  syncCounters.reads = 0;
  syncCounters.writes = 0;
  syncCounters.blockedAutoReads = 0;
}

async function getMeta() {
  try {
    const raw = await AsyncStorage.getItem(META_LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setMeta(next) {
  try {
    await AsyncStorage.setItem(META_LOCAL_KEY, JSON.stringify(next || {}));
  } catch {}
  notifySyncStatusListeners();
}

async function getDirtyState() {
  try {
    const raw = await AsyncStorage.getItem(DIRTY_LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setDirtyState(next) {
  try {
    await AsyncStorage.setItem(DIRTY_LOCAL_KEY, JSON.stringify(next || {}));
  } catch {}
  notifySyncStatusListeners();
}

async function clearDirtyState(extra = {}) {
  const prev = await getDirtyState();
  await setDirtyState({
    ...prev,
    dirty: false,
    reasons: [],
    keys: [],
    entities: [],
    clearedAtMs: Date.now(),
    ...extra,
  });
}

async function getDeviceId() {
  try {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (id) return id;
    id = `dev_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev_unknown_${Date.now().toString(16)}`;
  }
}

function getAnyId(item) {
  if (!item || typeof item !== "object") return null;
  const candidates = [item.id, item.setupId, item.versionId, item.runId, item.sessionId, item._id, item.uuid];
  for (const c of candidates) {
    if (c === null || c === undefined) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return null;
}

const SYNC_META_FIELDS = new Set([
  "syncUpdatedAt",
  "syncDeviceId",
  "syncDeletedAt",
  "cloudUpdatedAt",
  "cloudSyncedAt",
]);

function stripSyncFieldsForFingerprint(value) {
  if (Array.isArray(value)) return value.map(stripSyncFieldsForFingerprint);
  if (!value || typeof value !== "object") return value;

  const out = {};
  for (const k of Object.keys(value)) {
    if (SYNC_META_FIELDS.has(k)) continue;
    out[k] = stripSyncFieldsForFingerprint(value[k]);
  }
  return out;
}

function fingerprint(item) {
  return hashString(stableStringify(stripSyncFieldsForFingerprint(item)));
}

function getTimestampMs(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === "object") {
    if (typeof value.toMillis === "function") {
      try {
        const n = value.toMillis();
        if (Number.isFinite(n)) return n;
      } catch {}
    }
    if (typeof value.seconds === "number") return value.seconds * 1000;
  }
  return 0;
}

function getItemUpdatedAt(item) {
  if (!item || typeof item !== "object") return 0;
  const candidates = [
    item.syncUpdatedAt,
    item.updatedAtMs,
    item.updatedAt,
    item.modifiedAtMs,
    item.modifiedAt,
    item.savedAtMs,
    item.savedAt,
    item.createdAtMs,
    item.createdAt,
    item.ts,
  ];
  for (const c of candidates) {
    const n = getTimestampMs(c);
    if (n) return n;
  }
  return 0;
}

function inferArrayTypeForKey(key) {
  const k = String(key || "");
  if (k === "@vehicles") return "vehicle";
  if (k === "@tracks") return "track";
  if (k === "@setups") return "setup";
  if (k === "@raceDayHistory_v1" || k === "@raceDayArchiveIndex_v1") return "raceDayArchive";
  if (k === "@raceDayNotesIndex_v1") return "raceDayNoteIndex";
  if (k.startsWith("@raceDayRuns_")) return "run";
  if (k.startsWith("@raceDayLineups_")) return "raceDayLineup";
  if (k.startsWith("@raceDaySetupChanges_") || k.startsWith("@raceDayChanges_")) return "raceDayChange";
  if (k.startsWith("@raceDayResults_")) return "raceDayResult";
  if (isDynamicSetupHistoryKey(k)) return "setupVersion";
  return "item";
}

function tombstoneMapKey(t) {
  const type = String(t?.type || "").trim();
  const id = String(t?.id || "").trim();
  const key = String(t?.key || "").trim();
  if (!type || !id) return "";
  return `${type}:${key}:${id}`;
}

function normalizeTombstones(arr) {
  const list = Array.isArray(arr) ? arr : [];
  const map = new Map();
  for (const t of list) {
    const type = String(t?.type || "").trim();
    const id = String(t?.id || "").trim();
    if (!type || !id) continue;
    const key = String(t?.key || "").trim();
    const deletedAt = getTimestampMs(t?.deletedAt) || 0;
    const deviceId = String(t?.deviceId || "").trim();
    const mapKey = `${type}:${key}:${id}`;
    const prev = map.get(mapKey);
    if (!prev || deletedAt > Number(prev.deletedAt || 0)) {
      map.set(mapKey, { type, id, key, deletedAt, deviceId });
    }
  }
  return Array.from(map.values());
}

function mergeTombstones(localArr, cloudArr) {
  return normalizeTombstones([
    ...(Array.isArray(cloudArr) ? cloudArr : []),
    ...(Array.isArray(localArr) ? localArr : []),
  ]);
}

function buildTombstoneLookup(tombs) {
  const byExact = new Map();
  const byLoose = new Map();

  for (const t of normalizeTombstones(tombs)) {
    const exact = tombstoneMapKey(t);
    if (exact) byExact.set(exact, t);

    const loose = `${String(t.type || "")}:${String(t.id || "")}`;
    const prev = byLoose.get(loose);
    if (!prev || Number(t.deletedAt || 0) > Number(prev.deletedAt || 0)) byLoose.set(loose, t);
  }

  return { byExact, byLoose };
}

function getTombstoneForItem({ lookup, type, key, id }) {
  if (!lookup || !type || !id) return null;

  const exact = lookup.byExact.get(`${type}:${String(key || "")}:${String(id)}`);
  if (exact) return exact;

  // Global tombstones without a key can apply to normal app arrays.
  const globalExact = lookup.byExact.get(`${type}::${String(id)}`);
  if (globalExact) return globalExact;

  return null;
}

function mergeArrayById(localArr, cloudArr) {
  const local = Array.isArray(localArr) ? localArr : [];
  const cloud = Array.isArray(cloudArr) ? cloudArr : [];
  const byKey = new Map();

  for (const item of cloud) {
    const id = getAnyId(item);
    const key = id ? `id:${id}` : `fp:${fingerprint(item)}`;
    byKey.set(key, item);
  }

  for (const item of local) {
    const id = getAnyId(item);
    const key = id ? `id:${id}` : `fp:${fingerprint(item)}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, item);
      continue;
    }

    const cloudUpdated = getItemUpdatedAt(existing);
    const localUpdated = getItemUpdatedAt(item);

    if (cloudUpdated || localUpdated) byKey.set(key, localUpdated >= cloudUpdated ? item : existing);
    else byKey.set(key, { ...existing, ...item });
  }

  return Array.from(byKey.values());
}

function mergeJsonObjectsByUpdatedAt(localObj, cloudObj) {
  const localUpdated = getItemUpdatedAt(localObj);
  const cloudUpdated = getItemUpdatedAt(cloudObj);

  if (localUpdated || cloudUpdated) return localUpdated >= cloudUpdated ? localObj : cloudObj;
  return { ...(cloudObj || {}), ...(localObj || {}) };
}

function mergePayloadValue(localStr, cloudStr, key) {
  const CLEARABLE_KEYS = new Set([
    "@activeRaceDay",
    "@raceDayActive_v1",
    "@raceDayEnded_v1",
    "@recentChanges_v1",
  ]);

  if (key === "@deleted_v1") {
    return JSON.stringify(
      mergeTombstones(
        safeJsonParse(localStr || "[]", []),
        safeJsonParse(cloudStr || "[]", [])
      )
    );
  }

  const localParsed = safeJsonParse(localStr, undefined);
  const cloudParsed = safeJsonParse(cloudStr, undefined);

  if (Array.isArray(localParsed) || Array.isArray(cloudParsed)) {
    return JSON.stringify(
      mergeArrayById(
        Array.isArray(localParsed) ? localParsed : [],
        Array.isArray(cloudParsed) ? cloudParsed : []
      )
    );
  }

  if (
    localParsed &&
    typeof localParsed === "object" &&
    cloudParsed &&
    typeof cloudParsed === "object"
  ) {
    return JSON.stringify(mergeJsonObjectsByUpdatedAt(localParsed, cloudParsed));
  }

  if (CLEARABLE_KEYS.has(key)) {
    return localStr === null || localStr === undefined
      ? String(cloudStr ?? "")
      : String(localStr ?? "");
  }

  const localText = String(localStr ?? "").trim();
  return localText ? String(localStr) : String(cloudStr ?? "");
}

function applyTombstonesToPayload(payload) {
  const next = { ...(payload || {}) };
  const tombs = normalizeTombstones(safeJsonParse(next["@deleted_v1"] || "[]", []));
  const lookup = buildTombstoneLookup(tombs);

  for (const key of Object.keys(next)) {
    if (!isSyncKey(key) || key === "@deleted_v1") continue;

    const arr = safeJsonParse(next[key], null);
    if (!Array.isArray(arr)) continue;

    const type = inferArrayTypeForKey(key);
    const filtered = arr.filter((item) => {
      const id = getAnyId(item);
      if (!id) return true;

      const tomb = getTombstoneForItem({ lookup, type, key, id });
      if (!tomb) return true;

      const itemUpdated = getItemUpdatedAt(item);
      const deletedAt = Number(tomb.deletedAt || 0) || 0;

      // Delete wins if it is newer than the item. If the item has no timestamp,
      // delete wins so an old device cannot resurrect it.
      return itemUpdated > deletedAt;
    });

    next[key] = JSON.stringify(filtered);
  }

  next["@deleted_v1"] = JSON.stringify(tombs);
  return next;
}

function pruneExpiredTombstones(payload) {
  const next = { ...(payload || {}) };
  const cutoff = Date.now() - TOMBSTONE_KEEP_MS;
  const tombs = normalizeTombstones(safeJsonParse(next["@deleted_v1"] || "[]", []));
  next["@deleted_v1"] = JSON.stringify(
    tombs.filter((t) => (Number(t.deletedAt || 0) || 0) >= cutoff)
  );
  return next;
}

function sanitizeRecentChangesArray(input) {
  const arr = Array.isArray(input) ? input : [];
  const cleaned = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const text = String(x.text ?? x.title ?? x.label ?? "").trim();
    const type = String(x.type ?? "").trim();
    const ts = Number(x.ts ?? x.atMs ?? x.timeMs ?? x.createdAtMs ?? 0) || 0;
    const raceDayId = String(x.raceDayId ?? x.sessionId ?? x.id ?? "").trim();
    if (!text && !type && !ts && !raceDayId) continue;
    cleaned.push({ ...x, text, type, ts, raceDayId });
  }
  cleaned.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  return cleaned;
}

function isTruthyStoredFlag(value) {
  const t = String(value ?? "").trim().toLowerCase();
  return !!t && t !== "0" && t !== "false" && t !== "null" && t !== "undefined" && t !== "[]" && t !== "{}";
}

function raceDaySortMs(item = {}) {
  return (
    getTimestampMs(item?.endedAtMs) ||
    getTimestampMs(item?.updatedAtMs) ||
    getTimestampMs(item?.startedAtMs) ||
    getTimestampMs(item?.syncUpdatedAt) ||
    getTimestampMs(item?.endedAt) ||
    getTimestampMs(item?.updatedAt) ||
    getTimestampMs(item?.startedAt) ||
    0
  );
}

function pruneRaceDayHistoryPerTrack(history = [], maxPerTrack = 3) {
  const byTrack = new Map();
  for (const item of Array.isArray(history) ? history : []) {
    if (!item || typeof item !== "object") continue;
    const normalized = normalizeRaceDayHistoryEntry(item);
    const trackKey = firstNonEmpty(normalized.trackId, "__unknown__");
    if (!byTrack.has(trackKey)) byTrack.set(trackKey, []);
    byTrack.get(trackKey).push(normalized);
  }

  const kept = [];
  for (const [, bucket] of byTrack.entries()) {
    bucket.sort((a, b) => raceDaySortMs(b) - raceDaySortMs(a));
    kept.push(...bucket.slice(0, maxPerTrack));
  }

  return kept.sort((a, b) => raceDaySortMs(b) - raceDaySortMs(a)).slice(0, 500);
}

function normalizeRaceDayPayload(payload) {
  const next = { ...(payload || {}) };

  try {
    const changes = safeJsonParse(next["@recentChanges_v1"] || "[]", []);
    next["@recentChanges_v1"] = JSON.stringify(sanitizeRecentChangesArray(changes));
  } catch {
    next["@recentChanges_v1"] = "[]";
  }

  try {
    const historyRaw = safeJsonParse(next["@raceDayHistory_v1"] || "[]", []);
    let history = pruneRaceDayHistoryPerTrack(Array.isArray(historyRaw) ? historyRaw : [], 3);

    const activeRaw = next["@raceDayActive_v1"] || next["@activeRaceDay"] || "";
    const activeObj = safeJsonParse(activeRaw, null);
    const activeId = raceDayKeySafe(firstNonEmpty(activeObj?.id, activeObj?.raceDayId, activeObj?.sessionId));
    const endedFlagSet = isTruthyStoredFlag(next["@raceDayEnded_v1"]);

    if (activeId && endedFlagSet) {
      const endedAt = new Date().toISOString();
      const entry = normalizeRaceDayHistoryEntry({
        ...(activeObj || {}),
        id: activeId,
        raceDayId: activeId,
        status: "ended",
        endedAt: activeObj?.endedAt || endedAt,
        updatedAt: endedAt,
        updatedAtMs: Date.now(),
        syncUpdatedAt: Date.now(),
      });
      history = pruneRaceDayHistoryPerTrack([entry, ...history.filter((h) => raceDayKeySafe(h?.raceDayId || h?.id) !== activeId)], 3);
      next["@raceDayActive_v1"] = "";
      next["@activeRaceDay"] = "";
      next["@raceDayEnded_v1"] = "1";
    } else if (activeId) {
      const alreadyEnded = history.some(
        (h) => raceDayKeySafe(h?.raceDayId || h?.id || h?.sessionId) === activeId && String(h?.status || "").toLowerCase() === "ended"
      );

      if (alreadyEnded) {
        next["@raceDayActive_v1"] = "";
        next["@activeRaceDay"] = "";
        next["@raceDayEnded_v1"] = "1";
      } else {
        next["@raceDayEnded_v1"] = "";
        const canon = JSON.stringify({ ...(activeObj || {}), id: activeId, raceDayId: activeId });
        next["@raceDayActive_v1"] = canon;
        next["@activeRaceDay"] = canon;
      }
    }

    next["@raceDayHistory_v1"] = JSON.stringify(history);
    const keepIds = new Set(history.map((h) => raceDayKeySafe(h?.raceDayId || h?.id || h?.sessionId)).filter(Boolean));
    if (activeId) keepIds.add(activeId);

    // Remove detail payloads for RaceDays outside the retained three-per-track
    // set. Because the cloud backup document is rewritten from this payload,
    // these keys are removed from both the phone and Firebase on the next sync.
    const raceDayDetailPrefixes = [
      "@raceDayNotes_",
      "@raceDaySetupChanges_",
      "@raceDayChanges_",
      "@raceDayRuns_",
      "@raceDayResults_",
      "@raceDayArchive_",
      "@raceDayLineups_",
      "@raceDayPractice_",
      "@raceDayPracticeSelectedDay_",
    ];
    for (const payloadKey of Object.keys(next)) {
      const prefix = raceDayDetailPrefixes.find((candidate) => payloadKey.startsWith(candidate));
      if (!prefix) continue;
      const detailId = raceDayKeySafe(payloadKey.slice(prefix.length));
      if (detailId && !keepIds.has(detailId)) delete next[payloadKey];
    }

    // Keep the notes index aligned with archived RaceDays.
    const notesIndex = safeJsonParse(next["@raceDayNotesIndex_v1"] || "[]", []);
    if (Array.isArray(notesIndex)) {
      next["@raceDayNotesIndex_v1"] = JSON.stringify(
        normalizeArrayForKey(notesIndex, "@raceDayNotesIndex_v1")
          .filter((item) => !keepIds.size || keepIds.has(raceDayKeySafe(item?.raceDayId || item?.id || item?.sessionId)))
          .slice(0, 500)
      );
    }

    const recentChanges = sanitizeRecentChangesArray(safeJsonParse(next["@recentChanges_v1"] || "[]", []));
    next["@recentChanges_v1"] = JSON.stringify(
      recentChanges.filter((c) => {
        const sid = raceDayKeySafe(c?.raceDayId || c?.sessionId || "");
        return !sid || sid === "active" || !keepIds.size || keepIds.has(sid);
      })
    );
  } catch {
    next["@raceDayHistory_v1"] = next["@raceDayHistory_v1"] || "[]";
    next["@raceDayNotesIndex_v1"] = next["@raceDayNotesIndex_v1"] || "[]";
  }

  // Strict V2.0.1 cleanup: old aggregate RaceDay keys are conversion-only.
  for (const legacyKey of LEGACY_RACEDAY_EXACT_KEYS) {
    if (legacyKey in next) delete next[legacyKey];
  }

  return next;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const t = cleanText(v);
    if (t) return t;
  }
  return "";
}


function firstSetupText(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim()) || "";
}

function isPanCarSetupLike(item = {}) {
  const profile = item?.chassisProfile || item?.setupProfile || {};
  const text = [
    profile?.layoutFamily,
    profile?.driveType,
    profile?.layoutKey,
    profile?.id,
    profile?.label,
    item?.vehicleChassisStyle,
    item?.chassisStyle,
    item?.chassisProfileId,
    item?.setupProfileId,
    item?.vehicleStyle,
    item?.vehicleType,
    item?.className,
    item?.vehicleName,
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase();

  return /pan\s*car|pancar|oval\s*pan|oval\s*car|1\/12|12th|world\s*gt|\bwgt\b|crc|associated\s*rc10r5|rc10r5|rc10r6|rc10r6\.2|crc\s*ck/.test(text);
}

function setIfBlankField(target, key, value) {
  if (!target || !key) return;
  if (target[key] !== undefined && target[key] !== null && String(target[key]).trim()) return;
  if (value === undefined || value === null || !String(value).trim()) return;
  target[key] = value;
}

function stripSetupKeys(target, keys) {
  if (!target || typeof target !== "object") return target;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(target, key)) delete target[key];
  }
  return target;
}

function mergeNestedSetupCorners(existing = {}, childKeys = ["top", "bottom"]) {
  const out = {};
  for (const corner of SETUP_CORNERS) {
    out[corner] = { ...(existing?.[corner] || {}) };
    for (const key of childKeys) {
      if (out[corner][key] === undefined || out[corner][key] === null) out[corner][key] = "";
    }
  }
  return out;
}

function makeSetupCornerMapFromLegacy(section = {}, existing = {}, suffixes = [], prefixes = []) {
  const next = { ...(existing || {}) };
  for (const corner of SETUP_CORNERS) {
    const lower = corner.toLowerCase();
    const keys = [];
    for (const suffix of suffixes) {
      keys.push(`${lower}${suffix}`);
      keys.push(`${corner}${suffix}`);
    }
    for (const prefix of prefixes) {
      keys.push(`${prefix}${corner}`);
      keys.push(`${prefix}${lower}`);
    }
    setIfBlankField(next, corner, firstSetupText(...keys.map((key) => section?.[key])));
  }
  return next;
}

function makeSetupNestedCornerMapFromLegacy(section = {}, existing = {}, topPatterns = [], bottomPatterns = []) {
  const next = mergeNestedSetupCorners(existing, ["top", "bottom"]);
  for (const corner of SETUP_CORNERS) {
    const lower = corner.toLowerCase();
    const topKeys = topPatterns.map((pattern) => pattern.replace("{C}", corner).replace("{c}", lower));
    const bottomKeys = bottomPatterns.map((pattern) => pattern.replace("{C}", corner).replace("{c}", lower));
    setIfBlankField(next[corner], "top", firstSetupText(...topKeys.map((key) => section?.[key])));
    setIfBlankField(next[corner], "bottom", firstSetupText(...bottomKeys.map((key) => section?.[key])));
  }
  return next;
}

function normalizeLegacySetupFields(item = {}) {
  if (!item || typeof item !== "object") return item;

  const next = { ...item };

  const gearing = { ...(item.gearing || {}) };
  setIfBlankField(gearing, "spur", firstSetupText(gearing.spur, item.spur, item.spurGear));
  setIfBlankField(gearing, "pinion", firstSetupText(gearing.pinion, item.pinion, item.pinionGear));
  setIfBlankField(gearing, "tireDiameter", firstSetupText(gearing.tireDiameter, gearing.tireDia, gearing.tireDiameterIn, gearing.rolloutTireDiameter, item.tireDiameter, item.tireDia));
  setIfBlankField(gearing, "transmissionRatio", firstSetupText(gearing.transmissionRatio, gearing.transRatio, gearing.internalRatio, item.transmissionRatio, item.transRatio, item.internalRatio));
  setIfBlankField(gearing, "rollout", firstSetupText(gearing.rollout, gearing.rollOut, item.rollout, item.rollOut));
  setIfBlankField(
    gearing,
    "targetRollout",
    firstSetupText(gearing.targetRollout, gearing.targetRolloutIn, gearing.rolloutTarget, gearing.target, item.targetRollout, item.targetRolloutIn, item.rolloutTarget)
  );
  stripSetupKeys(gearing, ["tireDia", "tireDiameterIn", "rolloutTireDiameter", "transRatio", "internalRatio", "rollOut", "targetRolloutIn", "rolloutTarget"]);
  next.gearing = gearing;

  const tires = { ...(item.tires || {}) };
  for (const corner of SETUP_CORNERS) {
    const lower = corner.toLowerCase();
    setIfBlankField(tires, corner, firstSetupText(tires[corner], tires[lower], item[`${lower}Tire`], item[`${corner}Tire`], item[`tire${corner}`]));
    if (Object.prototype.hasOwnProperty.call(tires, lower)) delete tires[lower];
  }

  const tireLegacySource = { ...item, ...tires };
  tires.compound = makeSetupCornerMapFromLegacy(
    tireLegacySource,
    tires.compound || tires.tireCompound || {},
    ["TireCompound", "Compound"],
    ["tireCompound", "compound"]
  );
  tires.size = makeSetupCornerMapFromLegacy(
    tireLegacySource,
    tires.size || tires.tireSize || {},
    ["TireSize", "Size"],
    ["tireSize", "size"]
  );
  tires.camberCut = makeSetupCornerMapFromLegacy(
    tireLegacySource,
    tires.camberCut || tires.tireCamberCut || {},
    ["CamberCut", "TireCamberCut"],
    ["camberCut", "tireCamberCut"]
  );

  // PanCar no longer shows a separate corner Tire field. Preserve old Tire
  // values by copying them into Compound only for PanCar-style setups.
  if (isPanCarSetupLike(item)) {
    for (const corner of SETUP_CORNERS) {
      setIfBlankField(tires.compound, corner, firstSetupText(tires.compound?.[corner], tires?.[corner]));
      tires[corner] = "";
    }
  }

  stripSetupKeys(tires, ["tireCompound", "tireSize", "tireCamberCut"]);
  next.tires = tires;

  const suspension = { ...(item.suspension || {}) };
  const suspensionLegacySource = { ...item, ...suspension };
  suspension.springs = makeSetupCornerMapFromLegacy(suspensionLegacySource, suspension.springs, ["Spring"], ["spring"]);
  suspension.springPreload = makeSetupCornerMapFromLegacy(suspensionLegacySource, suspension.springPreload, ["SpringPreload", "Preload"], ["springPreload", "preload"]);
  suspension.springLength = makeSetupCornerMapFromLegacy(
    suspensionLegacySource,
    suspension.springLength,
    ["SpringLength", "SpringLen", "ShockOverallLength", "ShockLengthOverall"],
    ["springLength", "springLen", "shockOverallLength", "shockLengthOverall"]
  );
  suspension.outsideShockPosition = makeSetupCornerMapFromLegacy(
    suspensionLegacySource,
    suspension.outsideShockPosition,
    ["OutsideShockPosition", "OutsideShock", "ShockOutsidePosition", "ShockOutside"],
    ["outsideShockPosition", "outsideShock", "shockOutsidePosition", "shockOutside"]
  );
  suspension.axleShims = makeSetupCornerMapFromLegacy(
    suspensionLegacySource,
    suspension.axleShims,
    ["AxleShims", "AxleShim", "RearAxleShims", "RearAxleShim"],
    ["axleShims", "axleShim", "rearAxleShims", "rearAxleShim"]
  );
  suspension.oil = makeSetupCornerMapFromLegacy(suspensionLegacySource, suspension.oil, ["Oil"], ["oil"]);
  suspension.damper = makeSetupCornerMapFromLegacy(suspensionLegacySource, suspension.damper, ["Damper", "Tube", "Hole"], ["damper", "tube", "hole"]);
  suspension.rideHeight = makeSetupCornerMapFromLegacy(suspensionLegacySource, suspension.rideHeight, ["Height", "RideHeight"], ["height", "rideHeight"]);
  suspension.droop = makeSetupCornerMapFromLegacy(suspensionLegacySource, suspension.droop, ["Droop", "Sag", "SagDroop"], ["droop", "sag", "sagDroop"]);
  suspension.shockPosition = makeSetupNestedCornerMapFromLegacy(
    suspension,
    suspension.shockPosition,
    ["{c}Top", "{C}Top", "{c}ShockTop", "{C}ShockTop", "shockTop{C}", "shockTop{c}"],
    ["{c}Bottom", "{C}Bottom", "{c}ShockBottom", "{C}ShockBottom", "shockBottom{C}", "shockBottom{c}"]
  );
  suspension.wheelHubKingpinPosition = makeSetupNestedCornerMapFromLegacy(
    suspension,
    suspension.wheelHubKingpinPosition,
    ["hubTop{C}", "hubTop{c}", "{c}HubTop", "{C}HubTop", "{c}KingpinTop", "{C}KingpinTop"],
    ["hubBottom{C}", "hubBottom{c}", "{c}HubBottom", "{C}HubBottom", "{c}KingpinBottom", "{C}KingpinBottom"]
  );
  suspension.centerShockPosition = { ...(suspension.centerShockPosition || {}) };
  setIfBlankField(suspension.centerShockPosition, "front", firstSetupText(suspension.centerFront, suspension.centerShockFront, suspension.shockCenterFront));
  setIfBlankField(suspension.centerShockPosition, "rear", firstSetupText(suspension.centerRear, suspension.centerShockRear, suspension.shockCenterRear));
  setIfBlankField(
    suspension.centerShockPosition,
    "frontChassisPosition",
    firstSetupText(
      suspension.centerShockPosition?.frontChassisPosition,
      suspension.centerShockFrontChassisPosition,
      suspension.centerFrontChassisPosition,
      item.centerShockFrontChassisPosition,
      item.centerFrontChassisPosition,
      suspension.centerShockPosition?.front,
      suspension.centerFront,
      suspension.centerShockFront
    )
  );
  setIfBlankField(
    suspension.centerShockPosition,
    "frontTowerPosition",
    firstSetupText(
      suspension.centerShockPosition?.frontTowerPosition,
      suspension.centerShockFrontTowerPosition,
      suspension.centerFrontTowerPosition,
      item.centerShockFrontTowerPosition,
      item.centerFrontTowerPosition
    )
  );
  setIfBlankField(
    suspension.centerShockPosition,
    "rearShims",
    firstSetupText(
      suspension.centerShockPosition?.rearShims,
      suspension.centerShockRearShims,
      suspension.centerRearShims,
      suspension.rearPodShims,
      item.centerShockRearShims,
      item.centerRearShims,
      item.rearPodShims,
      suspension.centerShockPosition?.rear,
      suspension.centerRear,
      suspension.centerShockRear
    )
  );
  setIfBlankField(suspension, "centerShockLength", firstSetupText(suspension.centerShockLength, suspension.shockLength, suspension.centerLength, item.centerShockLength, item.shockLength));
  setIfBlankField(suspension, "centerSpringPreload", firstSetupText(suspension.centerSpringPreload, suspension.centerPreload, item.centerSpringPreload, item.centerPreload));
  setIfBlankField(suspension, "centerDamper", firstSetupText(suspension.centerDamper, suspension.centerHole, suspension.centerTube));
  stripSetupKeys(suspension, [
    "lfSpring", "rfSpring", "lrSpring", "rrSpring", "LFSpring", "RFSpring", "LRSpring", "RRSpring",
    "lfOil", "rfOil", "lrOil", "rrOil", "LFOil", "RFOil", "LROil", "RROil",
    "lfDamper", "rfDamper", "lrDamper", "rrDamper", "LFDamper", "RFDamper", "LRDamper", "RRDamper",
    "lfTube", "rfTube", "lrTube", "rrTube", "lfHole", "rfHole", "lrHole", "rrHole", "centerHole", "centerTube",
    "lfTop", "rfTop", "lrTop", "rrTop", "lfBottom", "rfBottom", "lrBottom", "rrBottom",
    "lfShockTop", "rfShockTop", "lrShockTop", "rrShockTop", "lfShockBottom", "rfShockBottom", "lrShockBottom", "rrShockBottom",
    "centerFront", "centerRear", "centerShockFront", "centerShockRear",
    "centerShockFrontChassisPosition", "centerFrontChassisPosition", "centerShockFrontTowerPosition", "centerFrontTowerPosition",
    "centerShockRearShims", "centerRearShims", "rearPodShims", "centerShockLength", "shockLength", "centerLength",
    "centerSpringPreload", "centerPreload",
    "lfSpringPreload", "rfSpringPreload", "lrSpringPreload", "rrSpringPreload", "LFSpringPreload", "RFSpringPreload", "LRSpringPreload", "RRSpringPreload",
    "lfSpringLength", "rfSpringLength", "lrSpringLength", "rrSpringLength", "LFSpringLength", "RFSpringLength", "LRSpringLength", "RRSpringLength",
    "lfShockOverallLength", "rfShockOverallLength", "lrShockOverallLength", "rrShockOverallLength", "LFShockOverallLength", "RFShockOverallLength", "LRShockOverallLength", "RRShockOverallLength",
    "lfOutsideShockPosition", "rfOutsideShockPosition", "lrOutsideShockPosition", "rrOutsideShockPosition", "LFOutsideShockPosition", "RFOutsideShockPosition", "LROutsideShockPosition", "RROutsideShockPosition",
    "lfAxleShims", "rfAxleShims", "lrAxleShims", "rrAxleShims", "LFAxleShims", "RFAxleShims", "LRAxleShims", "RRAxleShims",
    "lfHeight", "rfHeight", "lrHeight", "rrHeight", "lfRideHeight", "rfRideHeight", "lrRideHeight", "rrRideHeight",
    "lfDroop", "rfDroop", "lrDroop", "rrDroop",
    "hubTopLF", "hubTopRF", "hubTopLR", "hubTopRR", "hubBottomLF", "hubBottomRF", "hubBottomLR", "hubBottomRR",
    "hubToplf", "hubToprf", "hubToplr", "hubToprr", "hubBottomlf", "hubBottomrf", "hubBottomlr", "hubBottomrr",
  ]);
  next.suspension = suspension;

  const geometry = { ...(item.geometry || {}) };
  const geometryLegacySource = { ...item, ...geometry };
  geometry.camber = makeSetupCornerMapFromLegacy(geometryLegacySource, geometry.camber, ["Camber"], ["camber"]);
  geometry.toe = makeSetupCornerMapFromLegacy(geometryLegacySource, geometry.toe, ["Toe"], ["toe"]);
  geometry.caster = makeSetupCornerMapFromLegacy(geometryLegacySource, geometry.caster, ["Caster"], ["caster"]);
  geometry.casterBlockSpacing = { LF: "", RF: "", ...(geometry.casterBlockSpacing || {}) };
  for (const corner of ["LF", "RF"]) {
    const lower = corner.toLowerCase();
    setIfBlankField(
      geometry.casterBlockSpacing,
      corner,
      firstSetupText(
        geometry.casterBlockSpacing?.[corner],
        geometry.casterBlockSpacing?.[lower],
        geometry[`${lower}CasterBlockSpacing`],
        geometry[`${corner}CasterBlockSpacing`],
        geometry[`casterBlockSpacing${corner}`],
        item[`${lower}CasterBlockSpacing`],
        item[`${corner}CasterBlockSpacing`],
        item[`casterBlockSpacing${corner}`]
      )
    );
  }
  setIfBlankField(
    geometry,
    "tPlateRollCenterShim",
    firstSetupText(
      geometry.tPlateRollCenterShim,
      geometry.tPlateShim,
      geometry.rollCenterShim,
      geometry.tPlateRollCenter,
      geometry.rearPodRollCenterShim,
      item.tPlateRollCenterShim,
      item.tPlateShim,
      item.rollCenterShim,
      item.tPlateRollCenter,
      item.rearPodRollCenterShim
    )
  );
  geometry.armLocation = mergeNestedSetupCorners(geometry.armLocation, ["upper", "lower"]);
  geometry.shockMount = mergeNestedSetupCorners(geometry.shockMount, ["upper", "lower"]);
  for (const corner of SETUP_CORNERS) {
    const lower = corner.toLowerCase();
    setIfBlankField(geometry.armLocation[corner], "upper", firstSetupText(geometry[`${lower}ArmUpper`], geometry[`${corner}ArmUpper`], geometry[`armUpper${corner}`]));
    setIfBlankField(geometry.armLocation[corner], "lower", firstSetupText(geometry[`${lower}ArmLower`], geometry[`${corner}ArmLower`], geometry[`armLower${corner}`]));
    setIfBlankField(geometry.shockMount[corner], "upper", firstSetupText(geometry[`${lower}ShockMountUpper`], geometry[`${corner}ShockMountUpper`], geometry[`shockMountUpper${corner}`]));
    setIfBlankField(geometry.shockMount[corner], "lower", firstSetupText(geometry[`${lower}ShockMountLower`], geometry[`${corner}ShockMountLower`], geometry[`shockMountLower${corner}`]));
  }
  stripSetupKeys(geometry, [
    "lfCamber", "rfCamber", "lrCamber", "rrCamber", "LFCamber", "RFCamber", "LRCamber", "RRCamber",
    "lfToe", "rfToe", "lrToe", "rrToe", "LFToe", "RFToe", "LRToe", "RRToe",
    "lfCaster", "rfCaster", "LFCaster", "RFCaster",
    "lfCasterBlockSpacing", "rfCasterBlockSpacing", "LFCasterBlockSpacing", "RFCasterBlockSpacing",
    "tPlateRollCenterShim", "tPlateShim", "rollCenterShim", "tPlateRollCenter", "rearPodRollCenterShim",
    "lfArmUpper", "rfArmUpper", "lrArmUpper", "rrArmUpper", "lfArmLower", "rfArmLower", "lrArmLower", "rrArmLower",
    "lfShockMountUpper", "rfShockMountUpper", "lrShockMountUpper", "rrShockMountUpper",
    "lfShockMountLower", "rfShockMountLower", "lrShockMountLower", "rrShockMountLower",
  ]);
  next.geometry = geometry;

  const cornerWeights = { ...(item.cornerWeights || {}) };
  for (const corner of SETUP_CORNERS) {
    const lower = corner.toLowerCase();
    setIfBlankField(cornerWeights, corner, firstSetupText(cornerWeights[corner], cornerWeights[lower], cornerWeights[`${lower}Weight`], cornerWeights[`weight${corner}`], item[`${lower}Weight`], item[`weight${corner}`]));
    if (Object.prototype.hasOwnProperty.call(cornerWeights, lower)) delete cornerWeights[lower];
  }
  next.cornerWeights = cornerWeights;

  const chassis = { ...(item.chassis || {}) };
  const electronics = { ...(item.electronics || {}) };
  setIfBlankField(chassis, "batteryPosition", firstSetupText(chassis.batteryPosition, item.batteryPosition));
  setIfBlankField(chassis, "motorPosition", firstSetupText(chassis.motorPosition, item.motorPosition));
  setIfBlankField(chassis, "ballast", firstSetupText(chassis.ballast, chassis.weight, item.ballast));
  setIfBlankField(electronics, "batteryOrientation", firstSetupText(electronics.batteryOrientation, item.batteryOrientation));
  setIfBlankField(electronics, "batteryWeight", firstSetupText(electronics.batteryWeight, item.batteryWeight));
  setIfBlankField(electronics, "escPosition", firstSetupText(electronics.escPosition, chassis.escPosition, item.escPosition));
  setIfBlankField(electronics, "receiverPosition", firstSetupText(electronics.receiverPosition, chassis.receiverPosition, item.receiverPosition));
  setIfBlankField(electronics, "servoPosition", firstSetupText(electronics.servoPosition, item.servoPosition));
  setIfBlankField(electronics, "servoMountPosition", firstSetupText(electronics.servoMountPosition, item.servoMountPosition, item.servoMount));
  setIfBlankField(electronics, "servoMountAngle", firstSetupText(electronics.servoMountAngle, item.servoMountAngle, item.servoAngle));
  setIfBlankField(
    electronics,
    "transponderNumber",
    firstSetupText(electronics.transponderNumber, electronics.transponder, item.vehicleTransponder, item.transponder, item.transponderNumber, item.tx, item.txNumber, item.vehicle?.transponder, item.vehicle?.tx)
  );
  setIfBlankField(electronics, "transponderPosition", firstSetupText(electronics.transponderPosition, item.transponderPosition));
  setIfBlankField(electronics, "fanPosition", firstSetupText(electronics.fanPosition, item.fanPosition));
  stripSetupKeys(chassis, ["escPosition", "receiverPosition", "weight"]);
  next.chassis = chassis;
  next.electronics = electronics;

  const drivetrain = { ...(item.drivetrain || {}) };
  setIfBlankField(drivetrain, "rearDiffSetting", firstSetupText(drivetrain.rearDiffSetting, drivetrain.diffSetting, item.diffSetting));
  setIfBlankField(drivetrain, "rearDiffFluid", firstSetupText(drivetrain.rearDiffFluid, drivetrain.diffFluid, item.diffFluid));
  setIfBlankField(drivetrain, "rearDiffType", firstSetupText(drivetrain.rearDiffType, drivetrain.diffType, item.diffType));
  stripSetupKeys(drivetrain, ["diffSetting", "diffFluid", "diffType"]);
  next.drivetrain = drivetrain;

  return next;
}

function makeStableId(prefix, item) {
  return `${prefix}_${fingerprint(item).slice(0, 12)}`;
}

function normalizeUrl(value) {
  const raw = cleanText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function normalizeItemForV2(item, type, fallbackKey = "") {
  if (!item || typeof item !== "object") return item;
  const now = Date.now();
  const originalId = getAnyId(item);
  const id = originalId || makeStableId(type || "item", { ...item, fallbackKey });
  const updatedAtMs = getItemUpdatedAt(item) || now;
  const base = {
    ...item,
    id: String(id),
    updatedAtMs,
    syncUpdatedAt: getTimestampMs(item.syncUpdatedAt) || updatedAtMs,
  };

  if (type === "vehicle") {
    base.vehicleName = firstNonEmpty(base.vehicleName, base.name, base.title, base.label, "Vehicle");
    base.chassisStyle = firstNonEmpty(base.chassisStyle, base.chassis, base.style, base.className, base.class, base.type);
    base.manufacturer = firstNonEmpty(base.manufacturer, base.make, base.brand);
    base.model = firstNonEmpty(base.model, base.vehicleModel, base.modelName);
    base.transponder = firstNonEmpty(base.transponder, base.tx, base.txNumber, base.transponderNumber);
  }

  if (type === "track") {
    base.trackName = firstNonEmpty(base.trackName, base.name, base.title, base.label, "Track");
    base.trackType = firstNonEmpty(base.trackType, base.type, base.layoutType);
    base.surface = firstNonEmpty(base.surface, base.trackSurface);
    base.livercUrl = normalizeUrl(firstNonEmpty(base.livercUrl, base.liveRcUrl, base.liveRCUrl, base.liverc, base.url));
  }

  if (type === "setup" || type === "setupVersion") {
    const migratedSetup = normalizeLegacySetupFields(base);
    Object.keys(base).forEach((key) => delete base[key]);
    Object.assign(base, migratedSetup);
    base.setupName = firstNonEmpty(base.setupName, base.name, base.title, base.label, type === "setupVersion" ? "Saved Setup" : "Setup");
    base.vehicleId = firstNonEmpty(base.vehicleId, base.carId, base.vehicleID, base.vehicle?.id);
    base.trackId = firstNonEmpty(base.trackId, base.trackID, base.track?.id);
    base.vehicleTransponder = firstNonEmpty(
      base.vehicleTransponder,
      base.transponder,
      base.transponderNumber,
      base.tx,
      base.txNumber,
      base.vehicle?.transponder,
      base.vehicle?.tx,
      base.electronics?.transponderNumber,
      base.electronics?.transponder
    );
    if (base.vehicleTransponder) {
      base.transponder = firstNonEmpty(base.transponder, base.vehicleTransponder);
    }
    if (type === "setupVersion") {
      base.versionId = firstNonEmpty(base.versionId, base.id, base.setupVersionId, base.snapshotId, base.runId, base.uuid, String(id));
      base.id = String(base.versionId);
    }
  }

  if (type === "raceDayArchive") {
    return normalizeRaceDayHistoryEntry(base);
  }

  if (type === "raceDayNoteIndex") {
    base.raceDayId = raceDayKeySafe(firstNonEmpty(base.raceDayId, base.id, base.sessionId));
    base.id = base.raceDayId;
  }

  if (type === "run" || type === "raceDayLineup" || type === "raceDayChange" || type === "raceDayResult") {
    base.raceDayId = raceDayKeySafe(raceDayIdFromItem(base, "active"));
    base.vehicleId = firstNonEmpty(base.vehicleId, base.carId, base.vehicle?.id);
  }

  return base;
}

function normalizeArrayForKey(arr, key) {
  const type = inferArrayTypeForKey(key);
  const list = Array.isArray(arr) ? arr : [];
  const byId = new Map();

  for (const raw of list) {
    const item = normalizeItemForV2(raw, type, key);
    if (!item || typeof item !== "object") continue;
    const id = getAnyId(item) || makeStableId(type, item);
    const mapKey = String(id);
    const existing = byId.get(mapKey);
    if (!existing) {
      byId.set(mapKey, item);
      continue;
    }
    byId.set(mapKey, getItemUpdatedAt(item) >= getItemUpdatedAt(existing) ? item : existing);
  }

  return Array.from(byId.values());
}

function getSetupComboKey(item) {
  const vehicleId = firstNonEmpty(
    item?.vehicleId,
    item?.vehicleID,
    item?.carId,
    item?.vehicle?.id,
    "unknownVehicle"
  );
  const trackId = firstNonEmpty(
    item?.trackId,
    item?.trackID,
    item?.track?.id,
    "unknownTrack"
  );
  return `${vehicleId}::${trackId}`;
}

function setupSortMs(item) {
  return (
    getItemUpdatedAt(item) ||
    getTimestampMs(item?.savedAtMs) ||
    getTimestampMs(item?.savedAt) ||
    getTimestampMs(item?.createdAtMs) ||
    getTimestampMs(item?.createdAt) ||
    0
  );
}

function limitSetupsByVehicleTrackCombo(arr, type, key, { addTombstones = true } = {}) {
  const list = Array.isArray(arr) ? arr.filter(Boolean) : [];
  const buckets = new Map();

  for (const item of list) {
    const comboKey = getSetupComboKey(item);
    if (!buckets.has(comboKey)) buckets.set(comboKey, []);
    buckets.get(comboKey).push(item);
  }

  const kept = [];
  const prunedTombstones = [];
  const now = Date.now();

  for (const [, bucket] of buckets.entries()) {
    bucket.sort((a, b) => {
      const byTime = setupSortMs(b) - setupSortMs(a);
      if (byTime) return byTime;
      return String(getAnyId(b) || "").localeCompare(String(getAnyId(a) || ""));
    });

    kept.push(...bucket.slice(0, MAX_SETUPS_PER_VEHICLE_TRACK));

    if (!addTombstones) continue;
    for (const item of bucket.slice(MAX_SETUPS_PER_VEHICLE_TRACK)) {
      const id = getAnyId(item);
      if (!id) continue;
      prunedTombstones.push({
        type,
        id: String(id),
        key: type === "setupVersion" ? String(key || "") : "",
        deletedAt: now,
        deviceId: String(item?.syncDeviceId || "system-prune"),
        reason: "max-setups-per-vehicle-track",
      });
    }
  }

  return { kept, prunedTombstones };
}

function enforceSetupComboLimits(payload, { addTombstones = true } = {}) {
  const next = { ...(payload || {}) };
  const tombstones = safeJsonParse(next["@deleted_v1"] || "[]", []);
  let nextTombs = Array.isArray(tombstones) ? [...tombstones] : [];

  for (const key of Object.keys(next)) {
    if (key !== "@setups" && !isDynamicSetupHistoryKey(key)) continue;

    const arr = safeJsonParse(next[key], null);
    if (!Array.isArray(arr)) continue;

    const type = inferArrayTypeForKey(key);
    const normalized = normalizeArrayForKey(arr, key);
    const { kept, prunedTombstones } = limitSetupsByVehicleTrackCombo(normalized, type, key, { addTombstones });
    next[key] = JSON.stringify(kept);
    nextTombs.push(...prunedTombstones);
  }

  next["@deleted_v1"] = JSON.stringify(normalizeTombstones(nextTombs));
  return next;
}

function setupIdsFromHistoryKey(sourceKey = "") {
  const key = String(sourceKey || "");
  const prefix = DYNAMIC_SYNC_PREFIXES.find((p) => key.startsWith(p));
  if (!prefix) return { vehicleId: "", trackId: "" };
  const rest = key.slice(prefix.length);
  if (!rest) return { vehicleId: "", trackId: "" };
  if (rest.includes("__")) {
    const [vehicleId, ...trackParts] = rest.split("__");
    return { vehicleId, trackId: trackParts.join("__") };
  }
  const splitAt = rest.lastIndexOf("_");
  if (splitAt > 0) return { vehicleId: rest.slice(0, splitAt), trackId: rest.slice(splitAt + 1) };
  return { vehicleId: "", trackId: "" };
}

function setupHistoryKeyForItem(item, sourceKey = "") {
  const fromKey = setupIdsFromHistoryKey(sourceKey);
  const vehicleId = firstNonEmpty(item?.vehicleId, item?.vehicleID, item?.carId, item?.vehicle?.id, fromKey.vehicleId, "unknownVehicle");
  const trackId = firstNonEmpty(item?.trackId, item?.trackID, item?.track?.id, fromKey.trackId, "unknownTrack");
  return `@setupHistory_${vehicleId}__${trackId}`;
}

function raceDayKeySafe(value) {
  return String(value || "active").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function raceDayIdFromItem(item = {}, fallback = "") {
  return firstNonEmpty(item?.raceDayId, item?.sessionId, item?.raceDay?.id, item?.eventId, fallback);
}

function raceDayRunsKeyForId(raceDayId) {
  return `@raceDayRuns_${raceDayKeySafe(raceDayId || "active")}`;
}

function normalizeRaceDayHistoryEntry(item = {}) {
  const id = raceDayKeySafe(firstNonEmpty(item?.raceDayId, item?.id, item?.sessionId, item?.eventId, item?.startedAt, "active"));
  const endedAt = firstNonEmpty(item?.endedAt, item?.finishedAt, item?.updatedAt);
  const startedAt = firstNonEmpty(item?.startedAt, item?.createdAt);
  const updatedAtMs = getItemUpdatedAt(item) || getTimestampMs(endedAt) || getTimestampMs(startedAt) || Date.now();
  return {
    ...(item || {}),
    id,
    raceDayId: id,
    sessionId: firstNonEmpty(item?.sessionId, id),
    trackId: firstNonEmpty(item?.trackId, item?.track?.id),
    trackName: firstNonEmpty(item?.trackName, item?.track?.trackName, item?.track?.name),
    vehicleIds: Array.isArray(item?.vehicleIds) ? item.vehicleIds : [],
    eventUrl: item?.eventUrl || null,
    eventTitle: firstNonEmpty(item?.eventTitle, item?.eventName, item?.selectedEventTitle, item?.liveRcEventTitle),
    eventDateLabel: firstNonEmpty(item?.eventDateLabel, item?.eventDate, item?.selectedEventDateLabel, item?.liveRcEventDateLabel),
    startedAt: startedAt || null,
    endedAt: endedAt || null,
    updatedAtMs,
    syncUpdatedAt: getTimestampMs(item?.syncUpdatedAt) || updatedAtMs,
    status: String(item?.status || (endedAt ? "ended" : "archived")).toLowerCase(),
  };
}

function mergeArrayIntoPayloadKey(out, key, arr, type = "item") {
  const existing = safeJsonParse(out[key] || "[]", []);
  const merged = normalizeArrayForKey([
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(arr) ? arr : []),
  ], key);
  out[key] = JSON.stringify(merged);
  return out;
}

function parseMaybeObjectMap(value) {
  const parsed = safeJsonParse(value, undefined);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed;
}

function convertLegacyRaceDayPayload(source, out, migrationNotes) {
  // Old aggregate RaceDay sessions/history -> new archive history key.
  for (const legacyKey of LEGACY_RACEDAY_SESSION_KEYS) {
    if (!(legacyKey in source)) continue;
    const arr = parseMaybeArray(source[legacyKey]);
    if (!arr.length) continue;
    const existing = safeJsonParse(out["@raceDayHistory_v1"] || "[]", []);
    out["@raceDayHistory_v1"] = JSON.stringify(
      normalizeArrayForKey([
        ...(Array.isArray(existing) ? existing : []),
        ...arr.map((item) => normalizeRaceDayHistoryEntry(item)),
      ], "@raceDayHistory_v1")
    );
    migrationNotes.push(`converted:${legacyKey}->@raceDayHistory_v1`);
  }

  // Old aggregate RaceDay runs -> per-event run keys used by the current RaceDay screens.
  for (const legacyKey of LEGACY_RACEDAY_RUN_KEYS) {
    if (!(legacyKey in source)) continue;
    const arr = parseMaybeArray(source[legacyKey]);
    if (!arr.length) continue;

    const buckets = new Map();
    for (const run of arr) {
      const raceDayId = raceDayIdFromItem(run, "active");
      const key = raceDayRunsKeyForId(raceDayId);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ ...(run || {}), raceDayId: raceDayKeySafe(raceDayId) });
    }

    for (const [key, runs] of buckets.entries()) mergeArrayIntoPayloadKey(out, key, runs, "run");
    migrationNotes.push(`converted:${legacyKey}->@raceDayRuns_{raceDayId}`);
  }

  // Old object-map storage, e.g. @raceDayNotes = { raceDayId: {...} },
  // becomes the per-event keys used now: @raceDayNotes_<raceDayId>.
  for (const [legacyKey, targetPrefix] of Object.entries(LEGACY_RACEDAY_MAP_KEYS)) {
    if (!(legacyKey in source)) continue;
    const map = parseMaybeObjectMap(source[legacyKey]);
    if (!map) continue;

    for (const [raceDayId, value] of Object.entries(map)) {
      const targetKey = `${targetPrefix}${raceDayKeySafe(raceDayId)}`;
      if (Array.isArray(value)) mergeArrayIntoPayloadKey(out, targetKey, value);
      else out[targetKey] = JSON.stringify(value || {});
    }
    migrationNotes.push(`converted:${legacyKey}->${targetPrefix}{raceDayId}`);
  }
}

function parseMaybeArray(value) {
  const parsed = safeJsonParse(value, undefined);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    // Some old versions stored setup history as an object keyed by vehicle/track.
    const out = [];
    for (const [bucketKey, bucketValue] of Object.entries(parsed)) {
      if (Array.isArray(bucketValue)) {
        for (const item of bucketValue) out.push({ ...(item || {}), _legacyBucketKey: bucketKey });
      } else if (bucketValue && typeof bucketValue === "object") {
        out.push({ ...bucketValue, _legacyBucketKey: bucketKey });
      }
    }
    return out;
  }
  return [];
}

function migratePayloadToV2(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const out = {};
  const migrationNotes = [];

  // Keep current sync keys only. Local-only drafts and old/graveyard keys are intentionally excluded.
  for (const [key, value] of Object.entries(source)) {
    if (!isSyncKey(key)) continue;
    if (key === "@deleted_v1") {
      out[key] = JSON.stringify(normalizeTombstones(safeJsonParse(value || "[]", [])));
    } else {
      const parsed = safeJsonParse(value, undefined);
      if (Array.isArray(parsed)) out[key] = JSON.stringify(normalizeArrayForKey(parsed, key));
      else out[key] = value == null ? null : String(value);
    }
  }

  // Convert exact legacy aliases into the active V2 keys.
  for (const [targetKey, aliases] of Object.entries(LEGACY_KEY_ALIASES)) {
    for (const alias of aliases) {
      if (!(alias in source)) continue;
      if (targetKey === "@deleted_v1") {
        out[targetKey] = mergePayloadValue(
          out[targetKey] || "[]",
          JSON.stringify(normalizeTombstones(safeJsonParse(source[alias] || "[]", []))),
          targetKey
        );
      } else {
        const arr = parseMaybeArray(source[alias]);
        if (arr.length) {
          out[targetKey] = mergePayloadValue(
            out[targetKey] || "[]",
            JSON.stringify(normalizeArrayForKey(arr, targetKey)),
            targetKey
          );
        }
      }
      migrationNotes.push(`converted:${alias}->${targetKey}`);
    }
  }

  // Backfill the latest setup list into the per-car/per-track history keys used by the current editor.
  // Older cloud backups often only had @setups, so without this the editor could show only partial/new data.
  const latestSetupsForHistory = parseMaybeArray(source["@setups"] || out["@setups"] || "[]");
  for (const raw of latestSetupsForHistory) {
    const item = normalizeItemForV2(raw, "setupVersion", "@setups");
    if (!item?.vehicleId || !item?.trackId) continue;
    const targetKey = setupHistoryKeyForItem(item, "");
    const existing = safeJsonParse(out[targetKey] || "[]", []);
    out[targetKey] = JSON.stringify(normalizeArrayForKey([...(Array.isArray(existing) ? existing : []), item], targetKey));
  }
  if (latestSetupsForHistory.length) migrationNotes.push("converted:@setups->setupHistoryByVehicleTrack");

  // Convert old non-dynamic setup histories into vehicleId+trackId history keys.
  for (const legacyKey of LEGACY_SETUP_VERSION_KEYS) {
    if (!(legacyKey in source)) continue;
    const arr = parseMaybeArray(source[legacyKey]);
    for (const raw of arr) {
      const item = normalizeItemForV2(raw, "setupVersion", legacyKey);
      const targetKey = setupHistoryKeyForItem(item, legacyKey);
      const existing = safeJsonParse(out[targetKey] || "[]", []);
      out[targetKey] = JSON.stringify(normalizeArrayForKey([...existing, item], targetKey));
    }
    if (arr.length) migrationNotes.push(`converted:${legacyKey}->setupHistoryByVehicleTrack`);
  }

  // Normalize dynamic setup version/history keys that may have existed already.
  // Also repairs old single-underscore history keys into the current double-underscore format.
  for (const [key, value] of Object.entries(source)) {
    if (!isDynamicSetupHistoryKey(key) || isLocalOnlyKey(key)) continue;
    const arr = parseMaybeArray(value);
    if (!arr.length) continue;

    for (const raw of arr) {
      const item = normalizeItemForV2(raw, "setupVersion", key);
      const targetKey = setupHistoryKeyForItem(item, key);
      const existing = safeJsonParse(out[targetKey] || "[]", []);
      out[targetKey] = JSON.stringify(normalizeArrayForKey([...(Array.isArray(existing) ? existing : []), item], targetKey));
    }
    migrationNotes.push(`converted:${key}->setupHistoryByVehicleTrack`);
  }

  // Convert old RaceDay aggregate data into the current per-event archive keys.
  convertLegacyRaceDayPayload(source, out, migrationNotes);

  // Normalize current RaceDay dynamic archive keys that may already exist.
  for (const [key, value] of Object.entries(source)) {
    if (!isDynamicRaceDayArchiveKey(key) || isLocalOnlyKey(key)) continue;
    const parsed = safeJsonParse(value, undefined);
    if (Array.isArray(parsed)) out[key] = JSON.stringify(normalizeArrayForKey(parsed, key));
    else if (parsed && typeof parsed === "object") out[key] = JSON.stringify(parsed);
    else out[key] = value == null ? null : String(value);
  }

  let next = applyTombstonesToPayload(out);
  next = enforceSetupComboLimits(next, { addTombstones: true });
  next = applyTombstonesToPayload(next);
  next = pruneExpiredTombstones(next);
  next = normalizeRaceDayPayload(next);

  const beforeHash = hashString(JSON.stringify(source || {}));
  const afterHash = hashString(JSON.stringify(next || {}));
  return {
    payload: next,
    changed: beforeHash !== afterHash || migrationNotes.length > 0,
    notes: migrationNotes,
  };
}

function isGraveyardedLocalKey(key) {
  const k = String(key || "");
  if (!k) return false;
  if (k === DIRTY_LOCAL_KEY || k === DEVICE_ID_KEY || k === META_LOCAL_KEY || k === LOCAL_SCHEMA_KEY || k === LOCAL_MIGRATION_LOG_KEY) return false;
  if (GRAVEYARD_EXACT_KEYS.includes(k)) return true;
  if (GRAVEYARD_PREFIXES.some((p) => k.startsWith(p))) return true;
  if (BASE_SYNC_KEYS.includes(k) || isDynamicSetupHistoryKey(k)) return false;
  return false;
}

export async function runV2LocalMigration({ purgeLegacy = true, reason = "v2-local-migration" } = {}) {
  const previousSchema = await AsyncStorage.getItem(LOCAL_SCHEMA_KEY);
  const allKeys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet(Array.isArray(allKeys) ? allKeys : []);
  const allPayload = {};
  for (const [k, v] of pairs) allPayload[k] = v;

  const beforeCurrent = await readLocalPayload(allPayload);
  const migrated = migratePayloadToV2({ ...allPayload, ...beforeCurrent });
  const changedKeys = computeChangedKeys(beforeCurrent, migrated.payload);
  const beforeHasCoreData = hasCoreUserPayloadData(beforeCurrent);
  const afterHasCoreData = hasCoreUserPayloadData(migrated.payload);
  const migrationHasCoreData = beforeHasCoreData || afterHasCoreData;

  if (changedKeys.length || previousSchema !== CLOUD_SCHEMA_VERSION) {
    await writeLocalPayload(migrated.payload);
  }

  let purgedKeys = [];
  if (purgeLegacy) {
    purgedKeys = (Array.isArray(allKeys) ? allKeys : []).filter(isGraveyardedLocalKey);
    if (purgedKeys.length) await AsyncStorage.multiRemove(purgedKeys);
  }

  const log = {
    schemaVersion: CLOUD_SCHEMA_VERSION,
    previousSchema: previousSchema || "",
    migratedAtMs: Date.now(),
    reason: String(reason || ""),
    changedKeys,
    purgedKeys,
    notes: migrated.notes,
  };

  await AsyncStorage.setItem(LOCAL_SCHEMA_KEY, CLOUD_SCHEMA_VERSION);
  await AsyncStorage.setItem(LOCAL_MIGRATION_LOG_KEY, JSON.stringify(log));

  // Only mark dirty when real user data changed. A fresh install can create
  // empty schema/tombstone bookkeeping; that must not queue an empty cloud push
  // or leave the dashboard dot red.
  const meaningfulChangedKeys = changedKeys.filter((key) => {
    if (key === "@deleted_v1" && !migrationHasCoreData) return false;
    return true;
  });
  if (migrationHasCoreData && (meaningfulChangedKeys.length || purgedKeys.length)) {
    await markCloudDirty({ reason: "v2-migration", keys: meaningfulChangedKeys });
  }

  return {
    ok: true,
    didMigrate: changedKeys.length > 0 || purgedKeys.length > 0 || previousSchema !== CLOUD_SCHEMA_VERSION,
    ...log,
  };
}

async function ensureV2LocalMigrationDone(reason = "sync") {
  const current = await AsyncStorage.getItem(LOCAL_SCHEMA_KEY);
  if (current === CLOUD_SCHEMA_VERSION) return { ok: true, didMigrate: false, schemaVersion: current };
  return runV2LocalMigration({ reason });
}

export async function getLastV2MigrationLog() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_MIGRATION_LOG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function hasSetupPayloadData(payload = {}) {
  const stats = payloadStats(payload || {}).counts || {};
  if (Number(stats.setups || 0) > 0 || Number(stats.setupVersions || 0) > 0 || Number(stats.setupVersionKeys || 0) > 0) return true;
  return Object.keys(payload || {}).some((key) => /setup/i.test(String(key || "")) && !/draft/i.test(String(key || "")));
}

function setupProgressCounts(payload = {}) {
  const stats = payloadStats(payload || {}).counts || {};
  return {
    vehicles: Number(stats.vehicles || 0),
    tracks: Number(stats.tracks || 0),
    setups: Number(stats.setups || 0),
    setupVersionKeys: Number(stats.setupVersionKeys || 0),
    setupVersions: Number(stats.setupVersions || 0),
  };
}

async function setSetupMigrationProgress(phase, patch = {}) {
  try {
    updateSetupsMigrationProgress({
      active: true,
      title: "Setups Migration",
      phase,
      updatedAt: Date.now(),
      ...patch,
    });
  } catch {}
}

function migrationNotesIncludeSetups(migration = {}) {
  const notes = Array.isArray(migration?.notes) ? migration.notes : [];
  return notes.some((note) => /setup/i.test(String(note || "")));
}

async function runSetupsMigrationForSync(reason = "setups-sync-migration", { uid = null, showProgress = true } = {}) {
  const guard = await tryStartSetupsCloudMigration(uid, reason);
  if (!guard.ok) {
    if (guard.done) {
      console.log("[Setups Migration] Already completed. Skipping.", { uid: safeMigrationUid(uid), reason });
    } else if (guard.running) {
      console.log("[Setups Migration] Already running. Skipping duplicate trigger.", { uid: safeMigrationUid(uid), reason });
    }
    return {
      changed: false,
      changedKeys: [],
      migratedSetups: 0,
      historyKeys: 0,
      reason,
      skipped: true,
      alreadyDone: !!guard.done,
      alreadyRunning: !!guard.running,
      notes: [guard.reason || "skipped"],
    };
  }

  try {
    if (showProgress) {
      await setSetupMigrationProgress("migrating", {
        message: "Converting old setup sheets into the new Setups 2.0 format...",
        detail: reason,
      });
    }

    const result = await migrateSetupsFromLegacyStorage({ reason, markDirty: true });

    if (showProgress) {
      await setSetupMigrationProgress(result?.changed ? "migrated" : "checked", {
        message: result?.changed
          ? "Setup migration finished locally. Preparing upload..."
          : "No old setup changes needed migration.",
        migratedSetups: Number(result?.migratedSetups || 0),
        historyKeys: Number(result?.historyKeys || 0),
        changedKeys: Array.isArray(result?.changedKeys) ? result.changedKeys : [],
      });
    }

    if (result?.changed) {
      await markCloudDirty({
        reason: "setups-2.0-migration",
        keys: Array.isArray(result.changedKeys) ? result.changedKeys : ["@setups"],
        type: "setup-migration",
        id: "setups-2.0",
      });
    }

    return result;
  } catch (e) {
    if (showProgress) {
      try {
        finishSetupsMigrationProgress({
          phase: "error",
          message: e?.message || String(e) || "Setup migration failed.",
        });
      } catch {}
    }
    throw e;
  } finally {
    await clearSetupsCloudMigrationRunning(uid);
  }
}

async function uploadSetupsMigrationAfterPull({ uid, appVersion = "", pulled = {}, cloudPayload = {}, reason = "setups-migration-upload" } = {}) {
  const changed = !!pulled?.setupMigrationChanged || !!pulled?.setupMigration?.changed;
  const alreadyDone = await isSetupsCloudMigrationDone(uid);

  if (!changed) {
    if (hasSetupPayloadData(cloudPayload) && !pulled?.setupMigration?.alreadyRunning) {
      // First successful check found the cloud setup data already current. Mark
      // complete so this popup never appears again for the same signed-in user.
      await markSetupsCloudMigrationDone(uid, {
        reason,
        mode: "already-current-after-pull",
        counts: setupProgressCounts(cloudPayload),
      });

      if (!alreadyDone && !pulled?.setupMigration?.alreadyDone && !pulled?.setupMigration?.skipped) {
        try {
          finishSetupsMigrationProgress({
            phase: "done",
            message: "Setups are already current. No migration upload needed.",
            counts: setupProgressCounts(cloudPayload),
            autoClearMs: 1800,
          });
        } catch {}
      }
    }
    return pulled;
  }

  if (!alreadyDone) {
    await setSetupMigrationProgress("uploading", {
      message: "Uploading converted Setups 2.0 data back to the cloud...",
      counts: setupProgressCounts(await readLocalPayload(cloudPayload || {})),
    });
  }

  const result = await pushLocalToCloud({
    uid,
    appVersion,
    reason,
    cloudPayload,
    mergeWithCloud: true,
    readCloudBeforePush: false,
  });

  const uploadSucceeded = result?.direction === "push" || result?.didSync;
  if (uploadSucceeded) {
    await markSetupsCloudMigrationDone(uid, {
      reason,
      mode: "converted-and-uploaded-after-pull",
      migratedSetups: Number(pulled?.setupMigration?.migratedSetups || 0),
      historyKeys: Number(pulled?.setupMigration?.historyKeys || 0),
    });
  }

  if (!alreadyDone) {
    try {
      finishSetupsMigrationProgress({
        phase: uploadSucceeded ? "done" : "pending",
        message: uploadSucceeded
          ? "Setups migration complete. Converted setup sheets are synced."
          : "Setups were converted locally. Upload is queued.",
        result,
        autoClearMs: 2600,
      });
    } catch {}
  }

  return {
    ...(result || {}),
    pulled,
    setupMigrationUploaded: !!result?.didSync,
  };
}

function payloadStats(payload) {
  const counts = {
    vehicles: 0,
    tracks: 0,
    setups: 0,
    setupVersionKeys: 0,
    setupVersions: 0,
    runs: 0,
    sessions: 0,
    raceDayArchives: 0,
    raceDayArchiveKeys: 0,
    raceDayNotes: 0,
    raceDaySetupChanges: 0,
    raceDayLineups: 0,
    raceDayPracticeBundles: 0,
    tombstones: 0,
  };

  const vehicles = safeJsonParse(payload?.["@vehicles"] || "[]", []);
  const tracks = safeJsonParse(payload?.["@tracks"] || "[]", []);
  const setups = safeJsonParse(payload?.["@setups"] || "[]", []);
  const history = safeJsonParse(payload?.["@raceDayHistory_v1"] || "[]", []);
  const tombstones = safeJsonParse(payload?.["@deleted_v1"] || "[]", []);
  let runs = [];
  let sessions = history;

  counts.vehicles = Array.isArray(vehicles) ? vehicles.length : 0;
  counts.tracks = Array.isArray(tracks) ? tracks.length : 0;
  counts.setups = Array.isArray(setups) ? setups.length : 0;
  counts.raceDayArchives = Array.isArray(history) ? history.length : 0;
  counts.sessions = Array.isArray(sessions) ? sessions.length : 0;
  counts.tombstones = Array.isArray(tombstones) ? tombstones.length : 0;

  for (const key of Object.keys(payload || {})) {
    if (isDynamicSetupHistoryKey(key)) {
      counts.setupVersionKeys += 1;
      const arr = safeJsonParse(payload[key] || "[]", []);
      if (Array.isArray(arr)) counts.setupVersions += arr.length;
      continue;
    }

    if (!isDynamicRaceDayArchiveKey(key)) continue;
    counts.raceDayArchiveKeys += 1;
    const parsed = safeJsonParse(payload[key] || "[]", []);
    if (key.startsWith("@raceDayRuns_") && Array.isArray(parsed)) counts.runs += parsed.length;
    else if (key.startsWith("@raceDayNotes_")) counts.raceDayNotes += 1;
    else if (key.startsWith("@raceDaySetupChanges_") && Array.isArray(parsed)) counts.raceDaySetupChanges += parsed.length;
    else if (key.startsWith("@raceDayLineups_") && Array.isArray(parsed)) counts.raceDayLineups += parsed.length;
    else if (key.startsWith("@raceDayPractice_")) counts.raceDayPracticeBundles += 1;
  }

  let payloadBytes = 0;
  try {
    payloadBytes = JSON.stringify(payload || {}).length;
  } catch {}

  return { counts, payloadBytes };
}

async function readLocalPayload(extraPayload = null) {
  const keys = await discoverLocalSyncKeys(extraPayload);
  const pairs = await AsyncStorage.multiGet(keys);
  const payload = {};
  for (const [k, v] of pairs) {
    if (isSyncKey(k)) payload[k] = v ?? null;
  }
  return payload;
}

async function writeLocalPayload(payload) {
  const keys = await discoverLocalSyncKeys(payload);
  const ops = [];
  for (const k of keys) {
    if (!isSyncKey(k)) continue;
    const v = payload?.[k];
    ops.push([k, v == null ? "" : String(v)]);
  }
  if (ops.length) await AsyncStorage.multiSet(ops);
}

async function computeLocalPayloadHash(extraPayload = null) {
  const payload = extraPayload || (await readLocalPayload());
  const keys = Object.keys(payload || {}).filter(isSyncKey).sort();
  const joined = keys.map((k) => `${k}=${payload[k] == null ? "" : String(payload[k])}`).join("\n");
  return hashString(joined);
}

async function isLocalEmpty() {
  const payload = await readLocalPayload();
  for (const key of Object.keys(payload || {})) {
    if (key === "@deleted_v1") continue;
    const v = payload[key];
    if (v == null) continue;
    const t = String(v).trim();
    if (!t || t === "[]" || t === "{}") continue;
    return false;
  }
  return true;
}

function hasCoreUserPayloadData(payload) {
  const p = payload && typeof payload === "object" ? payload : {};

  for (const key of ["@vehicles", "@tracks", "@setups"]) {
    const arr = safeJsonParse(p[key] || "[]", []);
    if (Array.isArray(arr) && arr.length > 0) return true;
  }

  for (const key of Object.keys(p)) {
    if (isDynamicSetupHistoryKey(key)) {
      const arr = safeJsonParse(p[key] || "[]", []);
      if (Array.isArray(arr) && arr.length > 0) return true;
      continue;
    }
    if (key === "@raceDayHistory_v1" || isDynamicRaceDayArchiveKey(key)) {
      const parsed = safeJsonParse(p[key] || "[]", []);
      if (Array.isArray(parsed) && parsed.length > 0) return true;
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) return true;
    }
  }

  return false;
}

async function isLocalCoreUserDataEmpty(extraPayload = null) {
  const payload = await readLocalPayload(extraPayload);
  return !hasCoreUserPayloadData(payload);
}

function extractIdsAndFingerprints(payload) {
  const ids = {};
  const fps = {};

  for (const key of Object.keys(payload || {})) {
    if (!isSyncKey(key)) continue;
    const arr = safeJsonParse(payload[key], null);
    if (!Array.isArray(arr)) continue;

    const type = inferArrayTypeForKey(key);
    const bucketKey = `${type}:${key}`;
    ids[bucketKey] = [];
    fps[bucketKey] = {};

    for (const item of arr) {
      const id = getAnyId(item);
      if (!id) continue;
      const sid = String(id);
      ids[bucketKey].push(sid);
      fps[bucketKey][sid] = fingerprint(item);
    }
  }

  return { lastItemIds: ids, lastItemFingerprints: fps };
}

function addDetectedDeletesToPayload(payload, meta, deviceId) {
  const previousIds = meta?.lastItemIds || {};
  const { lastItemIds: currentIds } = extractIdsAndFingerprints(payload);
  const tombs = safeJsonParse(payload?.["@deleted_v1"] || "[]", []);
  const nextTombs = Array.isArray(tombs) ? [...tombs] : [];
  const now = Date.now();

  for (const bucketKey of Object.keys(previousIds || {})) {
    const [type, ...keyParts] = String(bucketKey).split(":");
    const key = keyParts.join(":");
    const prev = new Set((previousIds[bucketKey] || []).map(String));
    const curr = new Set((currentIds[bucketKey] || []).map(String));

    for (const id of prev) {
      if (!id || curr.has(id)) continue;
      nextTombs.push({ type, id, key, deletedAt: now, deviceId });
    }
  }

  payload["@deleted_v1"] = JSON.stringify(normalizeTombstones(nextTombs));
  return payload;
}

function stampChangedItemsInPayload(payload, meta, deviceId) {
  const now = Date.now();
  const prevFingerprints = meta?.lastItemFingerprints || {};

  for (const key of Object.keys(payload || {})) {
    if (!isSyncKey(key) || key === "@deleted_v1") continue;

    const arr = safeJsonParse(payload[key], null);
    if (!Array.isArray(arr)) continue;

    const type = inferArrayTypeForKey(key);
    const bucketKey = `${type}:${key}`;
    const stamped = arr.map((item) => {
      if (!item || typeof item !== "object") return item;
      const id = getAnyId(item);
      if (!id) return item;

      const fp = fingerprint(item);
      const prevFp = prevFingerprints?.[bucketKey]?.[String(id)] || "";
      const hasTimestamp = !!getItemUpdatedAt(item);

      if (!prevFp || prevFp !== fp || !hasTimestamp) {
        return {
          ...item,
          syncUpdatedAt: now,
          updatedAtMs: item.updatedAtMs || now,
          syncDeviceId: deviceId,
        };
      }

      return item;
    });

    payload[key] = JSON.stringify(stamped);
  }

  return payload;
}

async function prepareLocalPayloadForSync(payload, deviceId, meta) {
  let next = { ...(payload || {}) };
  next = addDetectedDeletesToPayload(next, meta, deviceId);
  next = stampChangedItemsInPayload(next, meta, deviceId);
  next = applyTombstonesToPayload(next);
  next = enforceSetupComboLimits(next, { addTombstones: true });
  next = applyTombstonesToPayload(next);
  next = pruneExpiredTombstones(next);
  next = normalizeRaceDayPayload(next);
  return next;
}

async function buildMergedPayload({ localPayload, cloudPayload }) {
  const localMigrated = migratePayloadToV2(localPayload || {}).payload;
  const cloudMigrated = migratePayloadToV2(cloudPayload || {}).payload;
  const keys = await discoverLocalSyncKeys({ ...localMigrated, ...cloudMigrated });
  const merged = {};

  for (const key of keys) {
    merged[key] = mergePayloadValue(localMigrated?.[key], cloudMigrated?.[key], key);
  }

  let next = applyTombstonesToPayload(merged);
  next = enforceSetupComboLimits(next, { addTombstones: true });
  next = applyTombstonesToPayload(next);
  next = pruneExpiredTombstones(next);
  next = normalizeRaceDayPayload(next);
  return next;
}

function computeChangedKeys(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changed = [];
  for (const key of Array.from(keys).sort()) {
    if (!isSyncKey(key)) continue;
    if (String(before?.[key] ?? "") !== String(after?.[key] ?? "")) changed.push(key);
  }
  return changed;
}

async function commitBackupDoc({ ref, data, uid }) {
  // Full overwrite is intentional for V2. It purges old/graveyarded nested payload keys
  // from users/{uid}/imrc/backup_main instead of leaving them behind via merge:true.
  const batch = writeBatch(db);
  const publicData = { ...(data || {}) };
  const chunks = Array.isArray(publicData.__payloadChunks) ? publicData.__payloadChunks : null;
  delete publicData.__payloadChunks;

  batch.set(ref, publicData);

  if (uid && chunks) {
    const activeIds = new Set(publicData.payloadChunkDocIds || []);

    chunks.forEach((chunk, index) => {
      const id = payloadChunkDocId(index);
      activeIds.add(id);
      batch.set(payloadChunkDocRef(uid, id), {
        chunk,
        chunkIndex: index,
        chunkCount: chunks.length,
        payloadEncoding: CLOUD_PAYLOAD_ENCODING_JSON_CHUNKS,
        schemaVersion: CLOUD_SCHEMA_VERSION,
        updatedAt: serverTimestamp(),
      });
    });

    // If a previous larger backup had more chunk docs than the new one, remove
    // the old fixed ids. Deleting a non-existing doc is safe.
    for (let index = 0; index < CLOUD_PAYLOAD_MAX_STALE_CHUNKS_TO_CLEAN; index += 1) {
      const id = payloadChunkDocId(index);
      if (!activeIds.has(id)) batch.delete(payloadChunkDocRef(uid, id));
    }
  }

  await batch.commit();
}

async function _pushLocalToCloudInternal({
  uid,
  appVersion = "",
  reason = "",
  cloudPayload = null,
  mergeWithCloud = false,
  readCloudBeforePush = true,
}) {
  const deviceId = await getDeviceId();
  const ref = backupDocRef(uid);

  let incomingCloudPayload =
    mergeWithCloud && cloudPayload && typeof cloudPayload === "object" ? cloudPayload : {};

  if (readCloudBeforePush && !mergeWithCloud) {
    try {
      const snap = await getDoc(ref);
      logRead(`pushLocalToCloud:prewrite:${reason || "sync"}`);
      if (snap.exists()) {
        const data = snap.data() || {};
        incomingCloudPayload = (await decodePayloadFromCloudDocAsync(uid, data)).payload || {};
        mergeWithCloud = true;
      }
    } catch (e) {
      const meta = await getMeta();
      await setMeta({ ...meta, lastError: e?.message || String(e), lastErrorAt: Date.now() });
      return {
        didSync: false,
        direction: null,
        reason: "cloud-unreachable-before-push",
        error: e?.message || String(e),
      };
    }
  }

  const cloudMigration = migratePayloadToV2(incomingCloudPayload || {});
  incomingCloudPayload = cloudMigration.payload;

  const metaBefore = await getMeta();
  let localPayload = await readLocalPayload(incomingCloudPayload);
  localPayload = await prepareLocalPayloadForSync(localPayload, deviceId, metaBefore);
  await writeLocalPayload(localPayload);

  const mergedPayload = await buildMergedPayload({
    localPayload,
    cloudPayload: incomingCloudPayload,
  });

  await writeLocalPayload(mergedPayload);

  // Before writing to Firestore, run the Setups migration against the merged
  // local+cloud payload. This makes sure old cloud setup shapes are converted
  // and uploaded as the current Setups 2.0 structure in the same push.
  const reasonTextForSetupMigration = String(reason || "").toLowerCase();
  const showSetupMigrationProgress =
    hasSetupPayloadData(mergedPayload) &&
    !(await isSetupsCloudMigrationDone(uid)) &&
    !reasonTextForSetupMigration.includes("setup-migration-upload");
  const setupMigration = await runSetupsMigrationForSync(`cloud-push:${reason || "sync"}`, { uid, showProgress: showSetupMigrationProgress });
  const finalPayload = setupMigration?.changed
    ? await readLocalPayload(mergedPayload)
    : mergedPayload;
  if (setupMigration?.changed && showSetupMigrationProgress) {
    await setSetupMigrationProgress("uploading", {
      message: "Uploading converted Setups 2.0 data back to the cloud...",
      migratedSetups: Number(setupMigration?.migratedSetups || 0),
      historyKeys: Number(setupMigration?.historyKeys || 0),
      counts: setupProgressCounts(finalPayload),
    });
  }

  const changedKeys = computeChangedKeys(localPayload, finalPayload);
  await writeLocalPayload(finalPayload);

  const localHash = await computeLocalPayloadHash(finalPayload);
  const cloudHash = mergeWithCloud ? hashString(JSON.stringify(incomingCloudPayload || {})) : "not-read";
  const mergedHash = hashString(JSON.stringify(finalPayload || {}));
  const clientUpdatedAt = Date.now();
  const { counts, payloadBytes } = payloadStats(finalPayload);
  const dirtyState = await getDirtyState();

  // Last-resort data-loss guard: never commit an empty local payload over a
  // cloud payload that still contains vehicles/tracks/setups/history.
  if (!hasCoreUserPayloadData(finalPayload) && hasCoreUserPayloadData(incomingCloudPayload)) {
    await writeLocalPayload(incomingCloudPayload);
    const rescuedHash = await computeLocalPayloadHash(incomingCloudPayload);
    const rescueMeta = await getMeta();
    await setMeta({
      ...rescueMeta,
      lastSyncAt: Date.now(),
      lastPullAt: Date.now(),
      lastDirection: "pull-rescue",
      lastPushedHash: rescuedHash,
      lastCounts: payloadStats(incomingCloudPayload).counts,
      lastError: "",
      lastErrorAt: 0,
    });
    await clearDirtyState({ lastPulledAtMs: Date.now(), lastSyncedHash: rescuedHash });
    return { didSync: true, direction: "pull", reason: "blocked-empty-push-restored-cloud", hash: rescuedHash };
  }

  const cloudPayloadDoc = encodePayloadForCloudDoc(finalPayload);

  const syncInfo = {
    lastDirection: "push",
    lastSyncAtMs: Date.now(),
    lastPushAtMs: Date.now(),
    deviceId,
    platform: Platform.OS,
    appVersion: String(appVersion || ""),
    reason: String(reason || ""),
    dirtyReasons: dirtyState?.reasons || [],
    dirtyKeys: dirtyState?.keys || [],
    localHash,
    cloudHash,
    mergedHash,
    cloudClientUpdatedAt: clientUpdatedAt,
    payloadBytes,
    payloadBytesRaw: cloudPayloadDoc.payloadBytesRaw,
    payloadBytesStored: cloudPayloadDoc.payloadBytesStored,
    payloadEncoding: cloudPayloadDoc.payloadEncoding,
    compressionReady: cloudPayloadDoc.compressionReady,
    compressionEnabled: cloudPayloadDoc.compressionEnabled,
    counts,
    changedKeys,
    setupMigrationChanged: !!setupMigration?.changed,
    schemaVersion: CLOUD_SCHEMA_VERSION,
    lastError: "",
    lastErrorAt: 0,
  };

  await commitBackupDoc({
    ref,
    uid,
    data: {
      ...cloudPayloadDoc,
      schemaVersion: CLOUD_SCHEMA_VERSION,
      clientUpdatedAt,
      appVersion: String(appVersion || ""),
      reason: String(reason || ""),
      deviceId,
      updatedAt: serverTimestamp(),
      sync: syncInfo,
    },
  });
  logWrite(`pushLocalToCloud:${reason || "sync"}`);

  const indexes = extractIdsAndFingerprints(finalPayload);
  const meta = await getMeta();
  await setMeta({
    ...meta,
    lastSyncAt: Date.now(),
    lastPushAt: Date.now(),
    lastAutoPushAt: String(reason || "").startsWith("auto") ? Date.now() : meta?.lastAutoPushAt,
    lastDirection: "push",
    lastPushedHash: localHash,
    lastCloudClientUpdatedAt: clientUpdatedAt,
    lastDeviceId: deviceId,
    schemaVersion: CLOUD_SCHEMA_VERSION,
    lastCounts: counts,
    lastPayloadBytes: payloadBytes,
    lastChangedKeys: changedKeys,
    ...indexes,
    lastError: "",
    lastErrorAt: 0,
  });

  await clearDirtyState({ lastSyncedAtMs: Date.now(), lastSyncedHash: localHash });

  const finalHasSetupData = hasSetupPayloadData(finalPayload);
  if (finalHasSetupData && !setupMigration?.alreadyDone && !setupMigration?.alreadyRunning) {
    await markSetupsCloudMigrationDone(uid, {
      reason: String(reason || "push"),
      mode: setupMigration?.changed ? "converted-and-uploaded-during-push" : "checked-and-uploaded-current-during-push",
      migratedSetups: Number(setupMigration?.migratedSetups || 0),
      historyKeys: Number(setupMigration?.historyKeys || 0),
      counts,
    });
  }

  console.log("[CloudSync] PUSH ok", { reason, hash: localHash, deviceId, changedKeys, counts });
  if (finalHasSetupData && showSetupMigrationProgress && !setupMigration?.skipped) {
    try {
      finishSetupsMigrationProgress({
        phase: "done",
        message: setupMigration?.changed
          ? "Setups migration complete. Converted setup sheets are synced."
          : "Setups are already current. No migration upload needed.",
        migratedSetups: Number(setupMigration?.migratedSetups || 0),
        historyKeys: Number(setupMigration?.historyKeys || 0),
        counts,
        autoClearMs: 2600,
      });
    } catch {}
  }
  return { didSync: true, direction: "push", hash: localHash, changedKeys, counts, payloadBytes };
}

function isManualLikeReason(reason) {
  const r = String(reason || "").toLowerCase();
  return r.includes("manual") || r.includes("signin") || r.includes("initial") || r.includes("conversion") || r.includes("purge");
}

function isDirectLocalSaveReason(reason, dirtyState = {}) {
  const text = [
    String(reason || ""),
    ...(Array.isArray(dirtyState?.reasons) ? dirtyState.reasons : []),
    ...(Array.isArray(dirtyState?.keys) ? dirtyState.keys : []),
  ]
    .join(" ")
    .toLowerCase();

  return (
    text.includes("debounced") ||
    text.includes("local-change") ||
    text.includes("vehicle") ||
    text.includes("@vehicles") ||
    text.includes("track") ||
    text.includes("@tracks") ||
    text.includes("setup") ||
    text.includes("raceday") ||
    text.includes("race-day") ||
    text.includes("@raceday")
  );
}

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

async function pushLocalToCloud(args = {}) {
  const reason = String(args?.reason || "sync");

  // One cloud write at a time. This is the most important protection against
  // Firestore queued-write exhaustion on a single device.
  if (cloudPushInFlight) {
    return {
      didSync: false,
      direction: null,
      reason: "cloud-write-already-running",
      startedAt: cloudPushStartedAt,
    };
  }

  const now = Date.now();
  const meta = await getMeta();
  const backoffUntil = Number(meta?.cloudWriteBackoffUntilAt || 0) || 0;
  const lastAttemptAt = Number(meta?.lastCloudWriteAttemptAt || 0) || 0;
  const manualLike = isManualLikeReason(reason);
  const dirtyStateForSpacing = await getDirtyState();
  const bypassSpacingGuard =
    reason.toLowerCase().includes("manual") ||
    reason.toLowerCase().includes("after-pull") ||
    reason.toLowerCase().includes("conversion-purge") ||
    isDirectLocalSaveReason(reason, dirtyStateForSpacing);

  // After Firebase says resource-exhausted, stop retrying for a while.
  if (backoffUntil && now < backoffUntil) {
    return {
      didSync: false,
      direction: null,
      reason: "cloud-write-backoff",
      retryAt: backoffUntil,
      retryInMs: Math.max(0, backoffUntil - now),
    };
  }

  // Even manual-like calls are spaced. If an effect loop is calling sign-in sync
  // or heartbeat-style sync repeatedly, this prevents a write storm.
  if (!bypassSpacingGuard && lastAttemptAt && now - lastAttemptAt < CLOUD_WRITE_MIN_SPACING_MS) {
    return {
      didSync: false,
      direction: null,
      reason: manualLike ? "cloud-write-spacing-guard" : "auto-write-spacing-guard",
      retryAt: lastAttemptAt + CLOUD_WRITE_MIN_SPACING_MS,
      retryInMs: Math.max(0, lastAttemptAt + CLOUD_WRITE_MIN_SPACING_MS - now),
    };
  }

  await setMeta({
    ...meta,
    lastCloudWriteAttemptAt: now,
    lastError: "",
    lastErrorAt: 0,
  });

  cloudPushStartedAt = now;
  cloudPushInFlight = _pushLocalToCloudInternal(args)
    .then(async (result) => {
      if (result?.didSync) {
        const okMeta = await getMeta();
        await setMeta({ ...okMeta, cloudWriteBackoffUntilAt: 0, lastError: "", lastErrorAt: 0 });
      }
      return result;
    })
    .catch(async (e) => {
      const msg = e?.message || String(e);
      const nextMeta = await getMeta();
      const patch = {
        ...nextMeta,
        lastError: msg,
        lastErrorAt: Date.now(),
        lastFailedCloudWriteAt: Date.now(),
      };
      if (isResourceExhaustedError(e)) {
        patch.cloudWriteBackoffUntilAt = Date.now() + CLOUD_WRITE_ERROR_BACKOFF_MS;
      }
      await setMeta(patch);
      return {
        didSync: false,
        direction: null,
        reason: isResourceExhaustedError(e) ? "resource-exhausted-backoff" : "cloud-write-failed",
        error: msg,
        retryAt: patch.cloudWriteBackoffUntilAt || 0,
      };
    })
    .finally(() => {
      cloudPushInFlight = null;
      cloudPushStartedAt = 0;
      notifySyncStatusListeners();
    });

  return cloudPushInFlight;
}

async function pullCloudToLocal({ uid, cloudSnap = null }) {
  const ref = backupDocRef(uid);
  const snap = cloudSnap || (await getDoc(ref));
  if (!cloudSnap) logRead("pullCloudToLocal");
  if (!snap.exists()) return { didSync: false, direction: null, mode: "no-cloud" };

  const data = snap.data() || {};
  const decodedCloudPayload = (await decodePayloadFromCloudDocAsync(uid, data)).payload || {};
  const cloudPayloadRaw = migratePayloadToV2(decodedCloudPayload).payload;
  const showSetupMigrationProgress = hasSetupPayloadData(cloudPayloadRaw) && !(await isSetupsCloudMigrationDone(uid));
  if (showSetupMigrationProgress) {
    try {
      beginSetupsMigrationProgress({
        active: true,
        title: "Setups Migration",
        phase: "downloaded",
        message: "Downloaded setup data from the cloud. Checking old setup format...",
        counts: setupProgressCounts(cloudPayloadRaw),
        startedAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch {}
  }
  const localPayload = await readLocalPayload(cloudPayloadRaw);
  const localCoreEmpty = !hasCoreUserPayloadData(localPayload);
  const cloudHasCoreData = hasCoreUserPayloadData(cloudPayloadRaw);

  // Fresh install safety: when the device has no vehicles/tracks/setups yet,
  // restore the cloud payload directly. Do not let empty local bookkeeping keys
  // participate in the merge and accidentally look like a valid local backup.
  const mergedPayload = localCoreEmpty && cloudHasCoreData
    ? cloudPayloadRaw
    : await buildMergedPayload({ localPayload, cloudPayload: cloudPayloadRaw });
  await writeLocalPayload(mergedPayload);

  // After cloud data is saved locally, run the Setups-specific migration.
  // This converts old setup keys/old setup shapes into @setups and
  // @setupHistory_{vehicleId}__{trackId} before Dashboard/Setups read them.
  const setupMigration = await runSetupsMigrationForSync("cloud-pull-to-local", { uid, showProgress: showSetupMigrationProgress });
  const finalPayload = setupMigration?.changed
    ? await readLocalPayload(mergedPayload)
    : mergedPayload;
  const changedKeys = computeChangedKeys(localPayload, finalPayload);

  const localHash = await computeLocalPayloadHash(finalPayload);
  const cloudHash = hashString(JSON.stringify(cloudPayloadRaw || {}));
  const cloudClientUpdatedAt = Number(data.clientUpdatedAt) || 0;
  const { counts, payloadBytes } = payloadStats(finalPayload);
  const indexes = extractIdsAndFingerprints(finalPayload);

  const meta = await getMeta();
  await setMeta({
    ...meta,
    lastSyncAt: Date.now(),
    lastPullAt: Date.now(),
    lastDirection: "pull",
    lastPushedHash: localHash,
    lastCloudClientUpdatedAt: cloudClientUpdatedAt,
    lastCounts: counts,
    lastPayloadBytes: payloadBytes,
    lastChangedKeys: changedKeys,
    lastSetupsMigration: setupMigration?.changed ? setupMigration : meta?.lastSetupsMigration,
    ...indexes,
    lastError: "",
    lastErrorAt: 0,
  });

  await clearDirtyState({ lastPulledAtMs: Date.now(), lastSyncedHash: localHash });

  console.log("[CloudSync] PULL ok", { hash: localHash, cloudClientUpdatedAt, changedKeys, counts, setupMigrationChanged: !!setupMigration?.changed });
  if (hasSetupPayloadData(cloudPayloadRaw) && !setupMigration?.changed && !setupMigration?.alreadyRunning) {
    await markSetupsCloudMigrationDone(uid, {
      reason: "cloud-pull-to-local",
      mode: setupMigration?.alreadyDone ? "already-complete-skip" : "already-current-after-pull",
      counts,
    });

    if (showSetupMigrationProgress && !setupMigration?.skipped) {
      try {
        finishSetupsMigrationProgress({
          phase: "done",
          message: "Downloaded setup data is already in Setups 2.0 format.",
          counts,
          autoClearMs: 2000,
        });
      } catch {}
    }
  }
  return {
    didSync: true,
    direction: "pull",
    hash: localHash,
    changedKeys,
    counts,
    cloudHash,
    payloadBytes,
    setupMigration,
    setupMigrationChanged: !!setupMigration?.changed,
  };
}


// -----------------------------------------------------------------------------
// Dashboard sync light helpers (local-only, no Firestore reads)
// -----------------------------------------------------------------------------
export async function getCloudSyncStatus({ uid = "" } = {}) {
  const meta = await getMeta();
  const dirty = await getDirtyState();
  const now = Date.now();
  const lastError = String(meta?.lastError || "");
  const lastErrorAt = Number(meta?.lastErrorAt || meta?.lastFailedSyncAt || meta?.lastFailedCloudWriteAt || 0) || 0;
  const lastSyncAt = Number(meta?.lastSyncAt || 0) || 0;
  const lastPushAt = Number(meta?.lastPushAt || 0) || 0;
  const lastPullAt = Number(meta?.lastPullAt || 0) || 0;
  const isDirty = !!dirty?.dirty;
  const pending = !!pendingTimer;
  const syncRunning = !!syncInFlight;
  const cloudWriteRunning = !!cloudPushInFlight;
  const backoffUntil = Number(meta?.cloudWriteBackoffUntilAt || 0) || 0;
  const inBackoff = backoffUntil && now < backoffUntil;
  const errorIsCurrent = !!lastError && (!lastSyncAt || !lastErrorAt || lastErrorAt > lastSyncAt);
  const cleanAfterSuccessfulSync = !!lastSyncAt && !isDirty && !pending;
  const nonFatalStatusError = /sync-already-running|spacing|throttl|backoff|resource-exhausted|queued|slow down|deferred|no-change|already running/i.test(lastError);

  if (!uid) {
    return {
      state: "signed_out",
      color: "gray",
      label: "Sign In",
      message: "Sign in to sync between devices.",
      dirty: isDirty,
      pending,
      lastSyncAt,
      schemaVersion: CLOUD_SCHEMA_VERSION,
    };
  }

  if (syncRunning || cloudWriteRunning) {
    return {
      state: "syncing",
      color: "yellow",
      label: "Syncing",
      message: syncInFlightLabel
        ? `Cloud sync is running: ${syncInFlightLabel}.`
        : "Cloud sync is running.",
      dirty: true,
      pending: true,
      syncStartedAt: syncInFlightStartedAt || cloudPushStartedAt || 0,
      lastSyncAt,
      lastPushAt,
      lastPullAt,
      schemaVersion: CLOUD_SCHEMA_VERSION,
    };
  }

  if (inBackoff) {
    return {
      state: "backoff",
      color: "yellow",
      label: "Sync Paused",
      message: `Firebase asked us to slow down. Retry in ${Math.ceil((backoffUntil - now) / 1000)}s.`,
      dirty: isDirty,
      pending,
      retryAt: backoffUntil,
      lastSyncAt,
      lastPushAt,
      lastPullAt,
      schemaVersion: CLOUD_SCHEMA_VERSION,
    };
  }

  if (lastError && errorIsCurrent) {
    // Do not keep the dashboard red for stale/background write-back issues after
    // the app already completed a valid pull/sync and has no local changes queued.
    // Red is reserved for a real current failure while data is dirty or no sync has
    // ever completed on this device.
    if (cleanAfterSuccessfulSync || nonFatalStatusError) {
      return {
        state: cleanAfterSuccessfulSync ? "synced" : "pending",
        color: cleanAfterSuccessfulSync ? "green" : "yellow",
        label: cleanAfterSuccessfulSync ? "Synced" : "Sync Pending",
        message: cleanAfterSuccessfulSync
          ? `Last synced ${Math.max(0, Math.round((now - lastSyncAt) / 1000))}s ago`
          : "A background sync/write-back is queued or throttled.",
        dirty: isDirty,
        pending,
        lastWarning: lastError,
        lastErrorAt,
        lastSyncAt,
        lastPushAt,
        lastPullAt,
        lastDirection: meta?.lastDirection || "",
        counts: meta?.lastCounts || {},
        schemaVersion: CLOUD_SCHEMA_VERSION,
      };
    }

    return {
      state: "error",
      color: "red",
      label: "Sync Error",
      message: lastError,
      dirty: isDirty,
      pending,
      lastErrorAt,
      lastSyncAt,
      lastPushAt,
      lastPullAt,
      schemaVersion: CLOUD_SCHEMA_VERSION,
    };
  }

  if (pending) {
    return {
      state: "pending",
      color: "yellow",
      label: "Sync Pending",
      message: "Local changes are queued for cloud sync.",
      dirty: true,
      pending: true,
      lastSyncAt,
      lastPushAt,
      lastPullAt,
      schemaVersion: CLOUD_SCHEMA_VERSION,
    };
  }

  if (isDirty) {
    return {
      state: "dirty",
      color: "yellow",
      label: "Unsynced",
      message: "Local changes have not synced yet.",
      dirty: true,
      pending: false,
      dirtyReasons: dirty?.reasons || [],
      dirtyKeys: dirty?.keys || [],
      lastSyncAt,
      lastPushAt,
      lastPullAt,
      schemaVersion: CLOUD_SCHEMA_VERSION,
    };
  }

  if (lastSyncAt) {
    return {
      state: "synced",
      color: "green",
      label: "Synced",
      message: `Last synced ${Math.max(0, Math.round((now - lastSyncAt) / 1000))}s ago`,
      dirty: false,
      pending: false,
      lastSyncAt,
      lastPushAt,
      lastPullAt,
      lastDirection: meta?.lastDirection || "",
      counts: meta?.lastCounts || {},
      schemaVersion: CLOUD_SCHEMA_VERSION,
    };
  }

  return {
    state: "ready",
    color: "gray",
    label: "Ready",
    message: "No cloud sync has run on this device yet.",
    dirty: false,
    pending: false,
    lastSyncAt: 0,
    schemaVersion: CLOUD_SCHEMA_VERSION,
  };
}

export function subscribeCloudSyncStatus(cb, { uid = "", intervalMs = 2000 } = {}) {
  if (typeof cb !== "function") return () => {};
  const entry = { cb, uid };
  statusListeners.add(entry);

  let stopped = false;
  let timer = null;
  const tick = async () => {
    if (stopped) return;
    try {
      cb(await getCloudSyncStatus({ uid }));
    } catch {}
    timer = setTimeout(tick, Math.max(1000, Number(intervalMs || 2000)));
  };
  tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    statusListeners.delete(entry);
  };
}

export async function clearCloudSyncError() {
  const meta = await getMeta();
  await setMeta({ ...meta, lastError: "", lastErrorAt: 0, cloudWriteBackoffUntilAt: 0 });
  return { ok: true };
}

async function runExclusiveSyncOperation(label, fn) {
  if (syncInFlight) {
    const activeLabel = syncInFlightLabel;
    const activeStartedAt = syncInFlightStartedAt;

    // Do not report a fake failure while another real sync is already running.
    // Dashboard initial restore, setup migration sync, and manual name-pill sync
    // can overlap during app launch. The waiting caller should receive the real
    // result from the active sync so the dashboard light can turn green after it
    // completes instead of getting stuck on a "sync-already-running" result.
    try {
      const result = await syncInFlight;
      return {
        ...(result || { didSync: false, direction: null }),
        waitedForExistingSync: true,
        requestedLabel: String(label || "sync"),
        activeLabel,
        startedAt: activeStartedAt,
      };
    } catch (e) {
      return {
        didSync: false,
        direction: null,
        reason: "sync-failed",
        error: e?.message || String(e),
        waitedForExistingSync: true,
        requestedLabel: String(label || "sync"),
        activeLabel,
        startedAt: activeStartedAt,
      };
    }
  }

  syncInFlightLabel = String(label || "sync");
  syncInFlightStartedAt = Date.now();

  syncInFlight = Promise.resolve()
    .then(fn)
    .catch(async (e) => {
      const msg = e?.message || String(e);
      const meta = await getMeta();
      await setMeta({ ...meta, lastError: msg, lastErrorAt: Date.now(), lastFailedSyncAt: Date.now() });
      return { didSync: false, direction: null, reason: "sync-failed", error: msg };
    })
    .finally(() => {
      syncInFlight = null;
      syncInFlightLabel = "";
      syncInFlightStartedAt = 0;
      notifySyncStatusListeners();
    });

  notifySyncStatusListeners();
  return syncInFlight;
}

async function runV2ConversionAndPurgeInternal({ uid, appVersion = "" } = {}) {
  if (!uid) return { didSync: false, mode: "missing-uid" };
  await runV2LocalMigration({ reason: "manual-v2-conversion-purge", purgeLegacy: true });

  const ref = backupDocRef(uid);
  let snap;
  try {
    snap = await getDoc(ref);
    logRead("runV2ConversionAndPurge");
  } catch (e) {
    const meta = await getMeta();
    await setMeta({ ...meta, lastError: e?.message || String(e), lastErrorAt: Date.now() });
    return { didSync: false, reason: "cloud-unreachable", error: e?.message || String(e) };
  }

  const cloudData = snap.exists() ? snap.data() || {} : {};
  const cloudPayload = migratePayloadToV2((await decodePayloadFromCloudDocAsync(uid, cloudData)).payload || {}).payload;
  return pushLocalToCloud({
    uid,
    appVersion,
    reason: "v2-conversion-purge",
    cloudPayload,
    mergeWithCloud: snap.exists(),
    readCloudBeforePush: false,
  });
}

async function isLocalRaceDayInProgress() {
  try {
    const [activeRaw, endedRaw] = await Promise.all([
      AsyncStorage.getItem("@raceDayActive_v1"),
      AsyncStorage.getItem("@raceDayEnded_v1"),
    ]);
    const ended = isTruthyStoredFlag(endedRaw);
    if (ended || !activeRaw) return false;
    const active = safeJsonParse(activeRaw, null);
    return !!(active && typeof active === "object" && firstNonEmpty(active?.id, active?.raceDayId, active?.sessionId, active?.trackId));
  } catch {
    return false;
  }
}

function isRaceDayLocalOnlyReason(reason = "") {
  const value = String(reason || "").toLowerCase();
  return value.startsWith("raceday-") && value !== "raceday-ended" && value !== "raceday-archived";
}

// -----------------------------------------------------------------------------
// Public API for screens: local-only dirty helpers
// -----------------------------------------------------------------------------
export async function markCloudDirty({ reason = "local-change", key = "", keys = [], type = "", id = "" } = {}) {
  const deviceId = await getDeviceId();
  const now = Date.now();
  const prev = await getDirtyState();

  const reasonSet = new Set([...(prev?.reasons || []), String(reason || "local-change")]);
  const keySet = new Set([...(prev?.keys || [])]);
  if (key) keySet.add(String(key));
  for (const k of Array.isArray(keys) ? keys : []) if (k) keySet.add(String(k));

  const entities = Array.isArray(prev?.entities) ? [...prev.entities] : [];
  if (type || id) {
    const entity = { type: String(type || ""), id: String(id || ""), atMs: now };
    const entityKey = `${entity.type}:${entity.id}`;
    const existingKeys = new Set(entities.map((e) => `${String(e?.type || "")}:${String(e?.id || "")}`));
    if (!existingKeys.has(entityKey)) entities.push(entity);
  }

  const next = {
    dirty: true,
    firstDirtyAtMs: prev?.dirty ? prev?.firstDirtyAtMs || now : now,
    lastDirtyAtMs: now,
    deviceId,
    reasons: Array.from(reasonSet).filter(Boolean).slice(-25),
    keys: Array.from(keySet).filter(Boolean).slice(-50),
    entities: entities.slice(-50),
  };

  await setDirtyState(next);

  // If the user is signed in, queue one debounced cloud sync right away.
  // This keeps local screen saves local-first, but prevents the Dashboard from
  // sitting on unsynced setup changes until the next foreground/interval tick.
  try {
    const uid = auth?.currentUser?.uid || "";
    if (uid) {
      const raceDayInProgress = await isLocalRaceDayInProgress();
      // Never merge cloud data into a RaceDay while it is being created or run.
      // Keep the dirty flag so the complete local state uploads after End RaceDay.
      if (!(raceDayInProgress && isRaceDayLocalOnlyReason(reason))) {
        scheduleCloudSync({
          uid,
          reason: String(reason || "local-change"),
          delayMs: AUTO_SYNC_DEBOUNCE_MS,
        }).catch(() => {});
      }
    }
  } catch {}

  notifySyncStatusListeners();
  return { ok: true, dirty: true, state: next };
}

export const markLocalDirty = markCloudDirty;
export const markCloudSyncDirty = markCloudDirty;

export async function touchItemForCloud(item) {
  const deviceId = await getDeviceId();
  const now = Date.now();
  return {
    ...(item || {}),
    updatedAtMs: now,
    syncUpdatedAt: now,
    syncDeviceId: deviceId,
  };
}

export async function markItemDeletedForCloud({ type, id, key = "" }) {
  const cleanType = String(type || "").trim();
  const cleanId = String(id || "").trim();
  const cleanKey = String(key || "").trim();
  if (!cleanType || !cleanId) return { ok: false, reason: "missing-type-or-id" };

  const deviceId = await getDeviceId();
  const raw = await AsyncStorage.getItem("@deleted_v1");
  const tombs = safeJsonParse(raw || "[]", []);
  const deletedAt = Date.now();

  const next = normalizeTombstones([
    ...(Array.isArray(tombs) ? tombs : []),
    { type: cleanType, id: cleanId, key: cleanKey, deletedAt, deviceId },
  ]);

  await AsyncStorage.setItem("@deleted_v1", JSON.stringify(next));
  await markCloudDirty({
    reason: "delete",
    key: "@deleted_v1",
    type: cleanType,
    id: cleanId,
  });

  return { ok: true, type: cleanType, id: cleanId, key: cleanKey, deletedAt };
}

export async function getCloudDirtyState() {
  return getDirtyState();
}

// -----------------------------------------------------------------------------
// Public API for service/root sync only
// -----------------------------------------------------------------------------
async function autoCloudSyncOnSignInInternal({ uid, appVersion = "" }) {
  if (!uid) return { didSync: false, mode: "missing-uid" };

  await ensureV2LocalMigrationDone("signin");

  const ref = backupDocRef(uid);
  const snap = await getDoc(ref);
  logRead("autoCloudSyncOnSignIn");

  const cloudExists = snap.exists();
  const cloudData = cloudExists ? snap.data() || {} : {};
  const cloudMigration = migratePayloadToV2((await decodePayloadFromCloudDocAsync(uid, cloudData)).payload || {});
  const cloudPayload = cloudMigration.payload;
  const cloudNeedsPurge = cloudExists && (cloudMigration.changed || cloudData.schemaVersion !== CLOUD_SCHEMA_VERSION);
  const localEmpty = await isLocalEmpty();
  const localCoreEmpty = await isLocalCoreUserDataEmpty(cloudPayload);
  const cloudHasCoreData = hasCoreUserPayloadData(cloudPayload);

  // Fresh install / cleared storage safety:
  // Migration/schema flags or RaceDay ended flags can make local storage look
  // "not empty" even when there are no vehicles, tracks, or setups. In that
  // case we must PULL first. Never push an empty local shell over a real cloud
  // backup during the initial sign-in restore.
  if (cloudExists && localCoreEmpty && cloudHasCoreData) {
    const pulled = await pullCloudToLocal({ uid, cloudSnap: snap });

    // Restore-first rule:
    // A fresh install must finish the download and refresh the dashboard before
    // attempting a schema/write-back repair. Pushing immediately after a large
    // conversion can make the sync feel hung and can leave the dot red if
    // Firebase asks us to slow down. The old cloud payload remains readable and
    // will be repaired on a later real local-change push.
    if (cloudNeedsPurge) {
      const meta = await getMeta();
      await setMeta({
        ...meta,
        cloudNeedsSchemaRepair: true,
        cloudNeedsSchemaRepairAt: Date.now(),
        cloudNeedsSchemaRepairReason: "signin-after-core-pull",
        lastError: "",
        lastErrorAt: 0,
      });
      await clearDirtyState({ lastRestorePulledAtMs: Date.now(), restoreNeedsCloudRepair: true });
    }

    const pullResult = {
      ...pulled,
      reason: pulled?.reason || "signin-core-empty-pulled-cloud",
      cloudNeedsPurge,
      cloudRepairDeferred: !!cloudNeedsPurge,
    };

    return uploadSetupsMigrationAfterPull({
      uid,
      appVersion,
      pulled: pullResult,
      cloudPayload,
      reason: "signin-setup-migration-upload",
    });
  }

  if (localEmpty && cloudExists) {
    const pulled = await pullCloudToLocal({ uid, cloudSnap: snap });

    // Same restore-first rule for older empty-local detection.
    if (cloudNeedsPurge) {
      const meta = await getMeta();
      await setMeta({
        ...meta,
        cloudNeedsSchemaRepair: true,
        cloudNeedsSchemaRepairAt: Date.now(),
        cloudNeedsSchemaRepairReason: "signin-after-empty-pull",
        lastError: "",
        lastErrorAt: 0,
      });
      await clearDirtyState({ lastRestorePulledAtMs: Date.now(), restoreNeedsCloudRepair: true });
    }

    const pullResult = {
      ...pulled,
      reason: pulled?.reason || "signin-empty-pulled-cloud",
      cloudNeedsPurge,
      cloudRepairDeferred: !!cloudNeedsPurge,
    };

    return uploadSetupsMigrationAfterPull({
      uid,
      appVersion,
      pulled: pullResult,
      cloudPayload,
      reason: "signin-setup-migration-upload",
    });
  }

  // If both sides are effectively empty, verify the account without uploading
  // an empty payload over a backup that may still be recoverable elsewhere.
  if (cloudExists && localCoreEmpty && !cloudHasCoreData) {
    const meta = await getMeta();
    await setMeta({
      ...meta,
      lastSyncAt: Date.now(),
      lastPullAt: Date.now(),
      lastDirection: "verify-empty",
      lastCounts: payloadStats(cloudPayload).counts,
      lastError: "",
      lastErrorAt: 0,
    });
    await clearDirtyState({ lastVerifiedEmptyAtMs: Date.now() });
    return { didSync: false, direction: null, reason: "signin-cloud-empty-local-empty" };
  }

  if (!cloudExists) {
    const payload = await readLocalPayload();
    const anyLocal = Object.entries(payload || {}).some(([key, v]) => {
      if (key === "@deleted_v1") return false;
      const t = String(v ?? "").trim();
      return t && t !== "[]" && t !== "{}";
    });
    if (anyLocal) {
      await markCloudDirty({ reason: "initial-cloud-create" });
      return pushLocalToCloud({
        uid,
        appVersion,
        reason: "initial",
        readCloudBeforePush: false,
      });
    }
    {
      const meta = await getMeta();
      await setMeta({
        ...meta,
        lastSyncAt: Date.now(),
        lastDirection: "verify-empty",
        lastCounts: payloadStats({}).counts,
        lastError: "",
        lastErrorAt: 0,
      });
      await clearDirtyState({ lastVerifiedEmptyAtMs: Date.now() });
    }
    return { didSync: false, direction: null, reason: "no-cloud-and-local-empty" };
  }

  const meta = await getMeta();
  const localHash = await computeLocalPayloadHash();
  const lastPushedHash = String(meta?.lastPushedHash || "");
  const dirtyState = await getDirtyState();
  const localDirty = !!dirtyState?.dirty || !lastPushedHash || lastPushedHash !== localHash;

  if (localDirty) {
    return pushLocalToCloud({
      uid,
      appVersion,
      reason: "signin-local-changed",
      cloudPayload,
      mergeWithCloud: true,
      readCloudBeforePush: false,
    });
  }

  if (cloudNeedsPurge && migrationNotesIncludeSetups(cloudMigration)) {
    await markCloudDirty({
      reason: "signin-cloud-setup-legacy-conversion",
      keys: ["@setups"],
      type: "setup-migration",
      id: "setups-2.0",
    });
    return pushLocalToCloud({
      uid,
      appVersion,
      reason: "signin-cloud-setup-migration-upload",
      cloudPayload,
      mergeWithCloud: true,
      readCloudBeforePush: false,
    });
  }

  {
    const okMeta = await getMeta();
    await setMeta({
      ...okMeta,
      lastSyncAt: Date.now(),
      lastError: "",
      lastErrorAt: 0,
      cloudNeedsSchemaRepair: !!cloudNeedsPurge,
      cloudNeedsSchemaRepairAt: cloudNeedsPurge ? Date.now() : okMeta?.cloudNeedsSchemaRepairAt,
      cloudNeedsSchemaRepairReason: cloudNeedsPurge ? "signin-no-local-change" : okMeta?.cloudNeedsSchemaRepairReason,
    });
    await clearDirtyState({ lastVerifiedAtMs: Date.now(), restoreNeedsCloudRepair: !!cloudNeedsPurge });
  }
  return { didSync: false, direction: null, reason: cloudNeedsPurge ? "signin-cloud-repair-deferred" : "signin-no-change", cloudRepairDeferred: !!cloudNeedsPurge };
}

async function maybeAutoSyncTickInternal({ uid, appVersion = "", reason = "tick" }) {
  if (!uid) return { didSync: false, mode: "missing-uid" };

  // Auto sync is intentionally paused while an active RaceDay exists. A cloud
  // read/merge here can replace a partially-created RaceDay with older state.
  // Manual sync remains available, and ending the RaceDay resumes auto sync.
  if (await isLocalRaceDayInProgress()) {
    return { didSync: false, direction: null, reason: "active-raceday-local-lock" };
  }

  await ensureV2LocalMigrationDone(`auto:${reason || "tick"}`);

  // No cloud read while clean. This is what protects the app from burning reads
  // while Dashboard or other screens re-render.
  syncCounters.blockedAutoReads += 1;

  const meta = await getMeta();
  const dirtyState = await getDirtyState();
  const localHash = await computeLocalPayloadHash();
  const lastPushedHash = String(meta?.lastPushedHash || "");
  const localDirty = !!dirtyState?.dirty || !lastPushedHash || lastPushedHash !== localHash;

  if (!localDirty) return { didSync: false, direction: null, reason: "no-change" };

  const now = Date.now();
  const lastAutoPushAt = Number(meta?.lastAutoPushAt || 0) || 0;
  const directLocalSave = isDirectLocalSaveReason(reason, dirtyState);
  if (!directLocalSave && now - lastAutoPushAt < AUTO_SYNC_MIN_INTERVAL_MS) {
    return {
      didSync: false,
      direction: null,
      reason: "auto-throttled",
      nextAllowedAt: lastAutoPushAt + AUTO_SYNC_MIN_INTERVAL_MS,
    };
  }

  return pushLocalToCloud({
    uid,
    appVersion,
    reason: `auto:${reason || "tick"}`,
    readCloudBeforePush: true,
  });
}

export async function scheduleCloudSync({
  uid,
  appVersion = "",
  reason = "debounced",
  delayMs = AUTO_SYNC_DEBOUNCE_MS,
} = {}) {
  if (!uid) return { didSync: false, mode: "missing-uid" };

  pendingRequest = { uid, appVersion, reason };

  if (pendingTimer) clearTimeout(pendingTimer);

  notifySyncStatusListeners();

  pendingTimer = setTimeout(() => {
    const req = pendingRequest;
    pendingTimer = null;
    pendingRequest = null;

    if (!req?.uid) return;
    maybeAutoSyncTick({
      uid: req.uid,
      appVersion: req.appVersion,
      reason: `debounced:${req.reason || "local-change"}`,
    }).catch((e) => console.log("[CloudSync] debounced sync failed", e?.message || String(e)));
  }, Math.max(1000, Number(delayMs || AUTO_SYNC_DEBOUNCE_MS)));

  return { didSync: false, direction: null, reason: "scheduled", delayMs };
}

export async function cancelScheduledCloudSync() {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  pendingRequest = null;
  notifySyncStatusListeners();
  return { ok: true };
}

// Backwards-compatible export name. It stays service-layer only and is safe to
// call repeatedly because it will not read Firestore unless dirty + throttle passes.
export async function maybeAutoBackupIfChanged({ uid, appVersion = "", reason = "auto" }) {
  return maybeAutoSyncTick({ uid, appVersion, reason });
}

async function runManualCloudSyncInternal({ uid, appVersion = "" }) {
  if (!uid) return { didSync: false, mode: "missing-uid" };

  await ensureV2LocalMigrationDone("manual");

  const ref = backupDocRef(uid);
  let snap;
  try {
    snap = await getDoc(ref);
    logRead("runManualCloudSync");
  } catch (e) {
    const meta = await getMeta();
    await setMeta({ ...meta, lastError: e?.message || String(e), lastErrorAt: Date.now() });
    return {
      didSync: false,
      direction: null,
      reason: "cloud-unreachable",
      error: e?.message || String(e),
    };
  }

  const cloudExists = snap.exists();
  const cloudData = cloudExists ? snap.data() || {} : {};
  const cloudClientUpdatedAt = Number(cloudData.clientUpdatedAt) || 0;
  const cloudMigration = migratePayloadToV2((await decodePayloadFromCloudDocAsync(uid, cloudData)).payload || {});
  const cloudPayload = cloudMigration.payload;
  const cloudNeedsPurge = cloudExists && (cloudMigration.changed || cloudData.schemaVersion !== CLOUD_SCHEMA_VERSION);
  const localCoreEmpty = await isLocalCoreUserDataEmpty(cloudPayload);
  const cloudHasCoreData = hasCoreUserPayloadData(cloudPayload);

  // Fresh install / reinstall safety for the same path used by tapping the
  // name pill. If core local data is empty and cloud has core app data, pull
  // before considering local dirty/hash state.
  if (cloudExists && localCoreEmpty && cloudHasCoreData) {
    const pulled = await pullCloudToLocal({ uid, cloudSnap: snap });

    // Restore-first rule for manual/name-pill sync. Finish the cloud download
    // and let Dashboard refresh before any optional schema repair write-back.
    if (cloudNeedsPurge) {
      const meta = await getMeta();
      await setMeta({
        ...meta,
        cloudNeedsSchemaRepair: true,
        cloudNeedsSchemaRepairAt: Date.now(),
        cloudNeedsSchemaRepairReason: "manual-after-core-pull",
        lastError: "",
        lastErrorAt: 0,
      });
      await clearDirtyState({ lastRestorePulledAtMs: Date.now(), restoreNeedsCloudRepair: true });
    }

    const pullResult = {
      ...pulled,
      reason: pulled?.reason || "manual-core-empty-pulled-cloud",
      cloudNeedsPurge,
      cloudRepairDeferred: !!cloudNeedsPurge,
    };

    return uploadSetupsMigrationAfterPull({
      uid,
      appVersion,
      pulled: pullResult,
      cloudPayload,
      reason: "manual-setup-migration-upload",
    });
  }

  const meta = await getMeta();
  const dirtyState = await getDirtyState();
  const localHash = await computeLocalPayloadHash();
  const lastPushedHash = String(meta?.lastPushedHash || "");
  const lastCloudSeen = Number(meta?.lastCloudClientUpdatedAt || 0) || 0;
  const localEmpty = await isLocalEmpty();
  const localDirty = !!dirtyState?.dirty || !lastPushedHash || lastPushedHash !== localHash;

  if (localEmpty && cloudExists) {
    const pulled = await pullCloudToLocal({ uid, cloudSnap: snap });

    // Same restore-first rule for older empty-local detection.
    if (cloudNeedsPurge) {
      const meta = await getMeta();
      await setMeta({
        ...meta,
        cloudNeedsSchemaRepair: true,
        cloudNeedsSchemaRepairAt: Date.now(),
        cloudNeedsSchemaRepairReason: "manual-after-empty-pull",
        lastError: "",
        lastErrorAt: 0,
      });
      await clearDirtyState({ lastRestorePulledAtMs: Date.now(), restoreNeedsCloudRepair: true });
    }

    const pullResult = {
      ...pulled,
      reason: pulled?.reason || "manual-empty-pulled-cloud",
      cloudNeedsPurge,
      cloudRepairDeferred: !!cloudNeedsPurge,
    };

    return uploadSetupsMigrationAfterPull({
      uid,
      appVersion,
      pulled: pullResult,
      cloudPayload,
      reason: "manual-setup-migration-upload",
    });
  }

  // If both sides are effectively empty, do not push empty local state.
  if (cloudExists && localCoreEmpty && !cloudHasCoreData) {
    const meta = await getMeta();
    await setMeta({
      ...meta,
      lastSyncAt: Date.now(),
      lastPullAt: Date.now(),
      lastDirection: "verify-empty",
      lastCounts: payloadStats(cloudPayload).counts,
      lastError: "",
      lastErrorAt: 0,
    });
    await clearDirtyState({ lastVerifiedEmptyAtMs: Date.now() });
    return { didSync: false, direction: null, reason: "manual-cloud-empty-local-empty" };
  }

  if (cloudExists && cloudClientUpdatedAt > lastCloudSeen && !localDirty) {
    const pulled = await pullCloudToLocal({ uid, cloudSnap: snap });
    return uploadSetupsMigrationAfterPull({
      uid,
      appVersion,
      pulled,
      cloudPayload,
      reason: "manual-setup-migration-upload",
    });
  }

  if (localDirty || !cloudExists) {
    return pushLocalToCloud({
      uid,
      appVersion,
      reason: "manual",
      cloudPayload,
      mergeWithCloud: cloudExists,
      readCloudBeforePush: false,
    });
  }

  if (cloudNeedsPurge && migrationNotesIncludeSetups(cloudMigration)) {
    await markCloudDirty({
      reason: "manual-cloud-setup-legacy-conversion",
      keys: ["@setups"],
      type: "setup-migration",
      id: "setups-2.0",
    });
    return pushLocalToCloud({
      uid,
      appVersion,
      reason: "manual-cloud-setup-migration-upload",
      cloudPayload,
      mergeWithCloud: true,
      readCloudBeforePush: false,
    });
  }

  {
    const okMeta = await getMeta();
    await setMeta({
      ...okMeta,
      lastSyncAt: Date.now(),
      lastError: "",
      lastErrorAt: 0,
      cloudNeedsSchemaRepair: !!cloudNeedsPurge,
      cloudNeedsSchemaRepairAt: cloudNeedsPurge ? Date.now() : okMeta?.cloudNeedsSchemaRepairAt,
      cloudNeedsSchemaRepairReason: cloudNeedsPurge ? "manual-no-local-change" : okMeta?.cloudNeedsSchemaRepairReason,
    });
    await clearDirtyState({ lastVerifiedAtMs: Date.now(), restoreNeedsCloudRepair: !!cloudNeedsPurge });
  }
  return { didSync: false, direction: null, reason: cloudNeedsPurge ? "manual-cloud-repair-deferred" : "manual-no-change", cloudRepairDeferred: !!cloudNeedsPurge };
}


// -----------------------------------------------------------------------------
// Public sync wrappers. These keep the Dashboard light yellow/syncing until the
// entire sync path completes (read, merge, local write, cloud write/backoff), and
// they prevent multiple Dashboard/app effects from running the same sync at once.
// -----------------------------------------------------------------------------
export function isCloudSyncInFlight() {
  return !!syncInFlight || !!cloudPushInFlight;
}

export async function autoCloudSyncOnSignIn(args = {}) {
  return runExclusiveSyncOperation("sign-in", () => autoCloudSyncOnSignInInternal(args));
}

export async function maybeAutoSyncTick(args = {}) {
  return runExclusiveSyncOperation(`auto:${args?.reason || "tick"}`, () => maybeAutoSyncTickInternal(args));
}

export async function runManualCloudSync(args = {}) {
  return runExclusiveSyncOperation("manual", () => runManualCloudSyncInternal(args));
}

export async function runV2ConversionAndPurge(args = {}) {
  return runExclusiveSyncOperation("v2-conversion-purge", () => runV2ConversionAndPurgeInternal(args));
}
