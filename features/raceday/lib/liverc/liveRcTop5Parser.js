import { getRows, getCells, getAnchors, stripTags, textKey, parseNumber, parseHiddenName } from './liveRcHtml';
import { classMatches } from './liveRcClassFinder';
import { fetchLiveRcText } from './liveRcClient';
import { resolveLiveRcUrl } from './liveRcUrls';
import {
  assignQualOrder,
  cleanDriverName,
  cleanSpaces,
  compareQualPerformance,
  driverMatches,
  escapeRegExp,
  getDivBlocksByClass,
  getTabContentHtml,
  getTablesWithIndex,
  htmlToRankingLines,
  normalizeLapsTimeDisplay,
  normalizeTime,
  parseAllRacerLapsFromResultHtml,
  toFiniteNumber,
  unique,
} from './liveRcTop5Shared';


export { parseAllRacerLapsFromResultHtml };

const TOP5_DEBUG_PREFIX = '[IMRC RaceDay Top5]';
const TOP5_DEBUG_ENABLED = true;

function top5Debug(step = '', data = {}) {
  if (!TOP5_DEBUG_ENABLED) return;
  try {
    // Keep logs compact enough for Metro/Chrome console while still showing
    // exactly where the Qual Top 5 search fails.
    console.log(TOP5_DEBUG_PREFIX, step, data);
  } catch (error) {
    console.log(TOP5_DEBUG_PREFIX, step);
  }
}

function top5DebugSample(rows = [], limit = 5) {
  return (Array.isArray(rows) ? rows : []).slice(0, limit).map((row) => ({
    position: row.position ?? row.rankingPosition ?? row.displayPosition ?? '',
    driver: row.driver || row.driverName || row.rankingDriver || '',
    lapsTime: row.lapsTime || row.rankingLapsTime || '',
    raceNumber: row.raceNumber || '',
    raceUrl: row.raceUrl || '',
    roundLabel: row.roundLabel || '',
  }));
}

function normalizeRoundKey(value = '') {
  return textKey(value || 'Race Results');
}

function getTabLabelMap(html = '') {
  const map = {};
  getAnchors(html).forEach((anchor) => {
    const href = String(anchor.href || '').trim();
    if (!href.startsWith('#')) return;
    const id = decodeURIComponent(href.slice(1)).trim();
    if (!id) return;
    map[id] = cleanSpaces(anchor.text || '');
  });
  return map;
}

function getTabPaneBlocks(html = '') {
  const tabHtml = getTabContentHtml(html);
  const panes = getDivBlocksByClass(tabHtml, /(^|\s)tab-pane(\s|$)/i);
  if (panes.length) return panes;
  return [{ id: '', className: '', start: 0, end: tabHtml.length, html: tabHtml, openTag: '' }];
}

function getFirstHeadingText(html = '') {
  const headings = [];
  const re = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let match;
  while ((match = re.exec(html))) {
    const text = cleanSpaces(stripTags(match[1] || ''));
    if (text) headings.push(text);
  }
  return headings[0] || '';
}

function tableHeaderMap(headerCells = []) {
  const keys = headerCells.map((cell) => textKey(cell));
  const findIndex = (patterns) => keys.findIndex((key) => patterns.some((pattern) => pattern.test(key)));
  return {
    position: findIndex([/^pos$/, /^position$/, /^rank$/]),
    driver: findIndex([/^driver$/, /^name$/, /driver name/]),
    lapsTime: findIndex([/laps time/, /lapstime/, /laps\/time/, /^time$/]),
    top2Consecutive: findIndex([/top 2 consecutive/, /top2 consecutive/, /top 2/, /consecutive/]),
    fastestLap: findIndex([/fast/, /best lap/]),
    avgLap: findIndex([/avg lap/, /average lap/]),
  };
}

function parseRankingRowsFromTableHtml(tableHtml = '') {
  const rows = getRows(tableHtml);
  let header = null;
  const parsed = [];

  rows.forEach((rowHtml) => {
    const cells = getCells(rowHtml).map(cleanSpaces).filter((cell) => cell !== '');
    if (cells.length < 2) return;
    const rowText = stripTags(rowHtml);

    const isHeader = cells.some((cell) => /^pos(?:ition)?$/i.test(cell)) && cells.some((cell) => /^driver$/i.test(cell));
    if (isHeader) {
      header = tableHeaderMap(cells);
      return;
    }

    const map = header || { position: 0, driver: 1, lapsTime: 2, top2Consecutive: 3 };
    const positionCell = cells[map.position >= 0 ? map.position : 0] || cells[0] || '';
    const position = parseRankingPosition([positionCell], rowText);
    if (!Number.isFinite(position)) return;

    const driverCell = cells[map.driver >= 0 ? map.driver : 1] || cells[1] || '';
    const candidates = parseDriverCandidatesFromRankingRow(rowHtml, [driverCell, ...cells]);
    const driverName = candidates[0] || cleanDriverName(driverCell);
    if (!driverName || !looksLikeDriverCell(driverName)) return;

    const rawLapsTime = (map.lapsTime >= 0 ? cells[map.lapsTime] : '') || parseLapsTimeFromCells(cells, rowText);
    const lapsTime = normalizeLapsTimeDisplay(rawLapsTime);
    const top2Consecutive = (map.top2Consecutive >= 0 ? cells[map.top2Consecutive] : '') || parseTop2ConsecutiveFromCells(cells, rowText);

    parsed.push({
      position,
      driver: driverName,
      driverName,
      driverCandidates: candidates.length ? candidates : [driverName],
      driverKeys: unique((candidates.length ? candidates : [driverName]).flatMap(getNameKeys)),
      lapsTime,
      rankingLapsTime: lapsTime,
      top2Consecutive: normalizeTime(top2Consecutive) || cleanSpaces(top2Consecutive),
      rankingTop2Consecutive: normalizeTime(top2Consecutive) || cleanSpaces(top2Consecutive),
      rowText,
      source: 'tabContentTable',
    });
  });

  return parsed;
}

