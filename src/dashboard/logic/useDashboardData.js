// src/dashboard/logic/useDashboardData.js
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from './storageKeys';
import { safeParse } from './formatters';

function arrayLengthFromRaw(raw) {
  const parsed = safeParse(raw, []);
  return Array.isArray(parsed) ? parsed.length : 0;
}

function makeSetupCountId(setup, fallbackKey, index) {
  if (!setup || typeof setup !== 'object') return `${fallbackKey}:${index}`;
  return String(
    setup.id ||
      setup.setupId ||
      setup.versionId ||
      setup.savedAt ||
      setup.updatedAt ||
      `${setup.vehicleId || setup.carId || ''}:${setup.trackId || ''}:${index}:${fallbackKey}`
  );
}

async function countSavedSetupVersions() {
  const [setupsRaw, keys] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.setups),
    AsyncStorage.getAllKeys(),
  ]);

  const setupIds = new Set();
  const latestSetups = safeParse(setupsRaw, []);
  if (Array.isArray(latestSetups)) {
    latestSetups.forEach((setup, index) => setupIds.add(makeSetupCountId(setup, '@setups', index)));
  }

  const historyKeys = Array.isArray(keys)
    ? keys.filter((key) => String(key || '').startsWith('@setupHistory_'))
    : [];

  if (historyKeys.length) {
    const pairs = await AsyncStorage.multiGet(historyKeys);
    pairs.forEach(([key, raw]) => {
      const history = safeParse(raw, []);
      if (!Array.isArray(history)) return;
      history.forEach((setup, index) => setupIds.add(makeSetupCountId(setup, key, index)));
    });
  }

  // If an older account only has @setups and no history yet, this still reports @setups.
  return setupIds.size;
}

export function useDashboardData() {
  const [counts, setCounts] = useState({ vehicles: 0, tracks: 0, setups: 0 });

  const loadCounts = useCallback(async () => {
    const [vehiclesRaw, tracksRaw, setupsCount] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.vehicles),
      AsyncStorage.getItem(STORAGE_KEYS.tracks),
      countSavedSetupVersions(),
    ]);

    setCounts({
      vehicles: arrayLengthFromRaw(vehiclesRaw),
      tracks: arrayLengthFromRaw(tracksRaw),
      setups: setupsCount,
    });
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  return { counts, loadCounts };
}
