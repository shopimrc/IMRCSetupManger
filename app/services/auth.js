// app/services/auth.js
// ✅ DROP-IN FILE
// Google Sign-In (Android/iOS) via expo-auth-session using Authorization Code + PKCE (secure, Google-compliant)
// - Uses NATIVE OAuth client IDs (Android/iOS) and reverse-client-id redirect scheme.
// Apple Sign-In unchanged.

import { auth } from "./firebaseClient";
import {
  onAuthStateChanged,
  signOut as fbSignOut,
  signInWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
} from "firebase/auth";

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

WebBrowser.maybeCompleteAuthSession();

// --------------------
// In-memory state
// --------------------
let currentUser = null;
let initialized = false;
const listeners = new Set();

// IMRC 2.0 conversion rule:
// Existing persisted Firebase sessions from older app versions must sign back in once.
// Manual sign-in functions mark this complete before creating the new session so users
// do not get immediately signed out after entering credentials.
const REAUTH_SCHEMA_VERSION = "2.0.0";
const REAUTH_COMPLETE_KEY = "@imrc_v2_reauth_complete_v1";

async function markV2ReauthComplete() {
  try {
    await AsyncStorage.setItem(REAUTH_COMPLETE_KEY, REAUTH_SCHEMA_VERSION);
  } catch {}
}

async function hasV2ReauthCompleted() {
  try {
    return (await AsyncStorage.getItem(REAUTH_COMPLETE_KEY)) === REAUTH_SCHEMA_VERSION;
  } catch {
    return false;
  }
}

// --------------------
// Internal
// --------------------
function notify() {
  for (const cb of listeners) {
    try {
      cb(currentUser);
    } catch {}
  }
}

let unsub = null;
function ensureObserver() {
  if (unsub) return;
  unsub = onAuthStateChanged(auth, async (u) => {
    // If an older persisted session wakes up after the 2.0 update, force a fresh sign-in once.
    // New sign-ins call markV2ReauthComplete() before creating the session, so they are safe.
    if (u && !(await hasV2ReauthCompleted())) {
      await markV2ReauthComplete();
      try {
        await fbSignOut(auth);
      } catch {}
      currentUser = null;
      initialized = true;
      notify();
      return;
    }

    currentUser = u || null;
    initialized = true;
    notify();
  });
}

// --------------------
// Public API
// --------------------
export function listenToAuth(cb) {
  if (typeof cb === "function") listeners.add(cb);
  ensureObserver();
  if (initialized && cb) cb(currentUser);
  return () => listeners.delete(cb);
}

export async function awaitAuthReady() {
  ensureObserver();
  if (initialized) return currentUser;

  return new Promise((resolve) => {
    const off = listenToAuth((u) => {
      off();
      resolve(u);
    });
  });
}

export function getCurrentUser() {
  return currentUser;
}

export async function signOut() {
  await fbSignOut(auth);
  currentUser = null;
  initialized = true;
  notify();
}

// ✅ Email / password
export async function signIn(email, password) {
  await markV2ReauthComplete();
  const res = await signInWithEmailAndPassword(
    auth,
    String(email).trim(),
    String(password)
  );
  currentUser = res.user;
  initialized = true;
  notify();
  return currentUser;
}


// --------------------
// ✅ Google Sign-In (Secure code flow + PKCE)
// --------------------
//
// This app has multiple Android signing certificates, so Android Google OAuth
// must use the client ID that matches the installed build's signing SHA-1:
//
// Local emulator / `npx expo run:android` debug APK:
//   839652493357-mdin80047qhpdmk1tlg8go1hpcp79ijd.apps.googleusercontent.com
//
// EAS/upload-key direct install builds:
//   839652493357-24gkqa11kk9mtrpb8terrebf2t7nvag0.apps.googleusercontent.com
//
// Google Play production builds:
//   Use the Android OAuth client created from the Play App Signing SHA-1.
//
// IMPORTANT:
// The redirect URI must stay SINGLE slash:
//   com.googleusercontent.apps.CLIENT_ID_PREFIX:/oauthredirect
const KNOWN_LOCAL_ANDROID_DEV_CLIENT_ID =
  "839652493357-mdin80047qhpdmk1tlg8go1hpcp79ijd.apps.googleusercontent.com";

const KNOWN_EAS_ANDROID_UPLOAD_CLIENT_ID =
  "839652493357-24gkqa11kk9mtrpb8terrebf2t7nvag0.apps.googleusercontent.com";

