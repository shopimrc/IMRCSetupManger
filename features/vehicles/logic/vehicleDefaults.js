import { DEFAULT_CHASSIS_STYLE } from "../constants/chassisStyles";

export function createEmptyVehicle() {
  return {
    id: "",
    name: "",
    manufacturer: "",
    model: "",
    chassisStyle: DEFAULT_CHASSIS_STYLE,
    transponder: "",
    notes: "",
    createdAt: "",
    updatedAt: "",
  };
}

export function normalizeVehicle(vehicle = {}) {
  const now = new Date().toISOString();

  return {
    id: String(vehicle.id || vehicle.vehicleId || makeVehicleId()),
    name: String(vehicle.name || vehicle.vehicleName || vehicle.carName || "").trim(),
    manufacturer: String(vehicle.manufacturer || vehicle.make || "").trim(),
    model: String(vehicle.model || "").trim(),
    chassisStyle: String(vehicle.chassisStyle || vehicle.chassis || vehicle.type || "").trim(),
    transponder: String(vehicle.transponder || vehicle.tx || vehicle.transponderNumber || "").trim(),
    notes: String(vehicle.notes || "").trim(),
    createdAt: String(vehicle.createdAt || now),
    updatedAt: String(vehicle.updatedAt || now),
  };
}

export function makeVehicleId() {
  return `vehicle_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
