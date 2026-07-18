// app/index.js
// Dashboard entry. The Dashboard UI still lives in src/dashboard/DashboardScreen,
// but this route now provides a local-only CloudSync status feed and a guarded
// manual sync handler for the dashboard light/button.

import { Fragment, useCallback, useEffect, useState } from "react";
import * as Application from "expo-application";
import { router } from "expo-router";
import DashboardScreen from "../src/dashboard/DashboardScreen";
import FirstUseHowToUseGate from "../features/support/components/FirstUseHowToUseGate";
import { listenToAuth } from "./services/auth";
import {
  getCloudSyncStatus,
  runManualCloudSync,
  subscribeCloudSyncStatus,
} from "./services/cloudSync";

const APP_VERSION = Application.nativeApplicationVersion || "0.0.0";

function makeSyncingStatus(previous, user) {
  return {
    ...(previous || {}),
    state: user?.uid ? "syncing" : "signed_out",
    color: user?.uid ? "yellow" : "gray",
    label: user?.uid ? "Syncing" : "Sign In",
    message: user?.uid ? "Cloud sync is running." : "Sign in to sync between devices.",
    dirty: !!user?.uid,
    pending: !!user?.uid,
    syncStartedAt: Date.now(),
  };
}

export default function HomeScreen() {
  const [user, setUser] = useState(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState({
    state: "signed_out",
    color: "gray",
    label: "Sign In",
    message: "Sign in to sync between devices.",
    dirty: false,
    pending: false,
  });
  const [lastCloudSyncResult, setLastCloudSyncResult] = useState(null);

  useEffect(() => {
    return listenToAuth((nextUser) => {
      setUser(nextUser || null);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const uid = user?.uid || "";

    getCloudSyncStatus({ uid })
      .then((status) => {
        if (!cancelled) setCloudSyncStatus(status);
      })
      .catch(() => {});

    const off = subscribeCloudSyncStatus(
      (status) => {
        if (!cancelled) setCloudSyncStatus(status);
      },
      { uid, intervalMs: 2000 }
    );

    return () => {
      cancelled = true;
      off && off();
    };
  }, [user?.uid]);

  const handleManualCloudSync = useCallback(async () => {
    const uid = user?.uid || "";
    if (!uid) {
      const status = await getCloudSyncStatus({ uid: "" });
      setCloudSyncStatus(status);
      return { didSync: false, reason: "missing-uid" };
    }

    // Keep the dashboard light yellow while the complete sync path runs.
    // It only changes to green after runManualCloudSync finishes and the service
    // reports dirty=false with a completed lastSyncAt.
    setCloudSyncStatus((previous) => makeSyncingStatus(previous, user));

    const result = await runManualCloudSync({ uid, appVersion: APP_VERSION });
    setLastCloudSyncResult(result);

    const finalStatus = await getCloudSyncStatus({ uid });
    setCloudSyncStatus(finalStatus);

    return result;
  }, [user]);

  const handleSupportPress = useCallback(() => {
    router.push('/support');
  }, []);

  return (
    <Fragment>
      <DashboardScreen
        cloudSyncStatus={cloudSyncStatus}
        syncStatus={cloudSyncStatus}
        lastCloudSyncResult={lastCloudSyncResult}
        onManualCloudSync={handleManualCloudSync}
        onCloudSyncPress={handleManualCloudSync}
        onSupportPress={handleSupportPress}
        onOpenSupport={handleSupportPress}
        supportRoute="/support"
      />
      <FirstUseHowToUseGate />
    </Fragment>
  );
}
