import { fetchEntryListHtml } from './liveRcEntryList';
import { findDriverInEntryList } from './liveRcDriverFinder';
import { scanRaceLinks } from './liveRcRaceScanner';
import { parseQualifierResult } from './liveRcQualifierParser';
import { parseMainResult } from './liveRcMainParser';
import { createLiveRcDebug } from './liveRcDebug';
import { normalizeLiveRcEventUrl, normalizeLiveRcSiteUrl } from './liveRcUrls';
import { getVehicleTransponder, getVehicleDisplayName } from '../raceDayModel';
import { addRaceDayRuns } from '../raceDayResultStorage';
import { findRaceLineupsForVehicles } from './liveRcRaceLineupsParser';
import { mergeRaceDayLineups } from '../raceDayLineupStorage';

function getVehicleNames(vehicle = {}) {
  return {
    fullName: vehicle.driverName || vehicle.fullName || vehicle.ownerName || '',
    nickname: vehicle.driverNickname || vehicle.nickname || vehicle.driver || '',
  };
}

function flattenRun(result, extras = {}) {
  return {
    ...extras,
    ...result,
    fastestLap: result.fastestLap || result.stats?.fastestLap || '',
    avgLap: result.avgLap || result.stats?.avgLap || '',
    top5Avg: result.top5Avg || result.stats?.top5Avg || '',
    top10Avg: result.top10Avg || result.stats?.top10Avg || '',
    top15Avg: result.top15Avg || result.stats?.top15Avg || '',
    consistency: result.consistency || result.stats?.consistency || '',
    stdDeviation: result.stdDeviation || result.stats?.stdDeviation || '',
    lapsTime: result.lapsTime || result.stats?.lapsTime || '',
  };
}

function emitProgress(onProgress, payload = {}) {
  if (typeof onProgress !== 'function') return;
  onProgress({
    updatedAt: new Date().toISOString(),
    ...payload,
  });
}

function makeVehicleProgressBase({ raceDay, track, vehicle, vehicleName, transponder }) {
  return {
    vehicleId: vehicle?.id || vehicle?.vehicleId,
    vehicleName,
    transponder,
    trackId: raceDay?.trackId || track?.id || track?.trackId,
  };
}

