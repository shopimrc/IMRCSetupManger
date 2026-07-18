// features/tools/lib/gearMath.js
// Gear tooth helpers for common RC racing gear pitches.
// DP pitches use: OD(in) = (teeth + 2) / diametralPitch
// Metric module gears use: OD(mm) = module * (teeth + 2)

export const GEAR_PITCH_OPTIONS = [
  { label: '32P', value: '32p', kind: 'dp', pitch: 32, group: 'Inch pitch' },
  { label: '48P', value: '48p', kind: 'dp', pitch: 48, group: 'Inch pitch' },
  { label: '64P', value: '64p', kind: 'dp', pitch: 64, group: 'Inch pitch' },
  { label: '72P', value: '72p', kind: 'dp', pitch: 72, group: 'Inch pitch' },

  { label: 'M0.3', value: 'mod03', kind: 'mod', pitch: 0.3, group: 'Metric module' },
  { label: 'M0.4', value: 'mod04', kind: 'mod', pitch: 0.4, group: 'Metric module' },
  { label: 'M0.5', value: 'mod05', kind: 'mod', pitch: 0.5, group: 'Metric module' },
  { label: 'M0.6', value: 'mod06', kind: 'mod', pitch: 0.6, group: 'Metric module' },
  { label: 'M0.7', value: 'mod07', kind: 'mod', pitch: 0.7, group: 'Metric module' },
  { label: 'M0.8', value: 'mod08', kind: 'mod', pitch: 0.8, group: 'Metric module' },
  { label: 'M1.0', value: 'mod10', kind: 'mod', pitch: 1.0, group: 'Metric module' },

  { label: 'Custom M', value: 'customMod', kind: 'customMod', pitch: 0, group: 'Custom' },
];

export function cleanNumber(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

export function roundGear(value, places = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const p = Math.pow(10, places);
  return Math.round(n * p) / p;
}

export function pitchInfo(pitchType = '48p', customPitch = '') {
  const found = GEAR_PITCH_OPTIONS.find((p) => p.value === pitchType);

  if (found?.kind === 'dp') {
    return {
      kind: 'dp',
      value: found.pitch,
      label: found.label,
      longLabel: `${found.label} diametral pitch`,
      moduleEquivalent: roundGear(25.4 / found.pitch, 4),
    };
  }

  if (found?.kind === 'mod') {
    return {
      kind: 'mod',
      value: found.pitch,
      label: found.label,
      longLabel: `Module ${found.pitch}`,
      dpEquivalent: roundGear(25.4 / found.pitch, 2),
    };
  }

  const custom = cleanNumber(customPitch);
  return {
    kind: 'mod',
    value: custom,
    label: custom > 0 ? `M${roundGear(custom, 3)}` : 'Custom M',
    longLabel: custom > 0 ? `Custom module ${roundGear(custom, 3)}` : 'Custom module',
    dpEquivalent: custom > 0 ? roundGear(25.4 / custom, 2) : 0,
  };
}

export function toInches(value, unit = 'in') {
  const n = cleanNumber(value);
  return unit === 'mm' ? n / 25.4 : n;
}

export function toMillimeters(value, unit = 'in') {
  const n = cleanNumber(value);
  return unit === 'in' ? n * 25.4 : n;
}

export function convertDiameter(value, fromUnit = 'in', toUnit = 'mm') {
  const n = cleanNumber(value);
  if (!n || fromUnit === toUnit) return String(value ?? '');
  const converted = fromUnit === 'in' && toUnit === 'mm' ? n * 25.4 : n / 25.4;
  return roundGear(converted, toUnit === 'in' ? 4 : 2).toString();
}

export function estimateToothCount({ outsideDiameter = 0, diameterUnit = 'in', pitchType = '48p', customPitch = '' }) {
  const od = cleanNumber(outsideDiameter);
  if (od <= 0) {
    return {
      estimated: 0,
      nearest: 0,
      pitchLabel: pitchInfo(pitchType, customPitch).label,
      formula: '',
      expectedOdMm: 0,
      expectedOdIn: 0,
      deltaMm: 0,
      deltaIn: 0,
    };
  }

  const info = pitchInfo(pitchType, customPitch);
  if (info.value <= 0) {
    return {
      estimated: 0,
      nearest: 0,
      pitchLabel: info.label,
      formula: 'Enter custom module',
      expectedOdMm: 0,
      expectedOdIn: 0,
      deltaMm: 0,
      deltaIn: 0,
    };
  }

  let estimated = 0;
  let formula = '';
  let enteredOdMm = 0;

  if (info.kind === 'dp') {
    const odIn = toInches(od, diameterUnit);
    enteredOdMm = odIn * 25.4;
    estimated = odIn * info.value - 2;
    formula = 'teeth = OD in inches × pitch - 2';
  } else {
    const odMm = toMillimeters(od, diameterUnit);
    enteredOdMm = odMm;
    estimated = odMm / info.value - 2;
    formula = 'teeth = OD in mm / module - 2';
  }

  const nearest = Math.max(0, Math.round(estimated));
  const expected = outsideDiameterForTeeth({ toothCount: nearest, pitchType, customPitch });

  return {
    estimated: roundGear(estimated, 2),
    nearest,
    pitchLabel: info.label,
    formula,
    expectedOdMm: expected.odMm,
    expectedOdIn: expected.odIn,
    deltaMm: roundGear(enteredOdMm - expected.odMm, 3),
    deltaIn: roundGear((enteredOdMm - expected.odMm) / 25.4, 4),
  };
}

export function outsideDiameterForTeeth({ toothCount = 0, pitchType = '48p', customPitch = '' }) {
  const teeth = cleanNumber(toothCount);
  const info = pitchInfo(pitchType, customPitch);
  if (teeth <= 0 || info.value <= 0) {
    return { odMm: 0, odIn: 0, pitchLabel: info.label, pitchLongLabel: info.longLabel };
  }

  let odMm = 0;
  if (info.kind === 'dp') {
    const odIn = (teeth + 2) / info.value;
    odMm = odIn * 25.4;
  } else {
    odMm = info.value * (teeth + 2);
  }

  return {
    odMm: roundGear(odMm, 3),
    odIn: roundGear(odMm / 25.4, 4),
    pitchLabel: info.label,
    pitchLongLabel: info.longLabel,
  };
}
