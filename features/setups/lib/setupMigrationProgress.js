let currentProgress = null;
const listeners = new Set();
let autoClearTimer = null;

function emit() {
  const snapshot = currentProgress ? { ...currentProgress } : null;
  Array.from(listeners).forEach((cb) => {
    try {
      cb(snapshot);
    } catch {}
  });
}

function setProgress(next) {
  if (autoClearTimer) {
    clearTimeout(autoClearTimer);
    autoClearTimer = null;
  }

  currentProgress = next ? { ...next, updatedAt: Date.now() } : null;
  emit();

  const autoClearMs = Number(next?.autoClearMs || 0) || 0;
  if (autoClearMs > 0) {
    autoClearTimer = setTimeout(() => {
      currentProgress = null;
      autoClearTimer = null;
      emit();
    }, autoClearMs);
  }
}

export function getSetupsMigrationProgress() {
  return currentProgress ? { ...currentProgress } : null;
}

export function subscribeSetupsMigrationProgress(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  try {
    cb(getSetupsMigrationProgress());
  } catch {}
  return () => {
    listeners.delete(cb);
  };
}

export function beginSetupsMigrationProgress(progress = {}) {
  setProgress({
    active: true,
    title: 'Setups Migration',
    phase: 'starting',
    message: 'Preparing setup migration...',
    startedAt: Date.now(),
    ...progress,
  });
}

export function updateSetupsMigrationProgress(progress = {}) {
  setProgress({
    ...(currentProgress || { active: true, title: 'Setups Migration', startedAt: Date.now() }),
    ...progress,
    active: progress.active !== false,
  });
}

export function finishSetupsMigrationProgress(progress = {}) {
  setProgress({
    ...(currentProgress || { title: 'Setups Migration', startedAt: Date.now() }),
    active: true,
    phase: 'done',
    message: 'Setups migration complete.',
    ...progress,
  });
}

export function clearSetupsMigrationProgress() {
  setProgress(null);
}
