import { fetchLiveRcText } from './liveRcClient';
import { getRows, getCells, stripTags, textKey, parseHiddenName } from './liveRcHtml';
import {
  cleanDriverName,
  cleanSpaces,
  driverMatches,
  normalizeLapsTimeDisplay,
  parseAllRacerLapsFromResultHtml,
} from './liveRcTop5Shared';

const RACE_RESULTS_DEBUG_PREFIX = '[IMRC RaceDay Race Results]';
const RACE_RESULTS_DEBUG_ENABLED = true;

function debug(step = '', data = {}) {
  if (!RACE_RESULTS_DEBUG_ENABLED) return;
  try {
    console.log(RACE_RESULTS_DEBUG_PREFIX, step, data);
  } catch (error) {
    console.log(RACE_RESULTS_DEBUG_PREFIX, step);
  }
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function rowDriverKeys(row = {}) {
  return unique([row.driver, row.driverName, row.fullName, row.nickname, ...(row.driverCandidates || [])]
    .map((item) => textKey(cleanDriverName(item)))
    .filter(Boolean));
}

function keysMatch(a = '', b = '') {
  if (!a || !b) return false;
  if (a === b) return true;
  const aParts = a.split(' ').filter(Boolean);
  const bParts = b.split(' ').filter(Boolean);
  // Nicknames may be a single token. Avoid last-name-only matching for two full names.
  if (aParts.length === 1) return new RegExp(`(^| )${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(b);
  if (bParts.length === 1) return new RegExp(`(^| )${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(a);
  return a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a));
}

function rowsMatch(a = {}, b = {}) {
  const left = rowDriverKeys(a);
  const right = rowDriverKeys(b);
  return left.some((leftKey) => right.some((rightKey) => keysMatch(leftKey, rightKey)));
}

function cleanPosition(value = '') {
  const match = String(value || '').trim().match(/^P?\s*(\d+)\b/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseDriverCandidatesFromRow(rowHtml = '', cells = []) {
  const candidates = [];
  const hidden = parseHiddenName(rowHtml);
  if (hidden) candidates.push(hidden);

  const spans = [...String(rowHtml || '').matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((match) => cleanDriverName(stripTags(match[1])))
    .filter((value) => value && /[a-z]/i.test(value));
  candidates.push(...spans);

  cells.forEach((cell) => {
    const cleaned = cleanDriverName(cell);
    if (!cleaned || !/[a-z]/i.test(cleaned)) return;
    if (/^(pos|driver|laps|time|fast|avg|top|consistency|result)$/i.test(cleaned)) return;
    candidates.push(cleaned);
  });

  return unique(candidates.map(cleanDriverName).filter(Boolean));
}

function findPositionInCells(cells = []) {
  for (const cell of cells.slice(0, 3)) {
    const position = cleanPosition(cell);
    if (Number.isFinite(position)) return position;
  }
  return null;
}

function findLapsTimeInCells(cells = [], rowText = '') {
  const joined = [rowText, ...cells].join(' ');
  const match = joined.match(/\b0*\d+\s*\/\s*[0-9:]+(?:\.\d{1,3})?\b/);
  return match ? normalizeLapsTimeDisplay(match[0]) : '';
}

function parseVisibleRaceRows(html = '') {
  const parsed = [];
  getRows(html).forEach((rowHtml) => {
    const cells = getCells(rowHtml);
    const rowText = cleanSpaces(stripTags(rowHtml));
    if (cells.length < 2) return;
    if (/\bpos\b/i.test(rowText) && /\bdriver\b/i.test(rowText)) return;

    const position = findPositionInCells(cells);
    if (!Number.isFinite(position)) return;

    const candidates = parseDriverCandidatesFromRow(rowHtml, cells);
    const driverName = candidates.find((value) => /[a-z]/i.test(value) && !/^\d+$/.test(value)) || '';
    if (!driverName) return;

    parsed.push({
      source: 'visibleRaceTable',
      position,
      racePosition: position,
      displayPosition: position,
      driver: driverName,
      driverName,
      driverCandidates: candidates,
      lapsTime: findLapsTimeInCells(cells, rowText),
    });
  });
  return parsed.sort((a, b) => a.position - b.position);
}

function mergeRacerLapWithVisibleRow(racerRow = {}, visibleRows = [], orderIndex = 0) {
  const visible = visibleRows.find((candidate) => rowsMatch(candidate, racerRow));
  const position = visible?.position || racerRow.position || racerRow.racePosition || orderIndex + 1;
  const driverCandidates = unique([
    ...(visible?.driverCandidates || []),
    racerRow.driver,
    racerRow.driverName,
    ...(racerRow.driverCandidates || []),
  ].map(cleanDriverName).filter(Boolean));

  return {
    ...visible,
    ...racerRow,
    position,
    racePosition: position,
    displayPosition: position,
    driver: racerRow.driver || racerRow.driverName || visible?.driver || visible?.driverName,
    driverName: racerRow.driverName || racerRow.driver || visible?.driverName || visible?.driver,
    driverCandidates,
    lapsTime: racerRow.lapsTime || visible?.lapsTime || '',
    rankingVerified: Boolean(visible),
    positionVerified: Boolean(visible),
  };
}

function sortRaceRows(a = {}, b = {}) {
  const aPos = Number.parseInt(a.position ?? a.racePosition ?? a.displayPosition, 10);
  const bPos = Number.parseInt(b.position ?? b.racePosition ?? b.displayPosition, 10);
  if (Number.isFinite(aPos) && Number.isFinite(bPos)) return aPos - bPos;
  if (Number.isFinite(aPos)) return -1;
  if (Number.isFinite(bPos)) return 1;
  return String(a.driverName || a.driver || '').localeCompare(String(b.driverName || b.driver || ''));
}

function markMe(row = {}, run = {}) {
  const driver = {
    driver: run.driver,
    driverName: run.driverName || run.driver,
    fullName: run.fullName,
    nickname: run.nickname || run.driver,
  };
  return driverMatches(row.driver || row.driverName, driver)
    || (row.driverCandidates || []).some((candidate) => driverMatches(candidate, driver));
}

function selectRowsForRace(rows = [], run = {}) {
  const sorted = [...rows].sort(sortRaceRows).map((row) => ({ ...row, isMe: markMe(row, run) }));
  if (sorted.length <= 6) return sorted;

  const topFive = sorted.slice(0, 5);
  const me = sorted.find((row) => row.isMe);
  if (me && !topFive.some((row) => rowsMatch(row, me))) return [...topFive, me].sort(sortRaceRows);
  return topFive;
}

function buildFallbackRows(visibleRows = [], run = {}) {
  return visibleRows.map((row) => ({
    ...row,
    className: run.className || row.className || '',
    roundLabel: run.roundLabel || row.roundLabel || '',
    raceNumber: run.raceNumber || row.raceNumber || '',
    raceUrl: run.raceUrl || row.raceUrl || '',
  }));
}

export async function buildRaceResultsForRun(run = {}) {
  const raceUrl = run.raceUrl || run.resultUrl || run.url || '';
  if (!raceUrl) return [];

  debug('start', {
    raceUrl,
    roundLabel: run.roundLabel || '',
    raceNumber: run.raceNumber || '',
    className: run.className || '',
    driver: run.driver || run.driverName || '',
  });

  const html = await fetchLiveRcText(raceUrl);
  const raceMeta = {
    raceUrl,
    roundLabel: run.roundLabel || '',
    raceNumber: run.raceNumber || '',
    className: run.className || '',
    resultType: run.resultType || '',
    mainLabel: run.mainLabel || '',
  };

  const visibleRows = parseVisibleRaceRows(html);
  const racerRows = parseAllRacerLapsFromResultHtml(html, raceMeta);
  const mergedRows = racerRows.length
    ? racerRows.map((row, index) => mergeRacerLapWithVisibleRow(row, visibleRows, index))
    : buildFallbackRows(visibleRows, run);

  const selected = selectRowsForRace(mergedRows, run);

  debug('built', {
    visibleRows: visibleRows.length,
    racerRows: racerRows.length,
    mergedRows: mergedRows.length,
    selectedRows: selected.length,
    selectedDrivers: selected.map((row) => `${row.position || '?'}: ${row.driver || row.driverName || ''}`),
  });

  return selected;
}

export default buildRaceResultsForRun;
