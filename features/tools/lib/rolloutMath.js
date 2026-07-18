// features/tools/lib/rolloutMath.js
// IMRC Setup Manager 2.0 - Rollout calculator math.
// Default user-facing unit is inch; mm remains available by toggle.

export function toNumber(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

export function round(value, places = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const p = Math.pow(10, places);
  return Math.round(n * p) / p;
}

export function diameterToMm(tireDiameter = 0, tireUnit = 'in') {
  const diameter = toNumber(tireDiameter);
  return tireUnit === 'mm' ? diameter : diameter * 25.4;
}

export function valueToMm(value = 0, unit = 'in') {
  const n = toNumber(value);
  return unit === 'mm' ? n : n * 25.4;
}

export function mmToUnit(valueMm = 0, unit = 'in') {
  const mm = Number(valueMm);
  if (!Number.isFinite(mm)) return 0;
  return unit === 'mm' ? mm : mm / 25.4;
}

export function displayUnitLabel(unit = 'in') {
  return unit === 'mm' ? 'mm' : 'in';
}

export function formatInputFromMm(valueMm = 0, unit = 'in') {
  const value = mmToUnit(valueMm, unit);
  if (!Number.isFinite(value) || value <= 0) return '';
  return unit === 'mm' ? String(round(value, 2)) : String(round(value, 3));
}

export function calculateRollout({ tireDiameter = 0, tireUnit = 'in', pinion = 0, spur = 0, internalRatio = 1 }) {
  const diameterMm = diameterToMm(tireDiameter, tireUnit);
  const pinionTeeth = toNumber(pinion);
  const spurTeeth = toNumber(spur);
  const internal = toNumber(internalRatio, 1);

  const tireCircumferenceMm = diameterMm * Math.PI;
  const gearRatio = pinionTeeth > 0 ? spurTeeth / pinionTeeth : 0;
  const finalDriveRatio = gearRatio * internal;
  const rolloutMm = finalDriveRatio > 0 ? tireCircumferenceMm / finalDriveRatio : 0;

  return {
    diameterMm: round(diameterMm, 3),
    diameterIn: round(diameterMm / 25.4, 3),
    tireCircumferenceMm: round(tireCircumferenceMm, 3),
    tireCircumferenceIn: round(tireCircumferenceMm / 25.4, 3),
    gearRatio: round(gearRatio, 3),
    finalDriveRatio: round(finalDriveRatio, 3),
    rolloutMm: round(rolloutMm, 3),
    rolloutIn: round(rolloutMm / 25.4, 3),
  };
}

export function calculatePinionForTargetRollout({ tireDiameter = 0, tireUnit = 'in', spur = 0, internalRatio = 1, targetRolloutMm = 0 }) {
  const diameterMm = diameterToMm(tireDiameter, tireUnit);
  const circumferenceMm = diameterMm * Math.PI;
  const spurTeeth = toNumber(spur);
  const internal = toNumber(internalRatio, 1);
  const target = toNumber(targetRolloutMm);

  if (circumferenceMm <= 0 || spurTeeth <= 0 || internal <= 0 || target <= 0) return 0;

  // target = circumference / ((spur / pinion) * internal)
  // pinion = target * spur * internal / circumference
  return round((target * spurTeeth * internal) / circumferenceMm, 2);
}

export function calculateSpurForTargetRollout({ tireDiameter = 0, tireUnit = 'in', pinion = 0, internalRatio = 1, targetRolloutMm = 0 }) {
  const diameterMm = diameterToMm(tireDiameter, tireUnit);
  const circumferenceMm = diameterMm * Math.PI;
  const pinionTeeth = toNumber(pinion);
  const internal = toNumber(internalRatio, 1);
  const target = toNumber(targetRolloutMm);

  if (circumferenceMm <= 0 || pinionTeeth <= 0 || internal <= 0 || target <= 0) return 0;

  // target = circumference / ((spur / pinion) * internal)
  // spur = circumference * pinion / (target * internal)
  return round((circumferenceMm * pinionTeeth) / (target * internal), 2);
}

export function chooseTargetGearCenter({
  tireDiameter = 0,
  tireUnit = 'in',
  internalRatio = 1,
  currentPinion = 0,
  currentSpur = 0,
  targetRolloutMm = 0,
}) {
  const diameterMm = diameterToMm(tireDiameter, tireUnit);
  const circumferenceMm = diameterMm * Math.PI;
  const internal = toNumber(internalRatio, 1);
  const target = toNumber(targetRolloutMm);
  const pinion = Math.round(toNumber(currentPinion));
  const spur = Math.round(toNumber(currentSpur));

  if (circumferenceMm <= 0 || internal <= 0 || target <= 0) {
    return {
      canBuild: false,
      priority: '',
      centerPinion: 0,
      centerSpur: 0,
      idealPinion: 0,
      idealSpur: 0,
      anchorLabel: 'enter target',
    };
  }

  // Priority rule from the app: use the car's current spur first. If no spur is known,
  // hold the current pinion and find the spur range instead.
  if (spur > 0) {
    const idealPinion = calculatePinionForTargetRollout({
      tireDiameter,
      tireUnit,
      spur,
      internalRatio,
      targetRolloutMm: target,
    });
    const centerPinion = Math.max(1, Math.round(idealPinion));
    return {
      canBuild: centerPinion > 0,
      priority: 'spur',
      centerPinion,
      centerSpur: spur,
      idealPinion,
      idealSpur: spur,
      anchorLabel: `Spur priority: ${spur}T`,
    };
  }

  if (pinion > 0) {
    const idealSpur = calculateSpurForTargetRollout({
      tireDiameter,
      tireUnit,
      pinion,
      internalRatio,
      targetRolloutMm: target,
    });
    const centerSpur = Math.max(1, Math.round(idealSpur));
    return {
      canBuild: centerSpur > 0,
      priority: 'pinion',
      centerPinion: pinion,
      centerSpur,
      idealPinion: pinion,
      idealSpur,
      anchorLabel: `Pinion priority: ${pinion}T`,
    };
  }

  return {
    canBuild: false,
    priority: '',
    centerPinion: 0,
    centerSpur: 0,
    idealPinion: 0,
    idealSpur: 0,
    anchorLabel: 'enter pinion or spur',
  };
}

export function rolloutForGears({ tireDiameter = 0, tireUnit = 'in', spur = 0, internalRatio = 1, pinion = 0 }) {
  return calculateRollout({ tireDiameter, tireUnit, spur, internalRatio, pinion });
}

export function makePinionTable({ tireDiameter = 0, tireUnit = 'in', spur = 0, internalRatio = 1, centerPinion = 0, radius = 3 }) {
  const center = Math.round(toNumber(centerPinion));
  if (center <= 0) return [];
  const start = Math.max(1, center - radius);
  const end = center + radius;
  const rows = [];
  for (let pinion = start; pinion <= end; pinion += 1) {
    const result = rolloutForGears({ tireDiameter, tireUnit, spur, internalRatio, pinion });
    rows.push({ pinion, spur: toNumber(spur), ...result });
  }
  return rows;
}

export function makeGearMatrix({
  tireDiameter = 0,
  tireUnit = 'in',
  spur = 0,
  internalRatio = 1,
  centerPinion = 0,
  pinionRadius = 3,
  spurRadius = 2,
  targetRolloutMm = 0,
}) {
  const pinionCenter = Math.round(toNumber(centerPinion));
  const spurCenter = Math.round(toNumber(spur));
  const target = toNumber(targetRolloutMm);
  if (pinionCenter <= 0 || spurCenter <= 0 || toNumber(tireDiameter) <= 0 || toNumber(internalRatio, 1) <= 0) {
    return { spurs: [], rows: [], bestCell: null };
  }

  const spurs = [];
  for (let s = Math.max(1, spurCenter - spurRadius); s <= spurCenter + spurRadius; s += 1) spurs.push(s);

  let bestCell = null;
  const rows = [];
  for (let p = Math.max(1, pinionCenter - pinionRadius); p <= pinionCenter + pinionRadius; p += 1) {
    const cells = spurs.map((s) => {
      const result = rolloutForGears({ tireDiameter, tireUnit, internalRatio, pinion: p, spur: s });
      const deltaMm = target > 0 ? result.rolloutMm - target : 0;
      const cell = {
        spur: s,
        pinion: p,
        deltaMm: round(deltaMm, 3),
        deltaIn: round(deltaMm / 25.4, 3),
        absDeltaMm: Math.abs(deltaMm),
        isCenter: p === pinionCenter && s === spurCenter,
        ...result,
      };
      if (target > 0 && result.rolloutMm > 0) {
        if (!bestCell || cell.absDeltaMm < bestCell.absDeltaMm) bestCell = cell;
      }
      return cell;
    });
    rows.push({ pinion: p, cells });
  }

  return { spurs, rows, bestCell };
}

export function makeGearFinder({
  tireDiameter = 0,
  tireUnit = 'in',
  internalRatio = 1,
  currentPinion = 0,
  currentSpur = 0,
  targetRolloutMm = 0,
  limit = 12,
}) {
  const target = toNumber(targetRolloutMm);
  const diameter = toNumber(tireDiameter);
  const internal = toNumber(internalRatio, 1);
  const pinionCenter = Math.round(toNumber(currentPinion, 25));
  const spurCenter = Math.round(toNumber(currentSpur, 84));

  if (diameter <= 0 || internal <= 0 || target <= 0) return [];

  // Keep this realistic and fast for mobile: search around the driver's current gearing.
  const pinionMin = Math.max(1, pinionCenter - 15);
  const pinionMax = Math.max(pinionMin, pinionCenter + 15);
  const spurMin = Math.max(1, spurCenter - 20);
  const spurMax = Math.max(spurMin, spurCenter + 20);

  const rows = [];
  for (let pinion = pinionMin; pinion <= pinionMax; pinion += 1) {
    for (let spur = spurMin; spur <= spurMax; spur += 1) {
      const result = rolloutForGears({ tireDiameter, tireUnit, internalRatio, pinion, spur });
      if (result.rolloutMm <= 0) continue;
      const deltaMm = result.rolloutMm - target;
      rows.push({
        pinion,
        spur,
        deltaMm: round(deltaMm, 3),
        deltaIn: round(deltaMm / 25.4, 3),
        absDeltaMm: Math.abs(deltaMm),
        ...result,
      });
    }
  }

  rows.sort((a, b) => {
    if (a.absDeltaMm !== b.absDeltaMm) return a.absDeltaMm - b.absDeltaMm;
    if (a.spur !== b.spur) return Math.abs(a.spur - spurCenter) - Math.abs(b.spur - spurCenter);
    return Math.abs(a.pinion - pinionCenter) - Math.abs(b.pinion - pinionCenter);
  });

  return rows.slice(0, limit);
}
