export function validateVehicle(vehicle) {
  const errors = {};

  if (!String(vehicle?.name || "").trim()) {
    errors.name = "Vehicle Name is required.";
  }

  if (!String(vehicle?.chassisStyle || "").trim()) {
    errors.chassisStyle = "Chassis Style is required.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
