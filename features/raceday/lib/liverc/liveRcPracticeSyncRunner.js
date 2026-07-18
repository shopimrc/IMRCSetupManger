import { appendRaceDayPracticeSessions } from '../raceDayPracticeStorage';
import { normalizeId } from '../raceDayModel';
import { getPracticeDayUrl, normalizeLiveRcPracticeSiteUrl } from './liveRcPracticeUrls';
import { getVehicleTransponder, parsePracticeSessionsFromHtml } from './liveRcPracticeSessionParser';

async function fetchHtml(url = '') {
  console.log('[IMRC RaceDay Practice] fetch practice sessions URL', { url });
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) throw new Error(`LiveRC practice page failed to load (${response.status}) at ${url}`);
  return response.text();
}

export async function syncLiveRcPracticeDay({
  raceDay,
  track,
  vehicles = [],
  practiceDay,
  siteUrl,
  onProgress,
} = {}) {
  const raceDayId = raceDay?.id || raceDay?.raceDayId;
  if (!raceDayId) throw new Error('No active RaceDay was found for Practice refresh.');
  if (!practiceDay?.key && !practiceDay?.practiceUrl) throw new Error('Select a practice date first.');

  const normalizedSite = normalizeLiveRcPracticeSiteUrl(
    siteUrl || practiceDay?.siteUrl || raceDay?.practiceSiteUrl || raceDay?.siteUrl || track?.liveRcUrl || track?.livercUrl || track?.liveRCUrl || '',
  );
  const practiceUrl = getPracticeDayUrl(practiceDay, normalizedSite);
  console.log('[IMRC RaceDay Practice] selected practice URL', {
    practiceUrl,
    normalizedSite,
    practiceDayKey: practiceDay?.key || practiceDay?.dateKey || '',
    storedPracticeUrl: practiceDay?.practiceUrl || practiceDay?.url || practiceDay?.href || '',
  });
  if (!practiceUrl) throw new Error('No LiveRC practice URL was found.');

  onProgress?.({ type: 'practice-start', message: `Checking Practice ${practiceDay?.label || practiceDay?.key || ''}` });
  const html = await fetchHtml(practiceUrl);

  const summary = {
    practiceUrl,
    practiceDayKey: practiceDay?.key || practiceDay?.dateKey || '',
    vehicleCount: vehicles.length,
    savedCount: 0,
    vehicles: [],
  };

  for (const vehicle of vehicles || []) {
    const vehicleId = normalizeId(vehicle?.id || vehicle?.vehicleId);
    const tx = getVehicleTransponder(vehicle);
    if (!vehicleId || !tx) {
      summary.vehicles.push({ vehicleId, tx, savedCount: 0, skipped: true, reason: 'missing-transponder' });
      onProgress?.({ vehicleId, tx, status: 'skipped', message: 'Missing TX/transponder' });
      continue;
    }

    const sessions = parsePracticeSessionsFromHtml(html, {
      raceDayId,
      vehicleId,
      vehicle,
      practiceDay,
      siteUrl: normalizedSite,
    });

    const saved = await appendRaceDayPracticeSessions(raceDayId, vehicleId, sessions);
    summary.savedCount += saved.length;
    summary.vehicles.push({ vehicleId, tx, savedCount: saved.length });
    onProgress?.({ vehicleId, tx, status: 'complete', savedCount: saved.length, message: `${saved.length} practice session${saved.length === 1 ? '' : 's'} found` });
  }

  return summary;
}
