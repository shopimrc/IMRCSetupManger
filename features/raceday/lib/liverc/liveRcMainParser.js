import { getRows, getCells, stripTags, textKey, parseNumber } from './liveRcHtml';
import { parseLapStats } from './liveRcLapStatsParser';
import { parseTop5FromResultHtml } from './liveRcTop5Parser';

function rowMatchesDriver(rowText = '', driver = {}) {
  const key = textKey(rowText);
  return Boolean(
    (driver.nickname && key.includes(textKey(driver.nickname))) ||
    (driver.fullName && key.includes(textKey(driver.fullName))) ||
    (driver.displayName && key.includes(textKey(driver.displayName))) ||
    (driver.transponder && key.includes(textKey(driver.transponder)))
  );
}

function parseLapsTime(cells = [], rowText = '') {
  const joined = [rowText, ...cells].join(' ');
  const match = joined.match(/\b(\d+)\s*\/\s*(\d+:\d{2}\.\d{1,3})\b/);
  return match ? `${match[1]}/${match[2]}` : '';
}

export function parseMainResult(raceHtml = '', driver = {}, raceMeta = {}) {
  const top5 = parseTop5FromResultHtml(raceHtml, { className: raceMeta.className || driver.className, driver });
  const rows = getRows(raceHtml);
  let myRow = null;

  for (const rowHtml of rows) {
    const rowText = stripTags(rowHtml);
    if (!rowMatchesDriver(rowText, driver)) continue;
    const cells = getCells(rowHtml);
    myRow = {
      position: parseNumber(cells[0]),
      lapsTime: parseLapsTime(cells, rowText),
      rowText,
    };
    break;
  }

  // A Main / Final page can contain top-5 or ranking data for drivers that are
  // not this vehicle. Normal RaceDay sync should only save the main/final if
  // the Entry List matched driver is actually present on this race page.
  if (!myRow) return null;

  const stats = parseLapStats(raceHtml, driver.displayName || driver.nickname || driver.fullName);

  return {
    resultType: raceMeta.resultType === 'final' ? 'final' : 'main',
    roundLabel: raceMeta.roundLabel || 'Main / Final',
    raceUrl: raceMeta.raceUrl,
    raceNumber: raceMeta.raceNumber || '',
    className: raceMeta.className || driver.className,
    position: myRow?.position || top5.find((row) => row.isMe)?.position || null,
    driver: driver.displayName || driver.nickname || driver.fullName,
    lapsTime: stats.lapsTime || myRow?.lapsTime || '',
    fastestLap: stats.fastestLap || '',
    avgLap: stats.avgLap,
    top5Avg: stats.top5Avg,
    top10Avg: stats.top10Avg,
    top15Avg: stats.top15Avg,
    top2Consecutive: stats.top2Consecutive,
    top3Consecutive: stats.top3Consecutive,
    consistency: stats.consistency,
    stdDeviation: stats.stdDeviation,
    top5,
    stats,
  };
}
