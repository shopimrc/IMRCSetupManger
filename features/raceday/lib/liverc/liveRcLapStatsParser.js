import { parseNumber, stripTags, textKey } from './liveRcHtml';

function normalizeTime(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/\d+:(?:\d{2}:)?\d{2}\.\d{1,3}|\d+\.\d{1,3}/);
  return match ? match[0] : text;
}

function getAfterLabel(text = '', labels = []) {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:\\-]?\\s*([^|\\n\\r<]+)`, 'i');
    const match = text.match(re);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function findMatchingClose(text = '', openIndex = 0, openChar = '{', closeChar = '}') {
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = '';
      }
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
      id: match[1] || '',
      start: match.index,
      end: closeIndex + 1,
      body: text.slice(openIndex, closeIndex + 1),
    });
    re.lastIndex = closeIndex + 1;
  }

  return blocks;
}

function getJsField(block = '', field = '') {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`["']${escaped}["']\\s*:\\s*(?:["']([^"']*)["']|([^,}\\n\\r]+))`, 'i');
  const match = block.match(re);
  return String(match?.[1] || match?.[2] || '').trim();
}

function getJsArrayBlock(block = '', field = '') {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function driverMatchesRacerLapsBlock(block = '', driverName = '') {
  if (!driverName) return false;
  const wanted = textKey(driverName);
  const driverFields = [
    getJsField(block, 'driverName'),
    getJsField(block, 'name'),
    getJsField(block, 'nickName'),
    getJsField(block, 'nickname'),
    getJsField(block, 'fullName'),
  ].filter(Boolean);

  return driverFields.some((value) => {
    const key = textKey(value);
    return key === wanted || key.includes(wanted) || wanted.includes(key);
  });
}

function buildLapsTimeFromEntries(laps = []) {
  const validLaps = laps.filter((lap) => lap.lapNumber && lap.lapNumber !== '0');
  const last = validLaps[validLaps.length - 1] || laps[laps.length - 1];
  if (!last?.lapNumber || !last?.totalTime) return '';
  return `${last.lapNumber}/${last.totalTime}`;
}

function buildRacerLapsStats(block = '') {
  const laps = parseLapEntries(block);
  const fastestTime = normalizeTime(getJsField(block, 'fastLap'));
  const fastestLapNumber = findFastestLapNumber(laps, fastestTime);
  const lapsTime = buildLapsTimeFromEntries(laps);

  return {
    source: 'racerLaps',
    driverName: getJsField(block, 'driverName'),
    lapsTime,
    fastestLap: formatFastestLap(fastestTime, fastestLapNumber),
    avgLap: normalizeTime(getJsField(block, 'avgLap')),
    top5Avg: normalizeTime(getJsField(block, 'avgTop5')),
    top10Avg: normalizeTime(getJsField(block, 'avgTop10')),
    top15Avg: normalizeTime(getJsField(block, 'avgTop15')),
    top2Consecutive: normalizeTime(getJsField(block, 'top2Consecutive')),
    top3Consecutive: normalizeTime(getJsField(block, 'top3Consecutive')),
    stdDeviation: normalizeTime(getJsField(block, 'stdDeviation')),
    consistency: getJsField(block, 'consistency'),
    fastestLapNumber,
    fastestLapSeconds: parseNumber(fastestTime),
    laps,
  };
}

export function formatFastestLap(time = '', lapNumber = '') {
  const cleanTime = normalizeTime(time);
  const cleanLap = String(lapNumber || '').replace(/^L/i, '').trim();
  if (!cleanTime) return '';
  return cleanLap ? `${cleanTime} (L${cleanLap})` : cleanTime;
}

export function parseRacerLapsStats(html = '', driverName = '') {
  const blocks = findBalancedBlocks(html, /racerLaps\s*\[\s*([^\]]+)\s*\]\s*=\s*\{/gi);
  if (!blocks.length) return null;

  const driverKey = textKey(driverName);
  const match = blocks.find((block) => driverMatchesRacerLapsBlock(block.body, driverName));

  if (match) return buildRacerLapsStats(match.body);

  // If LiveRC returns only one racerLaps object, use it as a safe fallback.
  if (blocks.length === 1 && !driverKey) return buildRacerLapsStats(blocks[0].body);

  return null;
}

export function parseLapStats(html = '', driverName = '') {
  const racerLapsStats = parseRacerLapsStats(html, driverName);
  if (racerLapsStats) return racerLapsStats;

  const text = stripTags(html).replace(/\s+/g, ' ');
  const driverKey = String(driverName || '').toLowerCase();
  const scopedText = driverKey && text.toLowerCase().includes(driverKey)
    ? text.slice(Math.max(0, text.toLowerCase().indexOf(driverKey) - 120))
    : text;

  const fastestRaw = getAfterLabel(scopedText, ['Fastest Lap', 'Fast Lap', 'Best Lap']);
  const fastestTime = normalizeTime(fastestRaw);
  const fastestLapNumber = fastestRaw.match(/lap\s*(\d+)/i)?.[1] || fastestRaw.match(/\(L(\d+)\)/i)?.[1] || '';

  const lapsTimeRaw = getAfterLabel(scopedText, ['Laps/Time', 'Laps Time', 'Total']);
  const lapsTimeMatch = scopedText.match(/\b(\d+)\s*\/\s*(\d+:\d{2}\.\d{1,3})\b/);

  return {
    source: 'tableText',
    lapsTime: lapsTimeMatch ? `${lapsTimeMatch[1]}/${lapsTimeMatch[2]}` : lapsTimeRaw,
    fastestLap: formatFastestLap(fastestTime, fastestLapNumber),
    avgLap: normalizeTime(getAfterLabel(scopedText, ['Avg Lap', 'Average Lap'])),
    top5Avg: normalizeTime(getAfterLabel(scopedText, ['Avg Top 5', 'Top 5 Avg', 'Top 5'])),
    top10Avg: normalizeTime(getAfterLabel(scopedText, ['Avg Top 10', 'Top 10 Avg', 'Top 10'])),
    top15Avg: normalizeTime(getAfterLabel(scopedText, ['Avg Top 15', 'Top 15 Avg', 'Top 15'])),
    top2Consecutive: normalizeTime(getAfterLabel(scopedText, ['Top 2 Consecutive', 'Top 2 Consecutive Avg'])),
    top3Consecutive: normalizeTime(getAfterLabel(scopedText, ['Top 3 Consecutive', 'Top 3 Consecutive Avg'])),
    stdDeviation: normalizeTime(getAfterLabel(scopedText, ['Std. Deviation', 'Std Deviation', 'Standard Deviation'])),
    consistency: getAfterLabel(scopedText, ['Consistency']),
    fastestLapNumber,
    fastestLapSeconds: parseNumber(fastestTime),
  };
}