export async function syncLiveRcForVehicle({
  raceDay,
  track,
  vehicle,
  eventUrl,
  siteUrl,
  save = true,
  onProgress,
} = {}) {
  const debug = createLiveRcDebug();
  const normalizedSiteUrl = normalizeLiveRcSiteUrl(siteUrl || raceDay?.siteUrl || track?.liveRcUrl || track?.livercUrl || '');
  const normalizedEventUrl = normalizeLiveRcEventUrl(eventUrl || raceDay?.eventUrl || '', normalizedSiteUrl);
  const transponder = getVehicleTransponder(vehicle);
  const vehicleName = getVehicleDisplayName(vehicle);
  const names = getVehicleNames(vehicle);
  const progressBase = makeVehicleProgressBase({ raceDay, track, vehicle, vehicleName, transponder });

  debug.add('sync:start', {
    vehicleName,
    transponder,
    eventUrl: normalizedEventUrl,
    siteUrl: normalizedSiteUrl,
  });

  emitProgress(onProgress, {
    ...progressBase,
    phase: 'start',
    status: 'starting',
    message: `Starting LiveRC sync for ${vehicleName}.`,
  });

  if (!normalizedEventUrl) throw new Error('LiveRC event URL is required.');
  if (!transponder && !names.fullName && !names.nickname) {
    emitProgress(onProgress, {
      ...progressBase,
      phase: 'driver',
      status: 'failed',
      message: `No TX/transponder or driver name found for ${vehicleName}.`,
    });
    throw new Error(`No transponder or driver name found for ${vehicleName}.`);
  }

  emitProgress(onProgress, {
    ...progressBase,
    phase: 'entryList',
    status: 'working',
    message: transponder
      ? `Opening Entry List and searching for TX ${transponder}.`
      : 'Opening Entry List and searching by driver name.',
  });

  const { html: entryHtml, entryListUrl } = await fetchEntryListHtml(normalizedEventUrl, { debug });

  emitProgress(onProgress, {
    ...progressBase,
    phase: 'entryList',
    status: 'working',
    entryListUrl,
    message: transponder
      ? `Entry List loaded. Locating transponder ${transponder}.`
      : 'Entry List loaded. Locating driver.',
  });

  const driver = findDriverInEntryList(entryHtml, { transponder, ...names }, { debug });
  if (!driver) {
    emitProgress(onProgress, {
      ...progressBase,
      phase: 'driver',
      status: 'failed',
      entryListUrl,
      message: transponder
        ? `TX ${transponder} was not found in the Entry List for ${vehicleName}.`
        : `Driver was not found in the Entry List for ${vehicleName}.`,
    });
    return {
      ok: false,
      vehicleId: vehicle.id || vehicle.vehicleId,
      vehicleName,
      message: `Driver not found in entry list for ${vehicleName}.`,
      debug: debug.all(),
    };
  }

  emitProgress(onProgress, {
    ...progressBase,
    phase: 'driver',
    status: 'matched',
    entryListUrl,
    driverName: driver.displayName || driver.nickname || driver.fullName,
    fullName: driver.fullName,
    nickname: driver.nickname,
    message: transponder
      ? `Entry List matched TX ${transponder} to ${driver.displayName || driver.fullName}.`
      : `Entry List matched driver ${driver.displayName || driver.fullName}.`,
  });

  const className = driver.className;
  if (!className) {
    emitProgress(onProgress, {
      ...progressBase,
      phase: 'class',
      status: 'failed',
      entryListUrl,
      driverName: driver.displayName || driver.nickname || driver.fullName,
      fullName: driver.fullName,
      nickname: driver.nickname,
      message: `Driver was found, but the class could not be detected from the same Entry List table.`,
    });
    return {
      ok: false,
      vehicleId: vehicle.id || vehicle.vehicleId,
      vehicleName,
      message: `Class could not be detected for ${vehicleName}.`,
      driver,
      debug: debug.all(),
    };
  }

  emitProgress(onProgress, {
    ...progressBase,
    phase: 'class',
    status: 'matched',
    entryListUrl,
    driverName: driver.displayName || driver.nickname || driver.fullName,
    fullName: driver.fullName,
    nickname: driver.nickname,
    className,
    message: `Class matched from the same Entry List table: ${className}.`,
  });

  emitProgress(onProgress, {
    ...progressBase,
    phase: 'raceScanner',
    status: 'working',
    entryListUrl,
    driverName: driver.displayName || driver.nickname || driver.fullName,
    fullName: driver.fullName,
    nickname: driver.nickname,
    className,
    message: `Scanning race result links for ${className}.`,
  });

  const raceLinks = await scanRaceLinks(normalizedEventUrl, className, { debug });

  emitProgress(onProgress, {
    ...progressBase,
    phase: 'raceScanner',
    status: 'working',
    entryListUrl,
    driverName: driver.displayName || driver.nickname || driver.fullName,
    fullName: driver.fullName,
    nickname: driver.nickname,
    className,
    racesComplete: 0,
    raceCandidates: raceLinks.length,
    runsFound: 0,
    message: `Found ${raceLinks.length} ${className} race candidate${raceLinks.length === 1 ? '' : 's'} under Race Results. Checking the driver in each race.`,
  });

  const runs = [];

  for (const race of raceLinks) {
    const parserMeta = {
      raceUrl: race.raceUrl,
      raceNumber: race.raceNumber,
      roundLabel: race.roundLabel,
      className,
      resultType: race.resultType,
    };
    const parsed = race.resultType === 'main' || race.resultType === 'final'
      ? parseMainResult(race.html, driver, parserMeta)
      : parseQualifierResult(race.html, driver, parserMeta);

    if (!parsed) continue;

    runs.push(flattenRun(parsed, {
      vehicleId: vehicle.id || vehicle.vehicleId,
      vehicleName,
      trackId: raceDay?.trackId || track?.id || track?.trackId,
      raceDayId: raceDay?.raceDayId || raceDay?.id,
      eventUrl: normalizedEventUrl,
      siteUrl: normalizedSiteUrl,
      entryListUrl,
      syncedAt: new Date().toISOString(),
      raceNumber: race.raceNumber,
      driver,
    }));

    emitProgress(onProgress, {
      ...progressBase,
      phase: 'raceParser',
      status: 'working',
      entryListUrl,
      driverName: driver.displayName || driver.nickname || driver.fullName,
      fullName: driver.fullName,
      nickname: driver.nickname,
      className,
      racesComplete: runs.length,
      raceCandidates: raceLinks.length,
      runsFound: runs.length,
      roundLabel: race.roundLabel,
      raceNumber: race.raceNumber,
      message: `Matched ${runs.length} race${runs.length === 1 ? '' : 's'} for ${driver.displayName || driver.fullName}.`,
    });
  }

  debug.add('sync:completeVehicle', {
    vehicleName,
    className,
    matchedRaces: runs.length,
    roundLabels: runs.map((run) => run.roundLabel),
  });

  emitProgress(onProgress, {
    ...progressBase,
    phase: 'complete',
    status: 'complete',
    entryListUrl,
    driverName: driver.displayName || driver.nickname || driver.fullName,
    fullName: driver.fullName,
    nickname: driver.nickname,
    className,
    racesComplete: runs.length,
    raceCandidates: raceLinks.length,
    runsFound: runs.length,
    message: runs.length
      ? `Matched ${runs.length} race result${runs.length === 1 ? '' : 's'} for ${driver.displayName || driver.fullName}.`
      : `Driver and class matched, but no race results were found yet.`,
  });

  if (save && raceDay?.id) {
    await addRaceDayRuns(raceDay.id, runs);
  }

  return {
    ok: true,
    vehicleId: vehicle.id || vehicle.vehicleId,
    vehicleName,
    driver,
    className,
    runs,
    debug: debug.all(),
  };
}