// Use static dot notation so Expo can inline EXPO_PUBLIC_* variables correctly.
const GOOGLE_ENV = {
  EXPO_PUBLIC_APP_VARIANT: process.env.EXPO_PUBLIC_APP_VARIANT || "",
  EXPO_PUBLIC_BUILD_VARIANT: process.env.EXPO_PUBLIC_BUILD_VARIANT || "",
  EXPO_PUBLIC_BUILD_PROFILE: process.env.EXPO_PUBLIC_BUILD_PROFILE || "",
  EXPO_PUBLIC_EAS_BUILD_PROFILE: process.env.EXPO_PUBLIC_EAS_BUILD_PROFILE || "",

  EXPO_PUBLIC_GOOGLE_ANDROID_ACTIVE_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_ACTIVE_CLIENT_ID || "",

  EXPO_PUBLIC_GOOGLE_ANDROID_DEV_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_DEV_CLIENT_ID || "",
  EXPO_PUBLIC_GOOGLE_DEV_ANDROID_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_DEV_ANDROID_CLIENT_ID || "",
  EXPO_PUBLIC_GOOGLE_ANDROID_LOCAL_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_LOCAL_CLIENT_ID || "",
  EXPO_PUBLIC_GOOGLE_LOCAL_ANDROID_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_LOCAL_ANDROID_CLIENT_ID || "",
  EXPO_PUBLIC_GOOGLE_ANDROID_EAS_DEV_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_EAS_DEV_CLIENT_ID || "",

  EXPO_PUBLIC_GOOGLE_ANDROID_PROD_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_PROD_CLIENT_ID || "",
  EXPO_PUBLIC_GOOGLE_PROD_ANDROID_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_PROD_ANDROID_CLIENT_ID || "",

  EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || "",
  EXPO_PUBLIC_GOOGLE_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "",

  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "",
  EXPO_PUBLIC_GOOGLE_IOS_DEV_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_IOS_DEV_CLIENT_ID || "",
  EXPO_PUBLIC_GOOGLE_DEV_IOS_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_DEV_IOS_CLIENT_ID || "",
  EXPO_PUBLIC_GOOGLE_IOS_PROD_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_IOS_PROD_CLIENT_ID || "",
  EXPO_PUBLIC_GOOGLE_PROD_IOS_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_PROD_IOS_CLIENT_ID || "",
};

function readEnv(name) {
  const value = GOOGLE_ENV?.[name];
  return value == null ? "" : String(value).trim();
}

function looksLikeGoogleClientId(value) {
  return String(value || "").trim().endsWith(".apps.googleusercontent.com");
}

function getBuildVariantHint() {
  const text = [
    readEnv("EXPO_PUBLIC_APP_VARIANT"),
    readEnv("EXPO_PUBLIC_BUILD_VARIANT"),
    readEnv("EXPO_PUBLIC_BUILD_PROFILE"),
    readEnv("EXPO_PUBLIC_EAS_BUILD_PROFILE"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (__DEV__) return "development";
  if (/dev|development|preview|internal/.test(text)) return "development";
  return "production";
}

function pickFirstGoogleClientId(candidates) {
  for (const [name, value] of candidates) {
    if (looksLikeGoogleClientId(value)) {
      return { name, value: String(value).trim() };
    }
  }
  return { name: "", value: "" };
}

function selectGoogleClientForPlatform() {
  const variant = getBuildVariantHint();

  if (Platform.OS === "ios") {
    const picked = pickFirstGoogleClientId(
      variant === "development"
        ? [
            ["EXPO_PUBLIC_GOOGLE_IOS_DEV_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_IOS_DEV_CLIENT_ID")],
            ["EXPO_PUBLIC_GOOGLE_DEV_IOS_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_DEV_IOS_CLIENT_ID")],
            ["EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID")],
          ]
        : [
            ["EXPO_PUBLIC_GOOGLE_IOS_PROD_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_IOS_PROD_CLIENT_ID")],
            ["EXPO_PUBLIC_GOOGLE_PROD_IOS_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_PROD_IOS_CLIENT_ID")],
            ["EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID")],
          ]
    );
    return { ...picked, variant, platform: "ios" };
  }

  const activeOverride = pickFirstGoogleClientId([
    [
      "EXPO_PUBLIC_GOOGLE_ANDROID_ACTIVE_CLIENT_ID",
      readEnv("EXPO_PUBLIC_GOOGLE_ANDROID_ACTIVE_CLIENT_ID"),
    ],
  ]);

  if (activeOverride.value) {
    return { ...activeOverride, variant, platform: "android" };
  }

  if (variant === "development") {
    const picked = pickFirstGoogleClientId([
      ["EXPO_PUBLIC_GOOGLE_ANDROID_DEV_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_ANDROID_DEV_CLIENT_ID")],
      ["EXPO_PUBLIC_GOOGLE_DEV_ANDROID_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_DEV_ANDROID_CLIENT_ID")],
      ["EXPO_PUBLIC_GOOGLE_ANDROID_LOCAL_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_ANDROID_LOCAL_CLIENT_ID")],
      ["EXPO_PUBLIC_GOOGLE_LOCAL_ANDROID_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_LOCAL_ANDROID_CLIENT_ID")],
      ["EXPO_PUBLIC_GOOGLE_ANDROID_EAS_DEV_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_ANDROID_EAS_DEV_CLIENT_ID")],
      ["EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID")],
      ["EXPO_PUBLIC_GOOGLE_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_CLIENT_ID")],
      ["KNOWN_LOCAL_ANDROID_DEV_CLIENT_ID", KNOWN_LOCAL_ANDROID_DEV_CLIENT_ID],
      ["KNOWN_EAS_ANDROID_UPLOAD_CLIENT_ID", KNOWN_EAS_ANDROID_UPLOAD_CLIENT_ID],
    ]);
    return { ...picked, variant, platform: "android" };
  }

  const picked = pickFirstGoogleClientId([
    ["EXPO_PUBLIC_GOOGLE_ANDROID_PROD_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_ANDROID_PROD_CLIENT_ID")],
    ["EXPO_PUBLIC_GOOGLE_PROD_ANDROID_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_PROD_ANDROID_CLIENT_ID")],
    ["EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID")],
    ["EXPO_PUBLIC_GOOGLE_CLIENT_ID", readEnv("EXPO_PUBLIC_GOOGLE_CLIENT_ID")],
    // Fallback only for non-Play direct install builds. Play Store builds should
    // set EXPO_PUBLIC_GOOGLE_ANDROID_PROD_CLIENT_ID to the Play App Signing client.
    ["KNOWN_EAS_ANDROID_UPLOAD_CLIENT_ID", KNOWN_EAS_ANDROID_UPLOAD_CLIENT_ID],
  ]);
  return { ...picked, variant, platform: "android" };
}

