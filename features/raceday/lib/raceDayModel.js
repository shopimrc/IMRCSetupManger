export const RACE_DAY_KEYS = {
  STARTED: '@raceDayStarted_v1',
  READY: '@raceDayReady_v1',
  ACTIVE: '@activeRaceDay',
  ACTIVE_FLAG: '@raceDayActive_v1',
  ENDED: '@raceDayEnded_v1',
  RUNS_PREFIX: '@raceDayRuns_',
  COMPARE_FIELDS: '@raceDayCompareFields',
  TOP5_FIELDS: '@raceDayTop5Fields_v1',
  RECENT_CHANGES: '@recentChanges_v1',
};

export const RACE_DAY_CLEAR_KEYS = [
  RACE_DAY_KEYS.ACTIVE,
  RACE_DAY_KEYS.ACTIVE_FLAG,
  RACE_DAY_KEYS.STARTED,
  RACE_DAY_KEYS.READY,
  '@raceDay_trackId',
  '@raceDay_vehicleIds',
];

export const DEFAULT_TOP5_FIELDS = [
  'position',
  'driver',
  'lapsTime',
  'fastestLap',
];

export const DEFAULT_COMPARE_FIELDS = [
  'fastestLap',
  'avgLap',
  'lapsTime',
];

export const RESULT_TYPES = {
  PRACTICE: 'practice',
  QUALIFIER: 'qualifier',
  MAIN: 'main',
  FINAL: 'final',
};

export function makeRaceDayId(trackId) {
  const safeTrack = String(trackId || 'track').replace(/[^a-zA-Z0-9_-]/g, '');
  return `rd_${safeTrack}_${Date.now()}`;
}

export function createRaceDay({ trackId, vehicleIds = [], eventUrl = null, siteUrl = null }) {
  const now = new Date().toISOString();
  return {
    id: makeRaceDayId(trackId),
    raceDayId: makeRaceDayId(trackId),
    trackId: String(trackId || ''),
    vehicleIds: normalizeIdList(vehicleIds),
    eventUrl: eventUrl || null,
    siteUrl: siteUrl || null,
    startedAt: now,
    updatedAt: now,
  };
}

export function normalizeId(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function normalizeIdList(list = []) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(normalizeId)
    .filter(Boolean)
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

export function mergeRaceDay(base, patch = {}) {
  return {
    ...(base || {}),
    ...(patch || {}),
    vehicleIds: normalizeIdList(patch.vehicleIds || base?.vehicleIds || []),
    updatedAt: new Date().toISOString(),
  };
}

export function raceDayRunsKey(raceDayId) {
  return `${RACE_DAY_KEYS.RUNS_PREFIX}${raceDayId || 'active'}`;
}

export function getVehicleTransponder(vehicle = {}) {
  return (
    vehicle.transponder ||
    vehicle.transponderNumber ||
    vehicle.tx ||
    vehicle.txNumber ||
    vehicle.transponderId ||
    ''
  ).toString().trim();
}

export function getVehicleDisplayName(vehicle = {}) {
  return (
    vehicle.name ||
    vehicle.vehicleName ||
    [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') ||
    'Vehicle'
  );
}

export function getTrackDisplayName(track = {}) {
  return track.name || track.trackName || track.title || 'Track';
}

export function getTrackLiveRcUrl(track = {}) {
  return (
    track.liveRcUrl ||
    track.livercUrl ||
    track.liveRCUrl ||
    track.liveRc ||
    track.liverc ||
    track.resultsUrl ||
    ''
  ).toString().trim();
}
