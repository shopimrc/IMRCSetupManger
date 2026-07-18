// src/dashboard/logic/useRaceDayStatus.js
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVE_KEY = '@activeRaceDay';
const RACE_DAY_ACTIVE_CANON_KEY = '@raceDayActive_v1';

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function useRaceDayStatus() {
  const [activeRaceDay, setActiveRaceDay] = useState(null);

  const load = useCallback(async () => {
    const [legacyRaw, canonRaw] = await Promise.all([
      AsyncStorage.getItem(ACTIVE_KEY),
      AsyncStorage.getItem(RACE_DAY_ACTIVE_CANON_KEY),
    ]);
    const active = safeParse(canonRaw, null) || safeParse(legacyRaw, null);
    if (active?.status === 'ended') {
      setActiveRaceDay(null);
      return;
    }
    setActiveRaceDay(active?.trackId ? active : null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    activeRaceDay,
    hasActiveRaceDay: !!activeRaceDay,
    reloadRaceDayStatus: load,
  };
}
