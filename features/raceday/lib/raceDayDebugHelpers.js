export function createDebugLog(enabled = false) {
  const entries = [];
  return {
    enabled,
    add(step, data = {}) {
      const entry = {
        step,
        at: new Date().toISOString(),
        ...data,
      };
      entries.push(entry);
      if (enabled) console.log('[RaceDayDebug]', step, data);
      return entry;
    },
    entries() {
      return entries;
    },
  };
}

export function compactError(error) {
  if (!error) return null;
  return {
    message: error.message || String(error),
    name: error.name || 'Error',
  };
}