function paneMatchesClass(pane = {}, className = '', tabLabels = {}) {
  if (!className) return true;
  const label = tabLabels[pane.id] || '';
  const heading = getFirstHeadingText(pane.html);
  const tablePrefix = stripTags(pane.html.slice(0, Math.max(500, pane.html.search(/<table\b/i) + 1)));
  const combined = `${label} ${heading} ${tablePrefix}`;
  return classHeadingMatches(combined, className);
}

function parseTabContentRankingRows(html = '', { className = '' } = {}) {
  const tabLabels = getTabLabelMap(html);
  const panes = getTabPaneBlocks(html);
  const matchingPanes = panes.filter((pane) => paneMatchesClass(pane, className, tabLabels));
  const panesToParse = matchingPanes.length ? matchingPanes : panes.filter((pane) => classMatches(stripTags(pane.html), className));
  const rows = [];

  panesToParse.forEach((pane) => {
    getTablesWithIndex(pane.html).forEach((table) => {
      const tableRows = parseRankingRowsFromTableHtml(table.html).map((row) => ({
        ...row,
        tabId: pane.id,
        tabLabel: tabLabels[pane.id] || getFirstHeadingText(pane.html) || '',
      }));
      rows.push(...tableRows);
    });
  });

  top5Debug('ranking tab-content parser', {
    className,
    paneCount: panes.length,
    matchingPaneCount: panesToParse.length,
    tabLabels: Object.values(tabLabels).slice(0, 12),
    rows: rows.length,
    sample: top5DebugSample(rows),
  });

  return rows;
}

