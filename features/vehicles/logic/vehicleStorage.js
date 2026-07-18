import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeVehicle, makeVehicleId } from "./vehicleDefaults";
import { markCloudDirty, markItemDeletedForCloud } from "../../../app/services/cloudSync";

export const VEHICLES_STORAGE_KEY = "@vehicles";

const SETUPS_STORAGE_KEY = "@setups";
const SETUP_HISTORY_PREFIX = "@setupHistory_";

function setupBelongsToVehicle(setup, vehicleId) {
  const target = String(vehicleId || "").trim();
  const value = String(
    setup?.vehicleId || setup?.vehicleID || setup?.carId || setup?.vehicle?.id || ""
  ).trim();
  return !!target && value === target;
}

async function deleteVehicleSetupData(vehicleId) {
  const id = String(vehicleId || "").trim();
  if (!id) return { removedSetupIds: [], removedKeys: [] };

  const removedSetupIds = [];
  const removedKeys = [];
  try {
    const raw = await AsyncStorage.getItem(SETUPS_STORAGE_KEY);
    const setups = raw ? JSON.parse(raw) : [];
    if (Array.isArray(setups)) {
      const kept = [];
      for (const setup of setups) {
        if (setupBelongsToVehicle(setup, id)) {
          const setupId = String(setup?.id || setup?.setupId || "").trim();
          if (setupId) removedSetupIds.push(setupId);
        } else {
          kept.push(setup);
        }
      }
      if (kept.length !== setups.length) {
        await AsyncStorage.setItem(SETUPS_STORAGE_KEY, JSON.stringify(kept));
      }
    }

    const allKeys = await AsyncStorage.getAllKeys();
    const historyKeys = allKeys.filter((key) =>
      key.startsWith(`${SETUP_HISTORY_PREFIX}${id}__`) ||
      key.startsWith(`${SETUP_HISTORY_PREFIX}${id}_`)
    );
    if (historyKeys.length) {
      await AsyncStorage.multiRemove(historyKeys);
      removedKeys.push(...historyKeys);
    }

    for (const setupId of removedSetupIds) {
      await markItemDeletedForCloud({ type: "setup", id: setupId, key: SETUPS_STORAGE_KEY });
    }
  } catch (error) {
    console.warn("Vehicle setup cascade delete failed:", error);
  }

  return { removedSetupIds, removedKeys };
}


async function markVehicleCloudDirty({ reason = "vehicle-save", id = "", keys = [VEHICLES_STORAGE_KEY] } = {}) {
  try {
    await markCloudDirty({
      reason,
      keys: Array.from(new Set((Array.isArray(keys) ? keys : [keys]).filter(Boolean))),
      type: "vehicle",
      id,
    });
  } catch (error) {
    console.warn("Vehicle cloud dirty mark failed:", error);
  }
}

export async function getVehicles() {
  try {
    const raw = await AsyncStorage.getItem(VEHICLES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeVehicle)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  } catch (error) {
    console.warn("Failed to load vehicles:", error);
    return [];
  }
}

export async function saveVehicles(vehicles, options = {}) {
  const cleanVehicles = Array.isArray(vehicles)
    ? vehicles.map(normalizeVehicle)
    : [];

  await AsyncStorage.setItem(VEHICLES_STORAGE_KEY, JSON.stringify(cleanVehicles));

  if (options?.markDirty !== false) {
    await markVehicleCloudDirty({
      reason: options?.reason || "vehicles-save",
      id: options?.id || "",
      keys: [VEHICLES_STORAGE_KEY],
    });
  }

  return cleanVehicles;
}

export async function upsertVehicle(vehicle) {
  const vehicles = await getVehicles();
  const now = new Date().toISOString();

  const cleanVehicle = normalizeVehicle({
    ...vehicle,
    id: vehicle?.id || makeVehicleId(),
    createdAt: vehicle?.createdAt || now,
    updatedAt: now,
  });

  const exists = vehicles.some((item) => item.id === cleanVehicle.id);
  const nextVehicles = exists
    ? vehicles.map((item) => (item.id === cleanVehicle.id ? cleanVehicle : item))
    : [cleanVehicle, ...vehicles];

  await saveVehicles(nextVehicles, { markDirty: false });
  await markVehicleCloudDirty({
    reason: exists ? "vehicle-update" : "vehicle-create",
    id: cleanVehicle.id,
    keys: [VEHICLES_STORAGE_KEY],
  });
  return cleanVehicle;
}

export async function deleteVehicle(vehicleId) {
  const vehicles = await getVehicles();
  const nextVehicles = vehicles.filter((vehicle) => vehicle.id !== vehicleId);
  await saveVehicles(nextVehicles, { markDirty: false });
  const cascade = await deleteVehicleSetupData(vehicleId);

  try {
    await markItemDeletedForCloud({ type: "vehicle", id: String(vehicleId || ""), key: VEHICLES_STORAGE_KEY });
  } catch (error) {
    console.warn("Vehicle cloud delete tombstone failed:", error);
  }

  await markVehicleCloudDirty({
    reason: "vehicle-delete",
    id: String(vehicleId || ""),
    keys: [VEHICLES_STORAGE_KEY, SETUPS_STORAGE_KEY, "@deleted_v1", ...(cascade?.removedKeys || [])],
  });

  return nextVehicles;
}
