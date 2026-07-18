export function createLiveRcDebug() {
  const steps = [];
  return {
    add(step, data = {}) {
      const entry = { step, at: new Date().toISOString(), ...data };
      steps.push(entry);
      return entry;
    },
    all() {
      return steps;
    },
    summary() {
      return steps.map((entry) => `${entry.step}: ${JSON.stringify(entry)}`).join('\n');
    },
  };
}

export function normalizeDebugValue(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return value;
}