function normalizeClassToken(value = '') {
  return textKey(value).replace(/\b(entries?|class|heat|main|a main|b main)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function classHeadingMatches(text = '', className = '') {
  if (!className) return true;
  const hay = normalizeClassToken(text);
  const needle = normalizeClassToken(className);
  if (!hay || !needle) return false;
  return hay.includes(needle) || needle.includes(hay);
}

function getNameKeys(value = '') {
  const key = textKey(cleanDriverName(value));
  if (!key) return [];
  const parts = key.split(' ').filter(Boolean);
  const keys = [key];

  // Single-word nicknames like YOSHI need to match a ranking row that may also
  // contain the driver's full hidden name. Do not add last-name-only keys for
  // multi-word names because that incorrectly matches racers with the same last
  // name, such as MASON HULING and DAVID HULING.
  if (parts.length === 1) keys.push(parts[0]);

  return unique(keys);
}

function keysCompatible(a = '', b = '') {
  if (!a || !b) return false;
  if (a === b) return true;

  const aParts = a.split(' ').filter(Boolean);
  const bParts = b.split(' ').filter(Boolean);
  if (aParts.length === 1) return new RegExp(`(^| )${escapeRegExp(a)}( |$)`).test(b);
  if (bParts.length === 1) return new RegExp(`(^| )${escapeRegExp(b)}( |$)`).test(a);
  return false;
}

function getDriverMatchKeys(driverName = '') {
  return getNameKeys(driverName);
}

function parseDriverFromCells(cells = [], rowHtml = '') {
  const candidates = parseDriverCandidatesFromRankingRow(rowHtml, cells);
  return candidates[0] || cleanDriverName(cells.find((cell) => /[a-z]/i.test(cell) && !/^\d+(\.\d+)?$/.test(cell) && !/\d+:\d{2}/.test(cell)) || '');
}

function parseLapsTimeFromCells(cells = [], rowText = '') {
  const joined = [rowText, ...cells].join(' ');
  const match = joined.match(/\b0*(\d+)\s*\/\s*([0-9:]+(?:\.\d{1,3})?)\b/);
  return match ? normalizeLapsTimeDisplay(`${match[1]}/${match[2]}`) : '';
}

function parseFastLapFromCells(cells = [], rowText = '') {
  const joined = [rowText, ...cells].join(' ');
  return joined.match(/\b\d+\.\d{3}\b/)?.[0] || '';
}

function parseTop2ConsecutiveFromCells(cells = [], rowText = '') {
  const joined = [rowText, ...cells].join(' ');
  const values = joined.match(/\b\d+\.\d{3}\b/g) || [];
  // Ranking pages usually show Laps/Time and then Top 2 Consecutive. The first
  // decimal may belong to Laps/Time, so prefer the last decimal in the row.
  return values.length ? values[values.length - 1] : '';
}


function isRankingHeaderLine(line = '', nextLine = '') {
  const joined = cleanSpaces(`${line} ${nextLine}`);
  return /\bPos\b/i.test(joined) && /\bDriver\b/i.test(joined);
}

function findNextRankingHeaderIndex(lines = [], startIndex = 0, maxDistance = 18) {
  const end = Math.min(lines.length, startIndex + maxDistance + 1);
  for (let i = startIndex; i < end; i += 1) {
    if (isRankingHeaderLine(lines[i], lines[i + 1])) return i;
  }
  return -1;
}

function looksLikeClassSectionHeading(lines = [], index = 0) {
  const line = cleanSpaces(lines[index] || '');
  if (!line || !/[a-z]/i.test(line)) return false;
  if (/^(pos|position|driver|rank by|laps\/time|top \d|fastest lap|avg lap|heat)$/i.test(line)) return false;
  if (/\b(Qualifier|Round|Overall|Ranking|Race Results|Entry List|Toggle navigation|Register|Log In|Switch Tracks)\b/i.test(line)) return false;
  if (/^P?\d+$/.test(line)) return false;
  return findNextRankingHeaderIndex(lines, index + 1, 8) >= 0;
}

function findPlainClassSectionBounds(lines = [], className = '') {
  if (!lines.length) return { start: 0, end: lines.length, headingIndex: -1 };
  if (!className) return { start: 0, end: lines.length, headingIndex: -1 };

  const matches = [];
  lines.forEach((line, index) => {
    if (!classHeadingMatches(line, className)) return;
    const headerIndex = findNextRankingHeaderIndex(lines, index + 1, 14);
    if (headerIndex >= 0) matches.push({ index, headerIndex, distance: headerIndex - index });
  });

  if (!matches.length) return { start: 0, end: lines.length, headingIndex: -1 };

  // The correct class title is usually the one closest to the Pos/Driver header.
  // Earlier class-tab navigation items may also match, so prefer the shortest
  // distance, then the later occurrence.
  matches.sort((a, b) => (a.distance - b.distance) || (b.index - a.index));
  const headingIndex = matches[0].index;
  const start = headingIndex;

  let end = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    if (looksLikeClassSectionHeading(lines, i)) {
      end = i;
      break;
    }
  }

  return { start, end, headingIndex };
}

function isPlainRankingPositionLine(line = '') {
  return /^P?\s*\d+$/i.test(String(line || '').trim());
}

function isPlainLapsTime(line = '') {
  return Boolean(normalizeLapsTimeDisplay(line));
}

function isPlainStatTime(line = '') {
  const text = String(line || '').trim();
  if (/^9999(?:\.0+)?$/.test(text)) return false;
  return /^(?:\d+:\d{2}\.\d{1,3}|\d+\.\d{1,3})$/.test(text);
}

function plainDriverCandidates(value = '') {
  const cleaned = cleanDriverName(value);
  const out = [cleaned];

  const comma = cleaned.match(/^([A-Z][A-Z' -]+),\s*([A-Z][A-Z' -]+)$/i);
  if (comma) {
    const last = cleanSpaces(comma[1]).toUpperCase();
    const after = cleanSpaces(comma[2]).toUpperCase();
    const words = after.split(' ').filter(Boolean);
    if (words.length) out.push(`${words[0]} ${last}`);
    if (words.length > 1) out.push(words.slice(1).join(' '));
  }

  return unique(out.filter(looksLikeDriverCell));
}

function parsePlainRankingStats(statLines = []) {
  const lapsTimeIndex = statLines.findIndex(isPlainLapsTime);
  const lapsTime = lapsTimeIndex >= 0 ? normalizeLapsTimeDisplay(statLines[lapsTimeIndex]) : '';
  const displayStats = statLines
    .slice(lapsTimeIndex >= 0 ? lapsTimeIndex + 1 : 0)
    .filter(isPlainStatTime);

  return {
    lapsTime,
    rankingLapsTime: lapsTime,
    top2Consecutive: displayStats[0] || '',
    rankingTop2Consecutive: displayStats[0] || '',
  };
}

function parsePlainTextRankingRows(html = '', { roundLabel = '', className = '' } = {}) {
  const section = findRankingSection(html, roundLabel, className) || html;
  const lines = htmlToRankingLines(section);
  const bounds = findPlainClassSectionBounds(lines, className);
  const scopedLines = lines.slice(bounds.start, bounds.end);
  const rows = [];

  for (let i = 0; i < scopedLines.length - 1; i += 1) {
    if (!isPlainRankingPositionLine(scopedLines[i])) continue;

    const position = Number(String(scopedLines[i]).replace(/[^0-9]/g, ''));
    const driverCell = scopedLines[i + 1];
    const candidates = plainDriverCandidates(driverCell);
    if (!Number.isFinite(position) || !candidates.length) continue;

    let nextIndex = scopedLines.length;
    for (let j = i + 2; j < scopedLines.length; j += 1) {
      if (isPlainRankingPositionLine(scopedLines[j]) && plainDriverCandidates(scopedLines[j + 1] || '').length) {
        nextIndex = j;
        break;
      }
    }

    const stats = parsePlainRankingStats(scopedLines.slice(i + 2, nextIndex));
    rows.push({
      position,
      driver: candidates[0],
      driverName: candidates[0],
      driverCandidates: candidates,
      driverKeys: unique(candidates.flatMap(getNameKeys)),
      ...stats,
      rowText: scopedLines.slice(i, nextIndex).join(' | '),
      source: 'plainRankingText',
    });

    i = nextIndex - 1;
  }

  top5Debug('ranking plain-text fallback', {
    lineCount: lines.length,
    scopedLineCount: scopedLines.length,
    className,
    headingIndex: bounds.headingIndex,
    rows: rows.length,
    sampleLines: scopedLines.slice(0, 20),
    sampleRows: top5DebugSample(rows),
  });

  return rows;
}

function findRankingSection(html = '', roundLabel = '', className = '') {
  const text = String(html || '');
  const round = cleanSpaces(roundLabel);
  const patterns = [
    round ? new RegExp(`${escapeRegExp(round)}\\s+(?:Overall\\s+)?Rankings?`, 'i') : null,
    /Qualifier\s+Round\s+\d+\s+(?:Overall\s+)?Rankings?/i,
    /Main\s+Events?\s+(?:Overall\s+)?Rankings?/i,
    /Final\s+Results?\s+(?:Overall\s+)?Rankings?/i,
  ].filter(Boolean);

  let start = -1;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      start = match.index;
      break;
    }
  }

  // LiveRC ranking pages sometimes have the round/class in the page title but
  // not the exact "Qualifier Round # Rankings" phrase. Use the whole page only
  // when it actually looks like a ranking/overall page; do not do this for race
  // result pages because heat positions are not overall qualifying positions.
  if (start < 0) {
    const plain = stripTags(text);
    if (/rankings?|overall|qualifying\s+points|qualifier\s+round/i.test(plain) && (!className || classMatches(plain, className))) {
      return text;
    }
    return '';
  }

  const rest = text.slice(start);
  const next = rest.slice(20).search(/(Qualifier\s+Round\s+\d+\s+(?:Overall\s+)?Rankings?|Main\s+Events?\s+(?:Overall\s+)?Rankings?|Final\s+Results?\s+(?:Overall\s+)?Rankings?|Race\s+Results|Entry\s+List)/i);
  return next > 0 ? rest.slice(0, next + 20) : rest;
}

