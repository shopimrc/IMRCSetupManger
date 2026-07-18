import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Application from "expo-application";
import {
  evaluateVersionPolicy,
  fetchVersionPolicy,
} from "../../app/services/versionPolicy";

const ACTIVE_RACEDAY_KEYS = ["@raceDayActive_v1", "@activeRaceDay"];
const OPTIONAL_DISMISS_PREFIX = "@imrc_update_dismissed_";

async function hasActiveRaceDay() {
  try {
    const values = await AsyncStorage.multiGet(ACTIVE_RACEDAY_KEYS);
    return values.some(([, value]) => {
      if (!value || value === "0" || value === "false" || value === "null") {
        return false;
      }
      return true;
    });
  } catch {
    return false;
  }
}

function defaultAndroidStoreUrl() {
  const id = Application.applicationId;
  return id ? `market://details?id=${id}` : "";
}

export default function AppVersionGate({ children }) {
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(true);
  const [result, setResult] = useState(null);
  const [showOptional, setShowOptional] = useState(false);
  const [openingStore, setOpeningStore] = useState(false);

  const checkPolicy = useCallback(async () => {
    setChecking(true);
    const loaded = await fetchVersionPolicy();
    const evaluated = evaluateVersionPolicy(loaded.policy);
    setResult({ ...evaluated, source: loaded.source });

    if (evaluated.status === "optional") {
      const raceDayActive = await hasActiveRaceDay();
      const dismissKey = `${OPTIONAL_DISMISS_PREFIX}${evaluated.currentVersion}`;
      const dismissed = await AsyncStorage.getItem(dismissKey);
      setShowOptional(!raceDayActive && dismissed !== "1");
    } else {
      setShowOptional(false);
    }

    setChecking(false);
  }, []);

  useEffect(() => {
    checkPolicy();
  }, [checkPolicy]);

  const openStore = useCallback(async () => {
    if (openingStore) return;
    setOpeningStore(true);

    const configuredUrl = String(result?.storeUrl || "").trim();
    const primaryUrl =
      configuredUrl || (Platform.OS === "android" ? defaultAndroidStoreUrl() : "");

    try {
      if (!primaryUrl) return;
      await Linking.openURL(primaryUrl);
    } catch {
      if (Platform.OS === "android" && Application.applicationId) {
        await Linking.openURL(
          `https://play.google.com/store/apps/details?id=${Application.applicationId}`
        ).catch(() => {});
      }
    } finally {
      setOpeningStore(false);
    }
  }, [openingStore, result?.storeUrl]);

  const dismissOptional = useCallback(async () => {
    const version = result?.currentVersion;
    if (version) {
      await AsyncStorage.setItem(`${OPTIONAL_DISMISS_PREFIX}${version}`, "1").catch(
        () => {}
      );
    }
    setShowOptional(false);
  }, [result?.currentVersion]);

  const required = result?.status === "required";
  const contentPadding = useMemo(
    () => ({
      paddingTop: Math.max(insets.top, 18),
      paddingBottom: Math.max(insets.bottom, 18),
      paddingLeft: Math.max(insets.left, 18),
      paddingRight: Math.max(insets.right, 18),
    }),
    [insets]
  );

  if (checking && !result) {
    return (
      <View style={[styles.loadingScreen, contentPadding]}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Checking app version…</Text>
      </View>
    );
  }

  if (required) {
    return (
      <View style={[styles.requiredScreen, contentPadding]}>
        <View style={styles.requiredCard}>
          <Text style={styles.logoText}>IMRC</Text>
          <Text style={styles.requiredTitle}>
            {result.policy.forceUpdateTitle || "Update Required"}
          </Text>
          <Text style={styles.message}>
            {result.policy.forceUpdateMessage ||
              "Please install the latest update before continuing."}
          </Text>
          <View style={styles.versionBox}>
            <Text style={styles.versionText}>
              Installed: {result.installedVersion}
            </Text>
            <Text style={styles.versionText}>
              Minimum: {result.minimumVersion}
            </Text>
            <Text style={styles.versionText}>
              Current: {result.currentVersion}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={openStore}
            disabled={openingStore}
          >
            <Text style={styles.primaryButtonText}>
              {openingStore ? "Opening Store…" : "Update Now"}
            </Text>
          </Pressable>
          <Pressable style={styles.retryButton} onPress={checkPolicy}>
            <Text style={styles.retryText}>Check Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <>
      {children}
      <Modal
        visible={showOptional}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={dismissOptional}
      >
        <View style={[styles.overlay, contentPadding]}>
          <View style={styles.optionalCard}>
            <Text style={styles.optionalTitle}>
              {result?.policy?.optionalUpdateTitle || "Update Available"}
            </Text>
            <Text style={styles.message}>
              {result?.policy?.optionalUpdateMessage ||
                "A newer version of IMRC Setup Manager is available."}
            </Text>
            <Text style={styles.optionalVersionText}>
              Installed {result?.installedVersion} · Current {result?.currentVersion}
            </Text>
            <Pressable style={styles.primaryButton} onPress={openStore}>
              <Text style={styles.primaryButtonText}>Update</Text>
            </Pressable>
            <Pressable style={styles.laterButton} onPress={dismissOptional}>
              <Text style={styles.laterText}>Later</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: "#101218",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  loadingText: { color: "#d9dde7", fontSize: 15, fontWeight: "600" },
  requiredScreen: {
    flex: 1,
    backgroundColor: "#101218",
    alignItems: "center",
    justifyContent: "center",
  },
  requiredCard: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: "#1a1e27",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#343a48",
    padding: 22,
    alignItems: "stretch",
  },
  logoText: {
    color: "#49d17d",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 2,
    marginBottom: 12,
  },
  requiredTitle: {
    color: "#ffffff",
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "900",
    textAlign: "center",
  },
  optionalTitle: {
    color: "#ffffff",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  message: {
    color: "#d9dde7",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 12,
  },
  versionBox: {
    marginTop: 18,
    backgroundColor: "#11141b",
    borderRadius: 12,
    padding: 14,
    gap: 5,
  },
  versionText: { color: "#bfc6d4", textAlign: "center", fontSize: 14 },
  primaryButton: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 13,
    backgroundColor: "#27a85e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 17, fontWeight: "900" },
  buttonPressed: { opacity: 0.8 },
  retryButton: { alignItems: "center", padding: 14 },
  retryText: { color: "#aeb7c8", fontSize: 14, fontWeight: "700" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  optionalCard: {
    width: "100%",
    maxWidth: 430,
    maxHeight: "100%",
    overflow: "hidden",
    backgroundColor: "#1a1e27",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#343a48",
    padding: 22,
  },
  optionalVersionText: {
    color: "#9da7b8",
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
  },
  laterButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  laterText: { color: "#cbd2df", fontSize: 15, fontWeight: "800" },
});
