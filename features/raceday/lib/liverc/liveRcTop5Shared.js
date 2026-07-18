import { parseNumber, textKey } from './liveRcHtml';

export function cleanSpaces(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function decodeHtmlLoose(value = '') {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function htmlToCompactLines(html = '') {
  return decodeHtmlLoose(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:td|th|tr|li|p|div|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .split(/\n+/)
    .map((line) => cleanSpaces(line))
    .filter(Boolean);
}

export function escapeRegExp(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function cleanDriverName(value = '') {
  return cleanSpaces(String(value || '')
    .replace(/^#?\d+\s+(?=[A-Z])/i, '')
    .replace(/^P\d+\s+/i, '')
    .replace(/\s+\*+$/g, ''));
}

export function normalizeTime(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/\d+:(?:\d{2}:)?\d{2}\.\d{1,3}|\d+\.\d{1,3}/);
  return match ? match[0] : text;
}

export function toFiniteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseFloat(String(value).replace(',', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseTimeSeconds(value = '') {
  const text = normalizeTime(value);
  if (!text) return null;
  const parts = text.split(':').map((part) => Number.parseFloat(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  return null;
}

export function formatRaceSeconds(seconds) {
  const totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const wholeSeconds = Math.floor(totalMs / 1000);
  const ms = totalMs % 1000;
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const sec = wholeSeconds % 60;
  const msText = String(ms).padStart(3, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${msText}`;
  return `${minutes}:${String(sec).padStart(2, '0')}.${msText}`;
}

export function normalizeEncodedRaceTime(value = '') {
  const text = cleanSpaces(value);
  if (!text) return '';

  const colonMatch = text.match(/\d+:(?:\d{2}:)?\d{2}\.\d{1,3}/);
  if (colonMatch) return normalizeTime(colonMatch[0]);

  const numericMatch = text.match(/\b\d+(?:\.\d{1,3})?\b/);
  if (!numericMatch) return '';

  const raw = Number.parseFloat(numericMatch[0]);
  if (!Number.isFinite(raw)) return '';

  // LiveRC ranking tables may store total race time as an encoded sort value.
  // Example: 99697.659 means 100000 - 99697.659 = 302.341 seconds = 5:02.341.
  if (raw > 90000 && raw < 100000) return formatRaceSeconds(100000 - raw);

  if (raw >= 60) return formatRaceSeconds(raw);

  return raw.toFixed(3);
}

export function normalizeLapsTimeDisplay(value = '') {
  const text = cleanSpaces(value);
  if (!text) return '';

  const match = text.match(/\b0*(\d+)\s*\/\s*([0-9:]+(?:\.\d{1,3})?)\b/);
  if (!match) return '';

  const laps = Number.parseInt(match[1], 10);
  const time = normalizeEncodedRaceTime(match[2]);
  if (!Number.isFinite(laps) || !time) return '';

  return `${laps}/${time}`;
}

export function parseLapsTimeValue(value = '') {
  const text = normalizeLapsTimeDisplay(value);
  const match = text.match(/(\d+)\s*\/\s*(\d+(?::\d{2})?\.\d{1,3}|\d+:\d{2}:\d{2}\.\d{1,3})/);
  if (!match) return null;
  const laps = Number.parseInt(match[1], 10);
  const seconds = parseTimeSeconds(match[2]);
  if (!Number.isFinite(laps) || !Number.isFinite(seconds)) return null;
  return { laps, seconds };
}

export function countStatFields(row = {}) {
  return [
    row.lapsTime,
    row.fastestLap,
    row.avgLap,
    row.top5Avg,
    row.top10Avg,
    row.top15Avg,
    row.top2Consecutive,
    row.top3Consecutive,
    row.stdDeviation,
    row.consistency,
  ].filter(Boolean).length;
}

export function compareQualPerformance(a = {}, b = {}) {
  const aLapsTime = parseLapsTimeValue(a.lapsTime || a.rankingLapsTime || '');
  const bLapsTime = parseLapsTimeValue(b.lapsTime || b.rankingLapsTime || '');

  if (aLapsTime && bLapsTime) {
    if (aLapsTime.laps !== bLapsTime.laps) return bLapsTime.laps - aLapsTime.laps;
    if (aLapsTime.seconds !== bLapsTime.seconds) return aLapsTime.seconds - bLapsTime.seconds;
  } else if (aLapsTime) {
    return -1;
  } else if (bLapsTime) {
    return 1;
  }

  const aTop2 = parseTimeSeconds(a.top2Consecutive || a.rankingTop2Consecutive || '');
  const bTop2 = parseTimeSeconds(b.top2Consecutive || b.rankingTop2Consecutive || '');
  if (Number.isFinite(aTop2) && Number.isFinite(bTop2) && aTop2 !== bTop2) return aTop2 - bTop2;
  if (Number.isFinite(aTop2) && !Number.isFinite(bTop2)) return -1;
  if (!Number.isFinite(aTop2) && Number.isFinite(bTop2)) return 1;

  const aFast = toFiniteNumber(a.fastestLapSeconds ?? a.fastestLap);
  const bFast = toFiniteNumber(b.fastestLapSeconds ?? b.fastestLap);
  if (Number.isFinite(aFast) && Number.isFinite(bFast) && aFast !== bFast) return aFast - bFast;
  if (Number.isFinite(aFast) && !Number.isFinite(bFast)) return -1;
  if (!Number.isFinite(aFast) && Number.isFinite(bFast)) return 1;

  return countStatFields(b) - countStatFields(a);
}

export function assignQualOrder(rows = []) {
  return rows
    .slice()
    .sort(compareQualPerformance)
    .map((row, index) => ({
      ...row,
      displayPosition: Number.isFinite(toFiniteNumber(row.displayPosition)) ? row.displayPosition : index + 1,
      computedQualPosition: index + 1,
      verificationNote: row.verificationNote || 'Ordered from racerLaps Laps/Time',
    }));
}

export function driverMatches(rowDriver = '', driver = {}) {
  const key = textKey(rowDriver);
  if (!key) return false;
  return Boolean(
    (driver.nickname && key.includes(textKey(driver.nickname))) ||
    (driver.fullName && key.includes(textKey(driver.fullName))) ||
    (driver.displayName && key.includes(textKey(driver.displayName))) ||
    (driver.driverName && key.includes(textKey(driver.driverName)))
  );
}

export function unique(values = []) {
  return Array.from(new Set(values.map((item) => String(item || '').trim()).filter(Boolean)));
}

export function getTablesWithIndex(html = '') {
  const tables = [];
  const re = /<table\b[\s\S]*?<\/table>/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    tables.push({ html: match[0], start: match.index, end: re.lastIndex });
  }
  return tables;
}

export function getTagAttr(tag = '', attr = '') {
  const escaped = escapeRegExp(attr);
  const match = String(tag || '').match(new RegExp(`${escaped}\\s*=\\s*["']([^"']+)["']`, 'i')) ||
    String(tag || '').match(new RegExp(`${escaped}\\s*=\\s*([^\\s>]+)`, 'i'));
  return decodeHtmlLoose(match?.[1] || '').trim();
}

export function findMatchingDivEnd(html = '', openTagStart = 0) {
  const text = String(html || '');
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = openTagStart;
  let depth = 0;
  let match;

  while ((match = re.exec(text))) {
    const tag = match[0] || '';
    const isClose = /^<\//.test(tag);
    const isSelfClosing = /\/\s*>$/.test(tag);

    if (!isClose && !isSelfClosing) depth += 1;
    if (isClose) depth -= 1;
    if (depth === 0 && re.lastIndex > openTagStart) return re.lastIndex;
  }

  return -1;
}

export function getDivBlocksByClass(html = '', classNeedleRe) {
  const text = String(html || '');
  const blocks = [];
  const openRe = /<div\b[^>]*class=["'][^"']*["'][^>]*>/gi;
  let match;

  while ((match = openRe.exec(text))) {
    const tag = match[0] || '';
    const className = getTagAttr(tag, 'class');
    classNeedleRe.lastIndex = 0;
    if (!classNeedleRe.test(className)) continue;

    const end = findMatchingDivEnd(text, match.index);
    if (end < 0) continue;

    blocks.push({
      id: getTagAttr(tag, 'id'),
      className,
      start: match.index,
      end,
      html: text.slice(match.index, end),
      openTag: tag,
    });

    openRe.lastIndex = end;
  }

  return blocks;
}

export function getTabContentHtml(html = '') {
  const tabContents = getDivBlocksByClass(html, /(^|\s)tab-content(\s|$)/i);
  if (!tabContents.length) return String(html || '');
  return tabContents.map((block) => block.html).join('\n');
}

export function htmlToRankingLines(html = '') {
  return decodeHtmlLoose(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, ' | ')
    .replace(/<\/(?:tr|li|p|div|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .split(/\n+/)
    .map((line) => cleanSpaces(line.replace(/\s*\|\s*/g, ' | ')))
    .filter(Boolean);
}

function findMatchingClose(text = '', openIndex = 0, openChar = '{', closeChar = '}') {
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];

    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === openChar) depth += 1;
    if (ch === closeChar) depth -= 1;
    if (depth === 0 && i > openIndex) return i;
  }

  return -1;
}

function findBalancedBlocks(text = '', startRe) {
  const blocks = [];
  const re = new RegExp(startRe.source, startRe.flags.includes('g') ? startRe.flags : `${startRe.flags}g`);
  let match;

  while ((match = re.exec(text))) {
    const openIndex = text.indexOf('{', match.index);
    if (openIndex < 0) continue;
    const closeIndex = findMatchingClose(text, openIndex, '{', '}');
    if (closeIndex < 0) continue;
    blocks.push({
      id: String(match[1] || '').replace(/["']/g, '').trim(),
      start: match.index,
      end: closeIndex + 1,
      body: text.slice(openIndex, closeIndex + 1),
    });
    re.lastIndex = closeIndex + 1;
  }

  return blocks;
}

function getJsField(block = '', field = '') {
  const escaped = escapeRegExp(field);
  const re = new RegExp(`["']${escaped}["']\\s*:\\s*(?:["']([^"']*)["']|([^,}\\n\\r]+))`, 'i');
  const match = block.match(re);
  return String(match?.[1] || match?.[2] || '').trim();
}

function getFirstJsField(block = '', fields = []) {
  for (const field of fields) {
    const value = getJsField(block, field);
    if (value !== '') return value;
  }
  return '';
}

function getJsArrayBlock(block = '', field = '') {
  const escaped = escapeRegExp(field);
  const re = new RegExp(`["']${escaped}["']\\s*:\\s*\\[`, 'i');
  const match = block.match(re);
  if (!match) return '';
  const openIndex = block.indexOf('[', match.index);
  const closeIndex = findMatchingClose(block, openIndex, '[', ']');
  return closeIndex >= 0 ? block.slice(openIndex, closeIndex + 1) : '';
}

function parseJsObjectFields(objectText = '') {
  const out = {};
  const fieldRe = /["']([^"']+)["']\s*:\s*(?:["']([^"']*)["']|([^,}\n\r]+))/g;
  let match;

  while ((match = fieldRe.exec(objectText))) {
    out[match[1]] = String(match[2] ?? match[3] ?? '').trim();
  }

  return out;
}

function parseLapEntries(block = '') {
  const lapsBlock = getJsArrayBlock(block, 'laps');
  if (!lapsBlock) return [];

  const entries = [];
  let index = 0;

  while (index < lapsBlock.length) {
    const openIndex = lapsBlock.indexOf('{', index);
    if (openIndex < 0) break;
    const closeIndex = findMatchingClose(lapsBlock, openIndex, '{', '}');
    if (closeIndex < 0) break;

    const raw = lapsBlock.slice(openIndex, closeIndex + 1);
    const fields = parseJsObjectFields(raw);
    const lapNumber = fields.lapNum || fields.lapNumber || fields.lap || fields.number || fields.n || '';
    const lapTime = fields.lapTime || fields.time || fields.lap_time || fields.lapSeconds || fields.seconds || fields.t || '';
    const totalTime = fields.totalTime || fields.raceTime || fields.elapsedTime || fields.elapsed || fields.total || '';

    entries.push({
      lapNumber: String(lapNumber || '').trim(),
      lapTime: normalizeTime(lapTime),
      totalTime: normalizeTime(totalTime),
      raw: fields,
    });

    index = closeIndex + 1;
  }

  return entries;
}

function closeEnough(a, b) {
  const x = Number.parseFloat(a);
  const y = Number.parseFloat(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.0009;
}

function findFastestLapNumber(laps = [], fastestTime = '') {
  const fastest = normalizeTime(fastestTime);
  if (!fastest) return '';

  const exact = laps.find((lap) => normalizeTime(lap.lapTime) === fastest);
  if (exact?.lapNumber) return exact.lapNumber;

  const close = laps.find((lap) => closeEnough(lap.lapTime, fastest));
  return close?.lapNumber || '';
}

function formatFastestLap(time = '', lapNumber = '') {
  const cleanTime = normalizeTime(time);
  const cleanLap = String(lapNumber || '').replace(/^L/i, '').trim();
  if (!cleanTime) return '';
  return cleanLap ? `${cleanTime} (L${cleanLap})` : cleanTime;
}

function buildLapsTimeFromEntries(laps = []) {
  const validLaps = laps.filter((lap) => lap.lapNumber && lap.lapNumber !== '0');
  const last = validLaps[validLaps.length - 1] || laps[laps.length - 1];
  const lapNumber = Number.parseInt(String(last?.lapNumber || '').replace(/[^0-9]/g, ''), 10);
  const totalTime = normalizeEncodedRaceTime(last?.totalTime || '');
  if (!Number.isFinite(lapNumber) || !totalTime) return '';
  return `${lapNumber}/${totalTime}`;
}

function parseRacerPosition(block = '') {
  const value = getFirstJsField(block, [
    'position',
    'pos',
    'place',
    'rank',
    'ranking',
    'qualifyingPosition',
    'qualPosition',
    'finishPosition',
    'finishPos',
    'overallPosition',
    'overallRank',
    'resultPosition',
  ]);
  return toFiniteNumber(value);
}

function parseRacerLapsBlock(block = '', raceMeta = {}) {
  const laps = parseLapEntries(block);
  const fastestTime = normalizeTime(getFirstJsField(block, ['fastLap', 'fastestLap', 'bestLap']));
  const fastestLapNumber = findFastestLapNumber(laps, fastestTime) || getFirstJsField(block, ['fastLapNum', 'fastLapNumber', 'fastestLapNum']);
  const driverName = cleanDriverName(getFirstJsField(block, ['driverName', 'name', 'nickName', 'nickname', 'fullName', 'driver']));
  const position = parseRacerPosition(block);

  return {
    source: 'racerLaps',
    position,
    racePosition: position,
    driver: driverName,
    driverName,
    lapsTime: normalizeLapsTimeDisplay(getFirstJsField(block, ['lapsTime', 'lapsAndTime'])) || buildLapsTimeFromEntries(laps),
    fastestLap: formatFastestLap(fastestTime, fastestLapNumber),
    avgLap: normalizeTime(getFirstJsField(block, ['avgLap', 'averageLap'])),
    top5Avg: normalizeTime(getFirstJsField(block, ['avgTop5', 'top5Avg'])),
    top10Avg: normalizeTime(getFirstJsField(block, ['avgTop10', 'top10Avg'])),
    top15Avg: normalizeTime(getFirstJsField(block, ['avgTop15', 'top15Avg'])),
    top2Consecutive: normalizeTime(getFirstJsField(block, ['top2Consecutive', 'avgTop2Consecutive', 'top2Cons'])),
    top3Consecutive: normalizeTime(getFirstJsField(block, ['top3Consecutive', 'avgTop3Consecutive', 'top3Cons'])),
    stdDeviation: normalizeTime(getFirstJsField(block, ['stdDeviation', 'standardDeviation', 'deviation'])),
    consistency: getFirstJsField(block, ['consistency']),
    fastestLapNumber: String(fastestLapNumber || '').trim(),
    fastestLapSeconds: parseNumber(fastestTime),
    laps,
    raceNumber: raceMeta.raceNumber || '',
    raceUrl: raceMeta.raceUrl || '',
    roundLabel: raceMeta.roundLabel || '',
    className: raceMeta.className || '',
    resultType: raceMeta.resultType || '',
    mainLabel: raceMeta.mainLabel || '',
  };
}

export function parseAllRacerLapsFromResultHtml(html = '', raceMeta = {}) {
  const blocks = findBalancedBlocks(html, /racerLaps\s*\[\s*([^\]]+)\s*\]\s*=\s*\{/gi);
  return blocks
    .map((block) => parseRacerLapsBlock(block.body, raceMeta))
    .filter((row) => row.driverName);
}

export function normalizeMainLabel(value = '') {
  const text = cleanSpaces(value);
  const match = text.match(/\b([A-Z])\s*[- ]?\s*Main\b/i);
  return match ? `${match[1].toUpperCase()} Main` : '';
}

export function mainLabelMatches(a = '', b = '') {
  const left = normalizeMainLabel(a);
  const right = normalizeMainLabel(b);
  return Boolean(left && right && left === right);
}
