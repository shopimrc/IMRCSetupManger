// src/dashboard/logic/useRecentChanges.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from './storageKeys';
import { cleanLabel, safeParse, shortVal } from './formatters';
import { prettyField } from './fieldLabels';

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function sanitizeRecentChangesList(list) {
  const src = Array.isArray(list) ? list : [];
  return src
    .filter((e) => e && typeof e === 'object')
    .map((e) => {
      const field = String(e?.fieldPath || e?.field || e?.path || '').trim();
      const text = String(e?.text || '').trim();
      const ts =
        Number(e?.ts ?? e?.atMs ?? e?.timeMs ?? e?.createdAtMs ?? Date.parse(e?.createdAt || '')) ||
        0;

      return {
        ...e,
        fieldPath: e?.fieldPath || (field ? field : undefined),
        text,
        ts,
      };
    })
    .filter((e) => {
      const hasText = !!String(e?.text || '').trim();
      const hasField = !!String(e?.fieldPath || e?.field || e?.path || e?.fieldLabel || e?.label || '').trim();
      const hasValue =
        e?.beforeValue !== undefined ||
        e?.afterValue !== undefined ||
        e?.oldValue !== undefined ||
        e?.newValue !== undefined ||
        e?.fromValue !== undefined ||
        e?.toValue !== undefined ||
        e?.fromV !== undefined ||
        e?.toV !== undefined;
      const hasTs = !!Number(e?.ts || 0);
      const hasRaceDayId = !!String(e?.raceDayId || e?.sessionId || e?.id || '').trim();
      return hasText || hasField || hasValue || hasTs || hasRaceDayId;
    });
}

export function useRecentChanges({ raceDayReady, hasRaceDaySelections } = {}) {
  const [recentChanges, setRecentChanges] = useState([]);
  const [vehicleNameMap, setVehicleNameMap] = useState({});

  const raceDayReadyRef = useRef(raceDayReady);
  const hasRaceDaySelectionsRef = useRef(hasRaceDaySelections);

  useEffect(() => {
    raceDayReadyRef.current = raceDayReady;
    hasRaceDaySelectionsRef.current = hasRaceDaySelections;
  }, [raceDayReady, hasRaceDaySelections]);

  const loadVehicleNames = useCallback(async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.vehicles);
    const arr = safeParse(raw, []);
    const map = {};

    (Array.isArray(arr) ? arr : []).forEach((v) => {
      if (v && v.id != null) {
        map[String(v.id)] = v.name || v.nick || v.label || '';
      }
    });

    setVehicleNameMap(map);
    return map;
  }, []);

  const loadRecentChanges = useCallback(async () => {
    try {
      const selectionCheck = hasRaceDaySelectionsRef.current;
      const okNow = raceDayReadyRef.current || (await selectionCheck?.());

      if (!okNow) {
        setRecentChanges([]);
        return;
      }

      let activeRaceDayId = null;
      const activeRaw = await AsyncStorage.getItem(STORAGE_KEYS.raceDayActiveLegacy);

      if (activeRaw) {
        const a = safeParse(activeRaw, null);
        activeRaceDayId = a?.raceDayId || a?.sessionId || a?.id || null;
      }

      const raw = await AsyncStorage.getItem(STORAGE_KEYS.recentChanges);
      const arr = safeParse(raw, []);
      const list = sanitizeRecentChangesList(Array.isArray(arr) ? arr : []);

      if (activeRaceDayId) {
        const filtered = list.filter((e) => {
          const itemRaceDayId = e?.raceDayId || e?.sessionId || '';
          return !itemRaceDayId || String(itemRaceDayId) === String(activeRaceDayId);
        });
        setRecentChanges(filtered.slice(0, 50));
        return;
      }

      const withRaceDayId = list.filter((e) => !!e?.raceDayId || !!e?.sessionId);
      const legacy = list.filter((e) => !e?.raceDayId && !e?.sessionId);

      setRecentChanges((withRaceDayId.length ? withRaceDayId : legacy).slice(0, 50));
    } catch {
      setRecentChanges([]);
    }
  }, []);

  const recentRows = useMemo(() => {
    return (Array.isArray(recentChanges) ? recentChanges : []).map((raw, idx) => {
      const vehicleId = raw?.vehicleId != null ? String(raw.vehicleId) : '';

      const fieldPath = String(
        firstPresent(raw?.fieldPath, raw?.field, raw?.path, raw?.type, '')
      );

      const fieldLabel = cleanLabel(
        firstPresent(raw?.fieldLabel, raw?.label, raw?.what, null) || prettyField(fieldPath)
      );

      const beforeRaw = firstPresent(
        raw?.beforeValue,
        raw?.oldValue,
        raw?.fromValue,
        raw?.fromV,
        raw?.from
      );

      const afterRaw = firstPresent(
        raw?.afterValue,
        raw?.newValue,
        raw?.toValue,
        raw?.toV,
        raw?.to
      );

      const vehicleName = cleanLabel(
        firstPresent(
          raw?.vehicleName,
          raw?.car,
          raw?.carName,
          vehicleNameMap?.[vehicleId],
          vehicleId ? `Car ${vehicleId}` : 'Car'
        )
      );

      return {
        id: raw?.id || raw?.changeId || `recent-${idx}`,
        type: raw?.type,
        ts: Number(raw?.ts) || Number(Date.parse(raw?.createdAt || '')) || 0,
        createdAt: raw?.createdAt,
        vehicleId,
        vehicleName,
        car: vehicleName,
        fieldPath,
        fieldLabel,
        what: fieldLabel,
        beforeValue: shortVal(beforeRaw),
        afterValue: shortVal(afterRaw),
        fromV: shortVal(beforeRaw),
        toV: shortVal(afterRaw),
        trackId: raw?.trackId,
        trackName: raw?.trackName,
        setupId: raw?.setupId,
        setupName: raw?.setupName,
        groupLabel: raw?.groupLabel,
      };
    });
  }, [recentChanges, vehicleNameMap]);

  const refreshRecentChanges = useCallback(async () => {
    await loadVehicleNames();
    await loadRecentChanges();
  }, [loadRecentChanges, loadVehicleNames]);

  useEffect(() => {
    refreshRecentChanges();
  }, [refreshRecentChanges]);

  return {
    recentRows,
    recentChanges,
    loadRecentChanges,
    loadVehicleNames,
    refreshRecentChanges,
  };
}