export async function signInWithGoogle() {
  const selected = selectGoogleClientForPlatform();
  const clientId = selected.value;

  if (!clientId) {
    throw new Error(
      `[Auth] Missing Google OAuth client id for ${selected.platform} ${selected.variant}.`
    );
  }

  // Reverse-client-id scheme required by Google for native clients.
  // Keep the single-slash redirect that worked for production:
  // com.googleusercontent.apps.CLIENT_ID_PREFIX:/oauthredirect
  const core = String(clientId).replace(".apps.googleusercontent.com", "");
  const googleScheme = `com.googleusercontent.apps.${core}`;
  const redirectUri = `${googleScheme}:/oauthredirect`;

  console.log("[GOOGLE] platform =", Platform.OS);
  console.log("[GOOGLE] buildVariant =", selected.variant);
  console.log("[GOOGLE] clientIdSource =", selected.name);
  console.log("[GOOGLE] clientId =", clientId);
  console.log("[GOOGLE] redirectUri =", redirectUri);

  const discovery = {
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    revocationEndpoint: "https://oauth2.googleapis.com/revoke",
  };

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: ["openid", "profile", "email"],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });

  const result = await request.promptAsync(discovery);

  if (result.type !== "success") {
    console.log("[GOOGLE] resultType =", result.type);
    console.log("[GOOGLE] resultParams =", result.params || {});
    throw new Error(`[Auth] Google sign-in canceled. resultType=${result.type}`);
  }

  const code = result.params?.code;
  if (!code) {
    throw new Error("[Auth] Google sign-in failed: missing auth code.");
  }

  const tokenRes = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code,
      redirectUri,
      extraParams: {
        code_verifier: request.codeVerifier || "",
      },
    },
    discovery
  );

  const idToken = tokenRes?.idToken;
  const accessToken = tokenRes?.accessToken;

  if (!idToken) {
    throw new Error("[Auth] Google token exchange failed: missing id_token.");
  }

  await markV2ReauthComplete();
  const cred = GoogleAuthProvider.credential(idToken, accessToken);
  const res = await signInWithCredential(auth, cred);

  currentUser = res.user;
  initialized = true;
  notify();
  return currentUser;
}

// --------------------
// ✅ Apple Sign-In (iOS)
// --------------------
export async function signInWithApple() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  const appleRes = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  const idToken = appleRes.identityToken;
  if (!idToken) {
    throw new Error("[Auth] Apple sign-in failed: missing identityToken.");
  }

  const provider = new OAuthProvider("apple.com");
  const cred = provider.credential({
    idToken,
    rawNonce,
  });

  await markV2ReauthComplete();
  const res = await signInWithCredential(auth, cred);

  currentUser = res.user;
  initialized = true;
  notify();
  return currentUser;
}


// --------------------
// IMRC 2.0 re-auth helpers
// --------------------
export async function getV2ReauthStatus() {
  return {
    schemaVersion: REAUTH_SCHEMA_VERSION,
    completed: await hasV2ReauthCompleted(),
  };
}

export async function forceSignBackInForV2() {
  ensureObserver();
  const user = auth.currentUser || currentUser;
  await markV2ReauthComplete();

  if (!user) {
    currentUser = null;
    initialized = true;
    notify();
    return { didSignOut: false, reason: "no-active-user", schemaVersion: REAUTH_SCHEMA_VERSION };
  }

  await fbSignOut(auth);
  currentUser = null;
  initialized = true;
  notify();
  return { didSignOut: true, reason: "v2-upgrade", schemaVersion: REAUTH_SCHEMA_VERSION };
}

export const requireSignBackInForV2 = forceSignBackInForV2;

// --------------------
// UI helpers
// --------------------
export function getUserFirstName(user) {
  if (!user) return "Sign In";
  if (user.displayName) return user.displayName.split(" ")[0];
  if (user.email) return user.email.split("@")[0];
  return "Racer";
}

export function getAuthMode() {
  return "js-sdk";
}

export function isNativeFirebaseAvailable() {
  return false;
}

export function configureGoogleSignIn() {
  return true;
}
