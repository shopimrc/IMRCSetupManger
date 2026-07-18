function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return '';
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function parseToeValue(value) {
  if (value === null || value === undefined) return 0;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return 0;

  const numeric = toNumber(raw);
  if (!numeric) return 0;

  // Convention: positive = toe-in, negative = toe-out.
  // Text entries like "1 out" or "1 toe out" are treated as negative.
  // Text entries like "1 in" or "1 toe in" are treated as positive.
  if (/(^|[^a-z])out([^a-z]|$)|toe\s*-?\s*out/.test(raw)) return -Math.abs(numeric);
  if (/(^|[^a-z])in([^a-z]|$)|toe\s*-?\s*in/.test(raw)) return Math.abs(numeric);

  return numeric;
}

function formatToeTotal(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.0001) return '';
  const amount = formatNumber(Math.abs(value), 2);
  return `${amount} ${value > 0 ? 'in' : 'out'}`;
}

export function calculateToeTotals(geometry = {}) {
  const toe = geometry.toe || {};
  const front = parseToeValue(toe.LF) + parseToeValue(toe.RF);
  const rear = parseToeValue(toe.LR) + parseToeValue(toe.RR);

  return {
    frontToe: formatToeTotal(front),
    rearToe: formatToeTotal(rear),
  };
}

export function calculateRollout(gearing = {}) {
  const spur = toNumber(gearing.spur);
  const pinion = toNumber(gearing.pinion);
  const tireDiameter = toNumber(gearing.tireDiameter);
  const transmissionRatio = toNumber(gearing.transmissionRatio || gearing.transRatio);

  if (!spur || !pinion || !tireDiameter || !transmissionRatio) return '';

  const tireCircumference = Math.PI * tireDiameter;
  const rollout = (tireCircumference * pinion) / (spur * transmissionRatio);
  return formatNumber(rollout, 3);
}

export function calculateCornerWeights(cornerWeights = {}) {
  const LF = toNumber(cornerWeights.LF);
  const RF = toNumber(cornerWeights.RF);
  const LR = toNumber(cornerWeights.LR);
  const RR = toNumber(cornerWeights.RR);
  const total = LF + RF + LR + RR;

  if (!total) {
    return {
      totalWeight: '',
      crossWeight: '',
      leftBias: '',
      rightBias: '',
      frontBias: '',
      rearBias: '',
    };
  }

  const cross = RF + LR;
  const left = LF + LR;
  const right = RF + RR;
  const front = LF + RF;
  const rear = LR + RR;

  return {
    totalWeight: formatNumber(total, 2),
    crossWeight: `${formatNumber((cross / total) * 100, 1)}%`,
    leftBias: `${formatNumber((left / total) * 100, 1)}%`,
    rightBias: `${formatNumber((right / total) * 100, 1)}%`,
    frontBias: `${formatNumber((front / total) * 100, 1)}%`,
    rearBias: `${formatNumber((rear / total) * 100, 1)}%`,
  };
}

export function applySetupCalculations(setup) {
  const existingGearing = setup?.gearing || {};
  const existingGeometry = setup?.geometry || {};
  const existingWeights = setup?.cornerWeights || {};

  const rollout = calculateRollout(existingGearing);
  const weightCalcs = calculateCornerWeights(existingWeights);
  const toeCalcs = calculateToeTotals(existingGeometry);

  // Preserve migrated/manual totals when there is not enough raw data to recalculate.
  // This keeps old V1 setups from losing rollout, toe, cross weight, and bias values.
  const resolvedToeCalcs = {
    frontToe: toeCalcs.frontToe || existingGeometry.frontToe || '',
    rearToe: toeCalcs.rearToe || existingGeometry.rearToe || '',
  };

  const resolvedWeightCalcs = {
    totalWeight: weightCalcs.totalWeight || existingWeights.totalWeight || '',
    crossWeight: weightCalcs.crossWeight || existingWeights.crossWeight || '',
    leftBias: weightCalcs.leftBias || existingWeights.leftBias || '',
    rightBias: weightCalcs.rightBias || existingWeights.rightBias || '',
    frontBias: weightCalcs.frontBias || existingWeights.frontBias || '',
    rearBias: weightCalcs.rearBias || existingWeights.rearBias || '',
  };

  return {
    ...setup,
    geometry: {
      ...existingGeometry,
      ...resolvedToeCalcs,
    },
    gearing: {
      ...existingGearing,
      rollout: rollout || existingGearing.rollout || '',
    },
    cornerWeights: {
      ...existingWeights,
      ...resolvedWeightCalcs,
    },
  };
}

export function getByPath(source, path, fallback = '') {
  if (!source || !path) return fallback;
  return String(path)
    .split('.')
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), source) ?? fallback;
}

export function setByPath(source, path, value) {
  const keys = String(path).split('.');
  const clone = JSON.parse(JSON.stringify(source || {}));
  let cursor = clone;

  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value;
      return;
    }

    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  });

  return clone;
}