function looksLikeDriverCell(value = '') {
  const text = cleanSpaces(value);
  const key = textKey(text);
  if (!key) return false;
  if (/^(pos|position|rank|driver|name|car|tx|transponder|laps|time|fast|avg|points|tie|class|entries?)$/i.test(text)) return false;
  if (/^(p?\d+|\d+\.\d+|\d+\/\d+:\d{2}\.\d{1,3}|\d+:\d{2}\.\d{1,3})$/i.test(text)) return false;
  if (/\b(Qualifier|Round|Rankings?|Main|Final|Race Results|Entry List|Entries:)\b/i.test(text)) return false;
  if (/\d+:\d{2}|\d+\.\d{3}|\d+\/\d+/.test(text)) return false;
  return /[a-z]/i.test(text);
}

function parseDriverCandidatesFromRankingRow(rowHtml = '', cells = []) {
  const withoutHiddenHtml = String(rowHtml || '').replace(/<span\b[^>]*class=["'][^"']*hidden[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, ' ');
  const visibleCells = getCells(withoutHiddenHtml);
  const hiddenFullName = parseHiddenName(rowHtml);
  const candidates = [];

  visibleCells.forEach((cell) => {
    const cleaned = cleanDriverName(cell);
    if (looksLikeDriverCell(cleaned)) candidates.push(cleaned);
  });

  cells.forEach((cell) => {
    const cleaned = cleanDriverName(cell);
    if (looksLikeDriverCell(cleaned)) candidates.push(cleaned);
  });

  if (hiddenFullName) candidates.push(cleanDriverName(hiddenFullName));

  // If a cell contains both hidden full name and visible nickname, split it so
  // nickname matching works. Example: "INGERSOLL, JOSH YOSHI" should produce
  // both "JOSH INGERSOLL" and "YOSHI" candidates.
  if (hiddenFullName) {
    const hiddenKeyWords = textKey(hiddenFullName).split(' ').filter(Boolean);
    cells.forEach((cell) => {
      const words = textKey(cell).split(' ').filter(Boolean);
      const nicknameWords = words.filter((word) => !hiddenKeyWords.includes(word));
      if (nicknameWords.length) candidates.push(cleanDriverName(nicknameWords.join(' ')).toUpperCase());
    });
  }

  return unique(candidates);
}

function parseRankingPosition(cells = [], rowText = '') {
  const sources = [cells[0], cells[1], rowText].filter(Boolean);
  for (const source of sources) {
    const exact = String(source || '').trim().match(/^P?\s*(\d+)$/i);
    if (exact) return Number(exact[1]);
  }

  const first = parseNumber(cells[0]);
  return Number.isFinite(first) ? first : null;
}

function getRankingTablesForClass(section = '', className = '') {
  const tables = getTablesWithIndex(section);
  if (!tables.length) return [];
  if (!className) return tables.map((table) => table.html);

  const directMatches = tables.filter((table) => {
    const prefix = stripTags(section.slice(Math.max(0, table.start - 500), table.start));
    return classHeadingMatches(prefix, className);
  });

  if (directMatches.length) return directMatches.map((table) => table.html);

  // Fallback: find the class heading text and use the first table after it.
  const classKey = normalizeClassToken(className);
  const plainBeforeTables = tables.map((table) => ({
    table,
    prefixKey: normalizeClassToken(stripTags(section.slice(0, table.start)).slice(-1200)),
  }));
  const match = plainBeforeTables.find((item) => item.prefixKey.includes(classKey));
  return match ? [match.table.html] : tables.map((table) => table.html);
}

export function parseRankingVerificationFromHtml(html = '', { roundLabel = '', className = '' } = {}) {
  const sourceHtml = String(html || '');
  const section = findRankingSection(sourceHtml, roundLabel, className) || sourceHtml;
  if (!section) return [];

  // LiveRC round-ranking pages store each class inside Bootstrap tabs:
  // <div class="tab-content"><div class="tab-pane" ...>...</div></div>.
  // Parse that table structure first so date/page/menu text does not hide the
  // actual Pos / Driver table.
  const tabRankings = parseTabContentRankingRows(sourceHtml, { className });
  const rankings = [];
  const tableSections = tabRankings.length ? [] : getRankingTablesForClass(section, className);
  const sectionsToParse = tableSections.length ? tableSections : (tabRankings.length ? [] : [section]);

  sectionsToParse.forEach((tableHtml) => {
    const parsedRows = parseRankingRowsFromTableHtml(tableHtml);
    rankings.push(...parsedRows.map((row) => ({ ...row, source: row.source || 'rankingTable' })));
  });

  const finalRankings = tabRankings.length
    ? tabRankings
    : (rankings.length ? rankings : parsePlainTextRankingRows(sourceHtml, { roundLabel, className }));

  // Dedupe ranking rows by position + driver so repeated mobile/desktop tables
  // do not duplicate the Top 5 list.
  const seen = new Set();
  return finalRankings.filter((row) => {
    const key = `${row.position}_${(row.driverKeys || []).join('|')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rowMatchesRanking(row = {}, ranking = {}) {
  const rowKeys = unique([
    row.driverName,
    row.driver,
    row.fullName,
    row.nickname,
  ].flatMap(getNameKeys));
  const rankKeys = ranking.driverKeys?.length
    ? ranking.driverKeys
    : unique([ranking.driverName, ranking.driver, ...(ranking.driverCandidates || [])].flatMap(getNameKeys));

  return rowKeys.some((rowKey) => rankKeys.some((rankKey) => keysCompatible(rowKey, rankKey)));
}

function findRankingForDriver(row = {}, rankings = []) {
  return rankings.find((ranking) => rowMatchesRanking(row, ranking)) || null;
}

function getEffectivePosition(row = {}) {
  const rankingPosition = toFiniteNumber(row.rankingPosition ?? row.displayPosition);
  if (Number.isFinite(rankingPosition)) return rankingPosition;
  const racerPosition = toFiniteNumber(row.position);
  return Number.isFinite(racerPosition) ? racerPosition : 999;
}

function isTopPosition(row = {}) {
  const position = getEffectivePosition(row);
  return position >= 1 && position <= 5;
}

function sortByEffectivePosition(a = {}, b = {}) {
  const posA = getEffectivePosition(a);
  const posB = getEffectivePosition(b);
  const aHasPos = Number.isFinite(posA) && posA < 999;
  const bHasPos = Number.isFinite(posB) && posB < 999;
  if (aHasPos && bHasPos && posA !== posB) return posA - posB;
  if (aHasPos && !bHasPos) return -1;
  if (!aHasPos && bHasPos) return 1;
  return compareQualPerformance(a, b);
}

function verifyRowsWithRankings(rows = [], rankings = []) {
  return rows.map((row) => {
    const ranking = findRankingForDriver(row, rankings);
    const rankingPosition = ranking?.position ?? null;
    const racePosition = toFiniteNumber(row.racePosition ?? row.position);
    const positionVerified = Number.isFinite(racePosition) && Number.isFinite(rankingPosition)
      ? Number(racePosition) === Number(rankingPosition)
      : false;

    const displayPosition = Number.isFinite(rankingPosition) ? rankingPosition : racePosition;

    return {
      ...row,
      rankingPosition,
      rankingDriver: ranking?.driver || '',
      rankingLapsTime: ranking?.lapsTime || '',
      rankingTop2Consecutive: ranking?.top2Consecutive || '',
      displayPosition,
      positionVerified,
      rankingVerified: Boolean(ranking),
      verificationNote: ranking
        ? (positionVerified ? 'Verified' : `Ranking shows P${rankingPosition}`)
        : 'Ranking not found',
    };
  });
}

function driverKey(row = {}) {
  return getNameKeys(row.driverName || row.driver || '')[0] || textKey(row.driverName || row.driver || `${row.raceUrl}_${row.raceNumber}`);
}

function isBetterRacerRow(candidate = {}, existing = {}) {
  const qualityCompare = compareQualPerformance(candidate, existing);
  if (qualityCompare !== 0) return qualityCompare < 0;
  return countStatFields(candidate) > countStatFields(existing);
}

function dedupeRows(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const key = driverKey(row);
    if (!key) return;
    const existing = map.get(key);
    if (!existing || isBetterRacerRow(row, existing)) {
      map.set(key, row);
    }
  });
  return Array.from(map.values());
}

function buildRowsFromRankings(racerRows = [], rankings = []) {
  const cleanRacerRows = dedupeRows(racerRows);
  if (!rankings.length) return assignQualOrder(verifyRowsWithRankings(cleanRacerRows, rankings));

  const remaining = [...cleanRacerRows];
  const rankedRows = rankings
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((ranking) => {
      const matchIndex = remaining.findIndex((row) => rowMatchesRanking(row, ranking));
      const matched = matchIndex >= 0 ? remaining.splice(matchIndex, 1)[0] : null;
      const racePosition = toFiniteNumber(matched?.racePosition ?? matched?.position);
      const positionVerified = matched && Number.isFinite(racePosition)
        ? Number(racePosition) === Number(ranking.position)
        : false;

      return {
        ...(matched || {}),
        source: matched?.source || 'rankingOnly',
        driver: matched?.driver || ranking.driver,
        driverName: matched?.driverName || ranking.driver,
        rankingPosition: ranking.position,
        rankingDriver: ranking.driver,
        rankingLapsTime: ranking.lapsTime || '',
        rankingTop2Consecutive: ranking.top2Consecutive || '',
        lapsTime: matched?.lapsTime || ranking.lapsTime || '',
        top2Consecutive: matched?.top2Consecutive || ranking.top2Consecutive || '',
        displayPosition: ranking.position,
        racePosition,
        positionVerified,
        rankingVerified: true,
        verificationNote: matched
          ? (positionVerified ? 'Verified' : `Ranking shows P${ranking.position}`)
          : `Ranking P${ranking.position}; racerLaps not found`,
      };
    });

  const leftovers = verifyRowsWithRankings(remaining, rankings)
    .filter((row) => !Number.isFinite(toFiniteNumber(row.rankingPosition)))
    .sort(sortByEffectivePosition);

  return [...rankedRows, ...leftovers];
}

function includeMeIfNeeded(rows = [], allRows = [], driver = {}) {
  const topRows = rows.slice().sort(sortByEffectivePosition).filter(isTopPosition).slice(0, 5);
  const me = allRows.find((row) => driverMatches(row.driverName || row.driver, driver));

  const marked = topRows.map((row) => ({
    ...row,
    displayPosition: row.displayPosition || getEffectivePosition(row),
    isMe: driverMatches(row.driverName || row.driver, driver),
  }));

  if (!me) return marked;

  const alreadyIncluded = marked.some((row) => (
    getEffectivePosition(row) === getEffectivePosition(me) &&
    driverMatches(row.driverName || row.driver, { displayName: me.driverName || me.driver })
  ));

  return alreadyIncluded
    ? marked
    : [...marked, { ...me, displayPosition: me.displayPosition || getEffectivePosition(me), isMe: true }].sort(sortByEffectivePosition);
}

export function parseTop5FromResultHtml(html = '', { className = '', driver = {}, raceMeta = {} } = {}) {
  const racerRows = dedupeRows(parseAllRacerLapsFromResultHtml(html, raceMeta));
  if (racerRows.length) {
    const rankings = parseRankingVerificationFromHtml(html, { roundLabel: raceMeta.roundLabel, className });
    const orderedRows = buildRowsFromRankings(racerRows, rankings);
    return includeMeIfNeeded(orderedRows, orderedRows, driver);
  }

  // Fallback for older LiveRC pages with no racerLaps object. This keeps the
  // existing Main parser from going blank, but racerLaps remains the preferred
  // source for detailed Top 5 data.
  const rows = getRows(html);
  const all = [];
  let inClass = !className;

  rows.forEach((rowHtml) => {
    const rowText = stripTags(rowHtml);
    if (className && classMatches(rowText, className) && getCells(rowHtml).length <= 2) {
      inClass = true;
      return;
    }
    if (!inClass) return;

    const cells = getCells(rowHtml);
    if (cells.length < 2) return;
    const position = parseNumber(cells[0]);
    if (!Number.isFinite(position)) return;

    const driverName = parseDriverFromCells(cells, rowHtml);
    if (!driverName) return;
    all.push({
      source: 'resultTable',
      position,
      racePosition: position,
      driver: driverName,
      driverName,
      lapsTime: parseLapsTimeFromCells(cells, rowText),
      fastestLap: parseFastLapFromCells(cells, rowText),
      rowText,
      className,
      roundLabel: raceMeta.roundLabel || '',
      raceNumber: raceMeta.raceNumber || '',
      raceUrl: raceMeta.raceUrl || '',
    });
  });

  const top5 = all.filter((row) => row.position >= 1 && row.position <= 5).slice(0, 5);
  return includeMeIfNeeded(top5, all, driver).map((row) => ({ ...row, displayPosition: row.position }));
}


function raceLooksLikeClass(race = {}, className = '') {
  if (!className) return true;
  if (race.classMatchedInList) return true;
  const quickText = `${race.linkText || ''} ${race.raceClassName || ''} ${race.className || ''}`;
  if (classMatches(quickText, className)) return true;
  const pageText = stripTags(String(race.html || '').slice(0, 8000));
  return classMatches(pageText, className);
}

export function buildTop5ForRoundRaceLinks(raceLinks = [], { roundLabel = '', className = '', driver = {} } = {}) {
  const wantedRoundKey = normalizeRoundKey(roundLabel);
  const sameRound = raceLinks.filter((race) => normalizeRoundKey(race.roundLabel) === wantedRoundKey);

  const rows = [];
  let rankingRows = [];

  sameRound.forEach((race) => {
    const raceMeta = {
      raceUrl: race.raceUrl,
      raceNumber: race.raceNumber,
      roundLabel: race.roundLabel,
      className: race.className || className,
      resultType: race.resultType,
    };

    if (!race.isRanking && race.resultType !== 'ranking' && raceLooksLikeClass(race, className)) {
      const racers = parseAllRacerLapsFromResultHtml(race.html, raceMeta);
      rows.push(...racers);
    }

    // Rankings are used only to order/verify racerLaps-derived rows. Lap/stat
    // values still come from racerLaps whenever a matching racerLaps row exists.
    rankingRows = rankingRows.concat(parseRankingVerificationFromHtml(race.html, {
      roundLabel: race.roundLabel || roundLabel,
      className: race.raceClassName || race.className || className,
    }));
  });

  const orderedRows = buildRowsFromRankings(rows, rankingRows);
  return includeMeIfNeeded(orderedRows, orderedRows, driver);
}

export function buildTop5ByRoundFromRaceLinks(raceLinks = [], { className = '', driver = {} } = {}) {
  const roundLabels = Array.from(new Set(raceLinks.map((race) => race.roundLabel).filter(Boolean)));
  const map = {};

  roundLabels.forEach((roundLabel) => {
    map[normalizeRoundKey(roundLabel)] = buildTop5ForRoundRaceLinks(raceLinks, { roundLabel, className, driver });
  });

  return map;
}


const QUAL_ROUND_RE = /Qualifier\s+Round\s+(\d+)/i;
const ROUND_LABEL_RE = /(Main\s+Events?|Qualifier\s+Round\s+\d+|Final\s+Results?|Practice\s+Round\s+\d+)/i;
const ROUND_LABEL_GLOBAL_RE = /(Main\s+Events?|Qualifier\s+Round\s+\d+|Final\s+Results?|Practice\s+Round\s+\d+)/gi;

function getQualifierRoundNumber(value = '') {
  const match = String(value || '').match(QUAL_ROUND_RE);
  return match ? String(match[1]) : '';
}

function normalizeRoundLabel(value = '') {
  const text = cleanSpaces(stripTags(value));
  return text.match(ROUND_LABEL_RE)?.[0] || text || 'Race Results';
}

function getRaceResultsSection(eventHtml = '') {
  const index = String(eventHtml || '').search(/Race\s+Results/i);
  return index >= 0 ? String(eventHtml || '').slice(index) : String(eventHtml || '');
}

function splitEventRaceResultsRounds(eventHtml = '') {
  const sectionHtml = getRaceResultsSection(eventHtml);
  const matches = [];
  let match;
  ROUND_LABEL_GLOBAL_RE.lastIndex = 0;

  while ((match = ROUND_LABEL_GLOBAL_RE.exec(sectionHtml))) {
    matches.push({ label: normalizeRoundLabel(match[0]), index: match.index });
  }

  if (!matches.length) return [{ label: 'Race Results', html: sectionHtml, index: 0 }];

  return matches.map((item, index) => {
    const next = matches[index + 1];
    return {
      label: item.label,
      html: sectionHtml.slice(item.index, next ? next.index : sectionHtml.length),
      index: item.index,
    };
  });
}

function extractRaceNumberFromText(text = '', href = '') {
  const source = `${text || ''} ${href || ''}`;
  return (
    source.match(/race\s*#?\s*:?\s*(\d+)/i)?.[1] ||
    source.match(/\brace\s+(\d+)\b/i)?.[1] ||
    ''
  );
}

function isViewRaceResultHref(href = '') {
  return /p=view_race_result/i.test(String(href || ''));
}

function isRoundRankingHref(href = '') {
  return /p=view_round_ranking/i.test(String(href || '')) || /ranking/i.test(String(href || ''));
}

function sameQualifierRound(labelA = '', labelB = '') {
  const a = getQualifierRoundNumber(labelA);
  const b = getQualifierRoundNumber(labelB);
  return Boolean(a && b && a === b);
}

function findQualifierRankingUrlFromEventHtml(eventHtml = '', eventUrl = '', roundLabel = '') {
  const roundNum = getQualifierRoundNumber(roundLabel);
  if (!roundNum) return '';

  const anchors = getAnchors(eventHtml);
  const exact = anchors.find((anchor) => {
    const text = stripTags(anchor.text || '');
    const combined = `${text} ${anchor.href || ''}`;
    return isRoundRankingHref(anchor.href || '') &&
      new RegExp(`Qualifier\\s+Round\\s+${roundNum}`, 'i').test(combined) &&
      /rank/i.test(combined);
  });

  if (exact?.href) return resolveLiveRcUrl(eventUrl, exact.href);

  // Some LiveRC event pages put the ranking link in a Qualifier Round section,
  // but the link text itself is only "Overall Ranking". Search by section so
  // Qual Round 1 opens the Qual Round 1 ranking page, Qual Round 2 opens Q2, etc.
  const roundSections = splitEventRaceResultsRounds(eventHtml)
    .filter((section) => sameQualifierRound(section.label, roundLabel));
  for (const section of roundSections) {
    const sectionAnchor = getAnchors(section.html).find((anchor) => isRoundRankingHref(anchor.href || ''));
    if (sectionAnchor?.href) return resolveLiveRcUrl(eventUrl, sectionAnchor.href);
  }

  const overallStart = String(eventHtml || '').search(/Overall\s+Results|Rankings?/i);
  const overallHtml = overallStart >= 0 ? String(eventHtml || '').slice(overallStart) : String(eventHtml || '');
  const overallSections = splitEventRaceResultsRounds(overallHtml)
    .filter((section) => sameQualifierRound(section.label, roundLabel));
  for (const section of overallSections) {
    const sectionAnchor = getAnchors(section.html).find((anchor) => isRoundRankingHref(anchor.href || ''));
    if (sectionAnchor?.href) return resolveLiveRcUrl(eventUrl, sectionAnchor.href);
  }

  const fallback = anchors.find((anchor) => {
    const combined = `${stripTags(anchor.text || '')} ${anchor.href || ''}`;
    return new RegExp(`Round\\s+${roundNum}`, 'i').test(combined) && /rank/i.test(combined);
  });

  return fallback?.href ? resolveLiveRcUrl(eventUrl, fallback.href) : '';
}

function findRoundRaceLinksFromEventHtml(eventHtml = '', eventUrl = '', { roundLabel = '', className = '' } = {}) {
  const roundNum = getQualifierRoundNumber(roundLabel);
  if (!roundNum) return [];

  const rounds = splitEventRaceResultsRounds(eventHtml)
    .filter((round) => sameQualifierRound(round.label, roundLabel));

  const links = [];
  const seen = new Set();

  rounds.forEach((round) => {
    const addAnchor = (anchor, contextText = '') => {
      if (!isViewRaceResultHref(anchor.href)) return;
      const text = stripTags(anchor.text || '');
      const combined = cleanSpaces(`${round.label} ${text} ${contextText}`);
      if (!/race\s*#?\s*:?\s*\d+/i.test(`${combined} ${anchor.href || ''}`)) return;

      const raceUrl = resolveLiveRcUrl(eventUrl, anchor.href);
      if (!raceUrl || seen.has(raceUrl)) return;
      seen.add(raceUrl);

      links.push({
        raceUrl,
        raceNumber: extractRaceNumberFromText(combined, anchor.href),
        roundLabel: round.label,
        className,
        linkText: combined,
        resultType: 'qualifier',
      });
    };

    getRows(round.html).forEach((rowHtml) => {
      const contextText = stripTags(rowHtml);
      getAnchors(rowHtml).forEach((anchor) => addAnchor(anchor, contextText));
    });

    getAnchors(round.html).forEach((anchor) => addAnchor(anchor, anchor.text));
  });

  return links;
}

function filterRankingTargets(rankings = [], driver = {}) {
  const ordered = rankings.slice().sort((a, b) => a.position - b.position);
  const topFive = ordered.filter((row) => row.position >= 1 && row.position <= 5).slice(0, 5);
  const me = ordered.find((row) => {
    const candidates = row.driverCandidates?.length ? row.driverCandidates : [row.driverName || row.driver];
    return candidates.some((name) => driverMatches(name, driver));
  });

  if (!me || topFive.some((row) => row.position === me.position)) return topFive;
  return [...topFive, me].sort((a, b) => a.position - b.position);
}

function findRacerRowForRanking(ranking = {}, racerRows = []) {
  const matches = racerRows.filter((row) => rowMatchesRanking(row, ranking));
  if (!matches.length) return null;

  if (ranking.lapsTime) {
    const exact = matches.find((row) => cleanSpaces(row.lapsTime) === cleanSpaces(ranking.lapsTime));
    if (exact) return exact;
  }

  return matches.slice().sort(compareQualPerformance)[0] || matches[0];
}

function buildRowsFromQualifierRankingTargets(targets = [], racerRows = [], driver = {}) {
  return targets.map((ranking) => {
    const matched = findRacerRowForRanking(ranking, racerRows);
    const racePosition = toFiniteNumber(matched?.racePosition ?? matched?.position);
    const positionVerified = matched && Number.isFinite(racePosition)
      ? Number(racePosition) === Number(ranking.position)
      : false;

    return {
      ...(matched || {}),
      source: matched?.source || 'rankingOnly',
      driver: matched?.driver || ranking.driver,
      driverName: matched?.driverName || ranking.driver,
      rankingPosition: ranking.position,
      displayPosition: ranking.position,
      rankingDriver: ranking.driver,
      rankingLapsTime: ranking.lapsTime || '',
      rankingTop2Consecutive: ranking.top2Consecutive || '',
      lapsTime: matched?.lapsTime || ranking.lapsTime || '',
      top2Consecutive: matched?.top2Consecutive || ranking.top2Consecutive || '',
      racePosition,
      positionVerified,
      rankingVerified: true,
      isMe: (ranking.driverCandidates || [ranking.driver]).some((name) => driverMatches(name, driver)) ||
        driverMatches(matched?.driverName || matched?.driver || '', driver),
      verificationNote: matched
        ? (positionVerified ? 'Verified' : `Ranking shows P${ranking.position}`)
        : `Ranking P${ranking.position}; racerLaps not found`,
    };
  }).sort(sortByEffectivePosition);
}

export async function buildQualifierTop5ForRun(run = {}, { eventHtml, rankingHtml } = {}) {
  const roundLabel = run?.roundLabel || '';
  const className = run?.className || run?.raceClassName || '';
  const driver = run?.driver || {};
  const eventUrl = run?.eventUrl || '';
  const roundNum = getQualifierRoundNumber(roundLabel);

  top5Debug('start', {
    runKeys: Object.keys(run || {}),
    roundLabel,
    roundNum,
    className,
    eventUrl,
    driver,
    savedTop5Count: Array.isArray(run?.top5) ? run.top5.length : 0,
  });

  if (!roundNum || !eventUrl || !className) {
    top5Debug('stop: missing required run data', {
      hasRoundNumber: Boolean(roundNum),
      hasEventUrl: Boolean(eventUrl),
      hasClassName: Boolean(className),
    });
    return Array.isArray(run?.top5) ? run.top5 : [];
  }

  let loadedEventHtml = '';
  try {
    loadedEventHtml = eventHtml || await fetchLiveRcText(eventUrl);
    top5Debug('event html loaded', {
      eventUrl,
      length: loadedEventHtml.length,
      hasRaceResults: /Race\s+Results/i.test(loadedEventHtml),
      hasOverallRanking: /Overall\s+Ranking|Overall\s+Results|Rankings?/i.test(loadedEventHtml),
    });
  } catch (error) {
    top5Debug('error loading event html', { eventUrl, error: error?.message || String(error) });
    return Array.isArray(run?.top5) ? run.top5 : [];
  }

  const rankingUrl = findQualifierRankingUrlFromEventHtml(loadedEventHtml, eventUrl, roundLabel);
  top5Debug('ranking url result', { rankingUrl, roundLabel, roundNum });

  let loadedRankingHtml = '';
  try {
    loadedRankingHtml = rankingHtml || (rankingUrl ? await fetchLiveRcText(rankingUrl) : '');
    top5Debug('ranking html loaded', {
      rankingUrl,
      length: loadedRankingHtml.length,
      hasClassName: className ? classMatches(stripTags(loadedRankingHtml), className) : false,
      titleSample: cleanSpaces(stripTags(loadedRankingHtml).slice(0, 240)),
    });
  } catch (error) {
    top5Debug('error loading ranking html', { rankingUrl, error: error?.message || String(error) });
  }

  const rankings = parseRankingVerificationFromHtml(loadedRankingHtml || loadedEventHtml, { roundLabel, className });
  top5Debug('rankings parsed', {
    count: rankings.length,
    sample: top5DebugSample(rankings),
  });

  const targets = filterRankingTargets(rankings, driver);
  top5Debug('ranking targets selected', {
    count: targets.length,
    sample: top5DebugSample(targets),
  });

  if (!targets.length) {
    top5Debug('stop: no ranking targets found', {
      rankingUrl,
      rankingsCount: rankings.length,
      className,
      roundLabel,
    });
    return Array.isArray(run?.top5) ? run.top5 : [];
  }

  const raceLinks = findRoundRaceLinksFromEventHtml(loadedEventHtml, eventUrl, { roundLabel, className });
  top5Debug('round race links found', {
    count: raceLinks.length,
    sample: top5DebugSample(raceLinks),
  });

  const racerRows = [];

  for (const race of raceLinks) {
    try {
      const html = await fetchLiveRcText(race.raceUrl);
      const parsedRows = parseAllRacerLapsFromResultHtml(html, {
        raceUrl: race.raceUrl,
        raceNumber: race.raceNumber,
        roundLabel: race.roundLabel,
        className,
        resultType: 'qualifier',
      });
      top5Debug('race racerLaps parsed', {
        raceNumber: race.raceNumber,
        raceUrl: race.raceUrl,
        htmlLength: html.length,
        racerLapsCount: parsedRows.length,
        sample: top5DebugSample(parsedRows),
      });
      racerRows.push(...parsedRows);
    } catch (error) {
      top5Debug('error loading/parsing race page', {
        raceNumber: race.raceNumber,
        raceUrl: race.raceUrl,
        error: error?.message || String(error),
      });
      // Keep Top 5 usable when a single heat page fails to load.
    }
  }

  top5Debug('all racerLaps rows collected', {
    count: racerRows.length,
    sample: top5DebugSample(racerRows, 10),
  });

  const finalRows = buildRowsFromQualifierRankingTargets(targets, racerRows, driver);
  top5Debug('final rows built', {
    count: finalRows.length,
    sample: top5DebugSample(finalRows, 10),
  });

  return finalRows;
}

export { normalizeRoundKey };
