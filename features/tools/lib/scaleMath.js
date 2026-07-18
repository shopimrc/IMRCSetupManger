// features/tools/lib/scaleMath.js

export function numberOnly(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

export function convertUnit(value, fromUnit, toUnit) {
  const n = numberOnly(value);
  const toMm = {
    mm: 1,
    cm: 10,
    in: 25.4,
    ft: 304.8,
  };
  if (!toMm[fromUnit] || !toMm[toUnit]) return n;
  return (n * toMm[fromUnit]) / toMm[toUnit];
}

export function roundScale(value, places = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const p = Math.pow(10, places);
  return Math.round(n * p) / p;
}

export function scaleRealToModel({ realValue = 0, realUnit = 'in', modelUnit = 'in', scaleRatio = 10 }) {
  const realInModelUnits = convertUnit(realValue, realUnit, modelUnit);
  const ratio = numberOnly(scaleRatio, 10);
  return roundScale(ratio > 0 ? realInModelUnits / ratio : 0);
}

export function scaleModelToReal({ modelValue = 0, modelUnit = 'in', realUnit = 'in', scaleRatio = 10 }) {
  const modelInRealUnits = convertUnit(modelValue, modelUnit, realUnit);
  const ratio = numberOnly(scaleRatio, 10);
  return roundScale(modelInRealUnits * ratio);
}

export function percentPrintScale({ currentWheelbase = 0, targetWheelbase = 0 }) {
  const current = numberOnly(currentWheelbase);
  const target = numberOnly(targetWheelbase);
  return roundScale(current > 0 ? (target / current) * 100 : 0, 2);
}

export function scaleRatioFromWheelbase({ realWheelbase = 0, modelWheelbase = 0, realUnit = 'in', modelUnit = 'in' }) {
  const realInModelUnit = convertUnit(realWheelbase, realUnit, modelUnit);
  const model = numberOnly(modelWheelbase);
  return roundScale(model > 0 ? realInModelUnit / model : 0, 3);
}
