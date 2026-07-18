import { getRows, getCells, stripTags, textKey, parseNumber } from './liveRcHtml';
import { parseLapStats } from './liveRcLapStatsParser';

function rowMatchesDriver(rowText = '', driver = {}) {
  const key = textKey(rowText);
  return Boolean(
    (driver.nickname && key.includes(textKey(driver.nickname))) ||
    (driver.fullName && key.includes(textKey(driver.fullName))) ||
    (driver.displayName && key.includes(textKey(driver.displayName))) ||
    (driver.transponder && key.includes(textKey(driver.transponder)))
  );
}

function parsePosition(cells = []) {
  const firstNumber = cells.map(parseNumber).find((value) => Number.isFinite(value));
  return firstNumber || null;
}

function parseLapsTime(cells = [], rowText = '') {
  const joined = [rowText, ...cells].join(' ');
  const match = joined.match(/\b(\d+)\s*\/\s*(\d+:\d{2}\.\d{1,3})\b/);
  return match ? `${match[1]}/${match[2]}` : '';
}

function parseFastLap(cells = [], rowText = '') {
  const joined = [rowText, ...cells].join(' ');
  const time = joined.match(/\b\d+\.\d{3}\b/)?.[0] || '';
  const lap = joined.match(/\(L(\d+)\)/i)?.[1] || joined.match(/lap\s*(\d+)/i)?.[1] || '';
  return time ? `${time}${lap ? ` (L${lap})` : ''}` : '';
}

export function parseQualifierResult(raceHtml = '', driver = {}, raceMeta = {}) {
  const rows = getRows(raceHtml);
  for (const rowHtml of rows) {
    const rowText = stripTags(rowHtml);
    if (!rowMatchesDriver(rowText, driver)) continue;
    const cells = getCells(rowHtml);
    const stats = parseLapStats(raceHtml, driver.displayName || driver.nickname || driver.fullName);

    return {
      resultType: 'qualifier',
      roundLabel: raceMeta.roundLabel || 'Qualifier',
      raceUrl: raceMeta.raceUrl,
      raceNumber: raceMeta.raceNumber || '',
      className: raceMeta.className || driver.className,
      position: parsePosition(cells),
      driver: driver.displayName || driver.nickname || driver.fullName,
      lapsTime: stats.lapsTime || parseLapsTime(cells, rowText),
      fastestLap: stats.fastestLap || parseFastLap(cells, rowText),
      avgLap: stats.avgLap,
      top5Avg: stats.top5Avg,
      top10Avg: stats.top10Avg,
      top15Avg: stats.top15Avg,
      top2Consecutive: stats.top2Consecutive,
      top3Consecutive: stats.top3Consecutive,
      consistency: stats.consistency,
      stdDeviation: stats.stdDeviation,
      stats,
    };
  }
  return null;
}
