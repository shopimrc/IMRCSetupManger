import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { Platform } from "react-native";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebaseClient";

const POLICY_COLLECTION = "appConfig";
const POLICY_DOCUMENT = "versionPolicy";
const CACHE_KEY = "@imrc_version_policy_v1";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const INSTALLED_APP_VERSION =
  Application.nativeApplicationVersion || "0.0.0";

const DEFAULT_POLICY = Object.freeze({
  androidMinimumVersion: "2.0.10",
  androidCurrentVersion: "2.0.11",
  iosMinimumVersion: "2.0.10",
  iosCurrentVersion: "2.0.11",
  androidForceUpdateEnabled: true,
  iosForceUpdateEnabled: true,
  optionalUpdateEnabled: true,
  forceUpdateTitle: "Update Required",
  forceUpdateMessage:
    "This version is no longer supported. Please install the latest update before continuing.",
  optionalUpdateTitle: "Update Available",
  optionalUpdateMessage:
    "A newer version of IMRC Setup Manager is available.",
  androidStoreUrl: "",
  iosStoreUrl: "",
});

function normalizePart(value) {
  const number = Number.parseInt(String(value ?? "").replace(/\D.*$/, ""), 10);
  return Number.isFinite(number) ? number : 0;
}

export function compareVersions(left, right) {
  const a = String(left || "0").split(".");
  const b = String(right || "0").split(".");
  const length = Math.max(a.length, b.length, 3);

  for (let index = 0; index < length; index += 1) {
    const aPart = normalizePart(a[index]);
    const bPart = normalizePart(b[index]);
    if (aPart > bPart) return 1;
    if (aPart < bPart) return -1;
  }
  return 0;
}

function sanitizePolicy(value) {
  const incoming = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_POLICY,
    ...incoming,
    androidForceUpdateEnabled: incoming.androidForceUpdateEnabled !== false,
    iosForceUpdateEnabled: incoming.iosForceUpdateEnabled !== false,
    optionalUpdateEnabled: incoming.optionalUpdateEnabled !== false,
  };
}

async function readCachedPolicy() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.policy || !parsed?.savedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveCachedPolicy(policy) {
  try {
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ policy, savedAt: Date.now() })
    );
  } catch {
    // A cache failure must never prevent the app from opening.
  }
}

export async function fetchVersionPolicy() {
  try {
    const snapshot = await getDoc(doc(db, POLICY_COLLECTION, POLICY_DOCUMENT));
    if (snapshot.exists()) {
      const policy = sanitizePolicy(snapshot.data());
      await saveCachedPolicy(policy);
      return { policy, source: "firestore" };
    }
  } catch {
    // Continue to cache/default fallback below.
  }

  const cached = await readCachedPolicy();
  if (cached?.policy) {
    const age = Date.now() - Number(cached.savedAt || 0);
    if (age <= CACHE_MAX_AGE_MS) {
      return { policy: sanitizePolicy(cached.policy), source: "cache" };
    }
  }

  // Defaults are intentionally permissive for the release that first adds this
  // feature. A network outage must not accidentally lock users out.
  return { policy: DEFAULT_POLICY, source: "default" };
}

export function evaluateVersionPolicy(policyInput) {
  const policy = sanitizePolicy(policyInput);
  const isAndroid = Platform.OS === "android";
  const minimumVersion = isAndroid
    ? policy.androidMinimumVersion
    : policy.iosMinimumVersion;
  const currentVersion = isAndroid
    ? policy.androidCurrentVersion
    : policy.iosCurrentVersion;
  const forceEnabled = isAndroid
    ? policy.androidForceUpdateEnabled
    : policy.iosForceUpdateEnabled;
  const storeUrl = isAndroid ? policy.androidStoreUrl : policy.iosStoreUrl;

  const belowMinimum =
    forceEnabled && compareVersions(INSTALLED_APP_VERSION, minimumVersion) < 0;
  const belowCurrent =
    policy.optionalUpdateEnabled &&
    compareVersions(INSTALLED_APP_VERSION, currentVersion) < 0;

  return {
    status: belowMinimum ? "required" : belowCurrent ? "optional" : "current",
    installedVersion: INSTALLED_APP_VERSION,
    minimumVersion,
    currentVersion,
    storeUrl,
    policy,
  };
}