export async function syncLiveRcRaceDay({ raceDay, track, vehicles = [], eventUrl, siteUrl, onProgress } = {}) {
  const results = [];
  for (const vehicle of vehicles) {
    try {
      results.push(await syncLiveRcForVehicle({ raceDay, track, vehicle, eventUrl, siteUrl, save: false, onProgress }));
    } catch (error) {
      const vehicleName = getVehicleDisplayName(vehicle);
      emitProgress(onProgress, {
        vehicleId: vehicle.id || vehicle.vehicleId,
        vehicleName,
        transponder: getVehicleTransponder(vehicle),
        phase: 'error',
        status: 'error',
        message: error.message || `LiveRC sync failed for ${vehicleName}.`,
      });
      results.push({
        ok: false,
        vehicleId: vehicle.id || vehicle.vehicleId,
        vehicleName,
        message: error.message,
        debug: [],
      });
    }
  }

  const allRuns = results.flatMap((result) => result.runs || []);
  if (raceDay?.id && allRuns.length) {
    await addRaceDayRuns(raceDay.id, allRuns);
  }

  // Race Lineup badge add-in. This is intentionally separate from normal
  // result parsing: it reads LiveRC Race Lineups & Entry List only, then saves
  // the current race number per vehicle under @raceDayLineups_<raceDayId>.
  if (raceDay?.id) {
    const normalizedSiteUrl = normalizeLiveRcSiteUrl(siteUrl || raceDay?.siteUrl || track?.liveRcUrl || track?.livercUrl || '');
    const normalizedEventUrl = normalizeLiveRcEventUrl(eventUrl || raceDay?.eventUrl || '', normalizedSiteUrl);
    const entryMatches = results
      .filter((result) => result?.driver)
      .map((result) => ({
        ...(result.driver || {}),
        vehicleId: result.vehicleId,
        id: result.vehicleId,
        className: result.className || result.driver?.className || '',
      }));

    if (normalizedEventUrl && Array.isArray(vehicles) && vehicles.length) {
      try {
        const lineups = await findRaceLineupsForVehicles({
          eventUrl: normalizedEventUrl,
          siteUrl: normalizedSiteUrl,
          vehicles,
          entryMatches,
          debug: true,
        });
        await mergeRaceDayLineups(raceDay.id, lineups);
      } catch (error) {
        console.warn('[RaceDayLineups] Failed to update lineup badges', error);
      }
    }
  }

  return {
    ok: results.some((result) => result.ok),
    results,
    runs: allRuns,
  };
}
