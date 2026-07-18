import { getRows, getCells, getAnchors, stripTags, textKey, parseHiddenName } from './liveRcHtml';
import { classMatches } from './liveRcClassFinder';
import { fetchLiveRcText } from './liveRcClient';
import { resolveLiveRcUrl } from './liveRcUrls';
import {
  cleanDriverName,
  cleanSpaces,
  driverMatches,
  escapeRegExp,
  getTabContentHtml,
  getTablesWithIndex,
  htmlToCompactLines,
  mainLabelMatches,
  normalizeLapsTimeDisplay,
  normalizeMainLabel,
  parseAllRacerLapsFromResultHtml,
} from './liveRcTop5Shared';

const MAIN_TOP5_DEBUG_PREFIX = '[IMRC RaceDay Main Top5]';
const MAIN_TOP5_DEBUG_ENABLED = true;

function debug(step = '', data = {}) {
  if (!MAIN_TOP5_DEBUG_ENABLED) return;
  try {
    console.log(MAIN_TOP5_DEBUG_PREFIX, step, data);
  } catch (error) {
    console.log(MAIN_TOP5_DEBUG_PREFIX, step);
  }
}

function debugLines(title = '', lines = []) {
  if (!MAIN_TOP5_DEBUG_ENABLED) return;
  try {
    console.log(`${MAIN_TOP5_DEBUG_PREFIX} ${title}\n${lines.join('\n')}`);
  } catch (error) {
    console.log(MAIN_TOP5_DEBUG_PREFIX, title);
  }
}

function rowDriverKeys(row = {}) {
  return [row.driver, row.driverName, row.fullName, row.nickname, ...(row.driverCandidates || [])]
    .map((item) => textKey(item))
    .filter(Boolean);
}

function targetDriverKeys(target = {}) {
  return [target.driver, target.driverName, target.fullName, target.nickname, ...(target.driverCandidates || [])]
    .map((item) => textKey(item))
    .filter(Boolean);
}

function rowMatchesTarget(row = {}, target = {}) {
  const rowKeys = rowDriverKeys(row);
  const targetKeys = targetDriverKeys(target);
  return rowKeys.some((rowKey) => targetKeys.some((targetKey) => {
    if (rowKey === targetKey) return true;
    // Only allow contains matches on longer names so same-last-name racers do not collide.
    return rowKey.length >= 6 && targetKey.length >= 6 && (rowKey.includes(targetKey) || targetKey.includes(rowKey));
  }));
}

function sortByPosition(a = {}, b = {}) {
  const aPos = Number.parseInt(a.position ?? a.rankingPosition ?? a.displayPosition, 10);
  const bPos = Number.parseInt(b.position ?? b.rankingPosition ?? b.displayPosition, 10);
  if (Number.isFinite(aPos) && Number.isFinite(bPos)) return aPos - bPos;
  if (Number.isFinite(aPos)) return -1;
  if (Number.isFinite(bPos)) return 1;
  return 0;
}

function getHeadingBefore(html = '', index = 0) {
  const before = String(html || '').slice(Math.max(0, index - 1800), index);
  const headings = [...before.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)].map((match) => cleanSpaces(stripTags(match[1])));
  return headings[headings.length - 1] || cleanSpaces(stripTags(before).split(/\s{2,}|\n+/).slice(-4).join(' '));
}

function tableLooksLikeClass(table = {}, className = '') {
  if (!className) return true;
  const tableText = stripTags(table.html || '');
  const heading = getHeadingBefore(table.pageHtml || '', table.start || 0);
  return classMatches(`${heading} ${tableText.slice(0, 800)}`, className);
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
    if (cleaned && /[a-z]/i.test(cleaned) && !/^(pos|driver|laps|time|fast|avg|top|consistency)$/i.test(cleaned)) candidates.push(cleaned);
  });

  return Array.from(new Set(candidates.map(cleanDriverName).filter(Boolean)));
}

function findPositionInCells(cells = []) {
  for (const cell of cells.slice(0, 3)) {
    const text = cleanSpaces(cell);
    const match = text.match(/^P?\s*(\d+)\b/i);
    if (match) return Number.parseInt(match[1], 10);
  }
  return null;
}

function findLapsTimeInCells(cells = [], rowText = '') {
  const joined = [rowText, ...cells].join(' ');
  const match = joined.match(/\b0*\d+\s*\/\s*[0-9:]+(?:\.\d{1,3})?\b/);
  return match ? normalizeLapsTimeDisplay(match[0]) : '';
}

function findTop2InCells(cells = [], rowText = '') {
  const joined = [rowText, ...cells].join(' ');
  const decimals = joined.match(/\b\d+\.\d{3}\b/g) || [];
  return decimals.length ? decimals[decimals.length - 1] : '';
}

function parseFinalResultsTargetsFromTable(table = {}, { className = '', driver = {} } = {}) {
  const rows = [];
  getRows(table.html || '').forEach((rowHtml) => {
    const cells = getCells(rowHtml);
    const rowText = stripTags(rowHtml);
    if (cells.length < 2) return;
    if (/\bpos\b/i.test(rowText) && /\bdriver\b/i.test(rowText)) return;

    const position = findPositionInCells(cells);
    if (!Number.isFinite(position)) return;

    const candidates = parseDriverCandidatesFromRow(rowHtml, cells);
    const driverName = candidates.find((value) => /[a-z]/i.test(value) && !/^\d+$/.test(value)) || '';
    if (!driverName) return;

    rows.push({
      source: 'finalResults',
      position,
      rankingPosition: position,
      displayPosition: position,
      driver: driverName,
      driverName,
      driverCandidates: candidates,
      lapsTime: findLapsTimeInCells(cells, rowText),
      rankingLapsTime: findLapsTimeInCells(cells, rowText),
      rankingTop2Consecutive: findTop2InCells(cells, rowText),
      finalMainLabel: normalizeMainLabel(rowText),
      mainLabel: normalizeMainLabel(rowText),
      className,
      rankingVerified: true,
      isMe: candidates.some((candidate) => driverMatches(candidate, driver)),
    });
  });
  return rows.sort(sortByPosition);
}



function lineLooksLikeClassHeading(line = '', className = '') {
  const text = cleanSpaces(line);
  if (!text || !/[a-z]/i.test(text)) return false;
  if (/^(pos|brand|country|driver|result|race|toggle navigation|overall final ranking)$/i.test(text)) return false;
  return className ? classMatches(text, className) : true;
}

function findPlainFinalClassBounds(lines = [], className = '') {
  if (!lines.length) return { start: 0, end: lines.length, headingIndex: -1 };
  let headingIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (!lineLooksLikeClassHeading(lines[i], className)) continue;
    const nextText = lines.slice(i + 1, Math.min(lines.length, i + 8)).join(' ');
    if (/\bPos\b/i.test(nextText) && /\bDriver\b/i.test(nextText) && /\bResult\b/i.test(nextText)) {
      headingIndex = i;
      break;
    }
  }
  if (headingIndex < 0) return { start: 0, end: lines.length, headingIndex: -1 };
  let end = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    if (i > headingIndex + 3 && /\bPos\b/i.test(lines[i]) && /\bDriver\b/i.test(lines[i])) continue;
    if (i > headingIndex + 3 && /^[A-Za-z0-9 .\-]+$/.test(lines[i]) && lines.slice(i + 1, Math.min(lines.length, i + 7)).join(' ').match(/\bPos\b.*\bDriver\b.*\bResult\b/i)) {
      end = i;
      break;
    }
  }
  return { start: headingIndex, end, headingIndex };
}

function parsePlainFinalResultLine(line = '', { className = '', driver = {} } = {}) {
  let text = cleanSpaces(line)
    .replace(/\bImage\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Typical LiveRC final-result row after tags are stripped:
  // 5 KEN PRETTYMAN [1] 65/5:00.423 B Main
  const match = text.match(/^P?\s*(\d+)\s+(.+?)\s+\[\s*\d+\s*\]\s+([0-9]+\s*\/\s*[0-9:]+(?:\.\d{1,3})?(?:\s+\([A-Z]+\))?)\s+([A-Z]\s*[- ]?\s*Main)\b/i);
  if (!match) return null;

  const position = Number.parseInt(match[1], 10);
  const rawDriver = cleanDriverName(match[2]);
  const lapsTime = normalizeLapsTimeDisplay(match[3]);
  const mainLabel = normalizeMainLabel(match[4]);
  if (!Number.isFinite(position) || !rawDriver || !mainLabel) return null;

  const candidates = parseDriverCandidatesFromRow('', [rawDriver]);
  if (!candidates.length) candidates.push(rawDriver);

  return {
    source: 'finalResultsPlainText',
    position,
    rankingPosition: position,
    displayPosition: position,
    driver: candidates[0],
    driverName: candidates[0],
    driverCandidates: candidates,
    lapsTime,
    rankingLapsTime: lapsTime,
    finalMainLabel: mainLabel,
    mainLabel,
    className,
    rankingVerified: true,
    isMe: candidates.some((candidate) => driverMatches(candidate, driver)),
  };
}

function parseFinalResultsTargetsFromPlainText(html = '', { className = '', driver = {} } = {}) {
  const lines = htmlToCompactLines(html);
  const bounds = findPlainFinalClassBounds(lines, className);
  const scoped = lines.slice(bounds.start, bounds.end);
  const rows = scoped
    .map((line) => parsePlainFinalResultLine(line, { className, driver }))
    .filter(Boolean)
    .sort(sortByPosition);

  debug('final plain-text parser', {
    className,
    lineCount: lines.length,
    headingIndex: bounds.headingIndex,
    scopedCount: scoped.length,
    rows: rows.length,
    sample: rows.slice(0, 8).map((row) => ({ position: row.position, driver: row.driver, lapsTime: row.lapsTime, mainLabel: row.mainLabel })),
  });

  return rows;
}

function parseFinalResultsTargetsFromHtml(html = '', { className = '', driver = {} } = {}) {
  const plainRows = parseFinalResultsTargetsFromPlainText(html, { className, driver });
  const contentHtml = getTabContentHtml(html);
  const pageHtml = String(html || '');
  const tables = getTablesWithIndex(contentHtml).map((table) => ({ ...table, pageHtml: contentHtml }));
  const tableCandidates = tables
    .map((table) => ({ table, rows: parseFinalResultsTargetsFromTable(table, { className, driver }) }))
    .filter((item) => item.rows.length && tableLooksLikeClass(item.table, className));

  const tableRows = (() => {
    if (tableCandidates.length) {
      tableCandidates.sort((a, b) => b.rows.length - a.rows.length);
      return tableCandidates[0].rows;
    }

    const allTables = getTablesWithIndex(pageHtml).map((table) => ({ ...table, pageHtml }));
    const allCandidates = allTables
      .map((table) => ({ table, rows: parseFinalResultsTargetsFromTable(table, { className, driver }) }))
      .filter((item) => item.rows.length && tableLooksLikeClass(item.table, className));

    allCandidates.sort((a, b) => b.rows.length - a.rows.length);
    return allCandidates[0]?.rows || [];
  })();

  // Plain text parsing is more reliable for Final Results because LiveRC rows
  // contain the final "A Main/B Main" column. Keep that field so later we can
  // find the correct main page for drivers who were not in the A-Main.
  if (plainRows.length) return plainRows;
  return tableRows;
}

function filterFinalTargets(rows = [], driver = {}) {
  const ordered = rows.slice().sort(sortByPosition);
  const topFive = ordered.filter((row) => row.position >= 1 && row.position <= 5).slice(0, 5);
  const me = ordered.find((row) => row.isMe || (row.driverCandidates || [row.driver]).some((candidate) => driverMatches(candidate, driver)));
  if (!me || topFive.some((row) => row.position === me.position)) return topFive;
  return [...topFive, me].sort(sortByPosition);
}

function isFinalResultsHref(href = '', text = '') {
  const combined = `${href || ''} ${text || ''}`;
  return /Final\s+Results/i.test(combined) ||
    /event_?overall_?ranking|overall_?ranking/i.test(combined) ||
    /p\s*=\s*view_event_overall_ranking/i.test(combined);
}

function findFinalResultsUrlFromEventHtml(eventHtml = '', eventUrl = '') {
  const anchors = getAnchors(eventHtml);
  const exact = anchors.find((anchor) => isFinalResultsHref(anchor.href, anchor.text));
  return exact?.href ? resolveLiveRcUrl(eventUrl, exact.href) : '';
}

function getRaceResultsSection(eventHtml = '') {
  const index = String(eventHtml || '').search(/Race\s+Results/i);
  return index >= 0 ? String(eventHtml || '').slice(index) : String(eventHtml || '');
}

function getMainEventsSection(eventHtml = '') {
  const section = getRaceResultsSection(eventHtml);
  const mainIndex = section.search(/Main\s+Events?|Finals?/i);
  if (mainIndex < 0) return '';
  const afterMain = section.slice(mainIndex);
  const nextRound = afterMain.slice(8).search(/Qualifier\s+Round\s+\d+|Practice\s+Round\s+\d+|Overall\s+Results|Rankings?/i);
  return nextRound >= 0 ? afterMain.slice(0, nextRound + 8) : afterMain;
}

function extractRaceNumberFromText(text = '', href = '') {
  const match = `${text || ''} ${href || ''}`.match(/Race\s*#?\s*:?\s*(\d+)/i) ||
    `${text || ''} ${href || ''}`.match(/race[_-]?(\d+)/i) ||
    `${text || ''} ${href || ''}`.match(/[?&]id=(\d+)/i);
  return match ? String(match[1]) : '';
}

function isViewRaceResultHref(href = '') {
  return /p=view_race_result/i.test(String(href || ''));
}

function findMainRaceLinksFromEventHtml(eventHtml = '', eventUrl = '', { className = '' } = {}) {
  // Main Top 5 intentionally scans only the Main Events block. It does not
  // use the normal RaceDay sync scanner so this cannot change saved run sync.
  const mainHtml = getMainEventsSection(eventHtml) || eventHtml;
  const links = [];
  const seen = new Set();

  const addAnchor = (anchor, contextText = '', rowHtml = '') => {
    if (!isViewRaceResultHref(anchor.href)) return;

    const combined = cleanSpaces(`${stripTags(anchor.text || '')} ${contextText}`);
    const raceUrl = resolveLiveRcUrl(eventUrl, anchor.href);
    if (!raceUrl || seen.has(raceUrl)) return;

    seen.add(raceUrl);
    const mainLabel = normalizeMainLabel(combined);
    links.push({
      raceUrl,
      raceNumber: extractRaceNumberFromText(combined, anchor.href),
      roundLabel: 'Main Events',
      mainLabel,
      raceLabel: mainLabel,
      className,
      linkText: combined,
      rowText: cleanSpaces(contextText),
      rowHtml,
      resultType: 'main',
      eventRowClassMatched: className ? classMatches(combined, className) : false,
    });
  };

  getRows(mainHtml).forEach((rowHtml) => {
    const rowText = stripTags(rowHtml);
    getAnchors(rowHtml).forEach((anchor) => addAnchor(anchor, rowText, rowHtml));
  });

  // Fallback for LiveRC pages where race anchors are not wrapped in table rows.
  getAnchors(mainHtml).forEach((anchor) => addAnchor(anchor, anchor.text, ''));

  return links;
}


function anchorContextFromHtml(html = '', href = '') {
  const text = String(html || '');
  if (!href) return '';
  const escapedHref = escapeRegExp(href).replace(/&/g, '(?:&|&amp;)');
  const match = new RegExp(`<a\\b[^>]*href=["']${escapedHref}["'][^>]*>[\\s\\S]*?<\\/a>`, 'i').exec(text);
  if (!match) return '';
  const start = Math.max(0, match.index - 1200);
  const end = Math.min(text.length, match.index + match[0].length + 1200);
  return cleanSpaces(stripTags(text.slice(start, end)));
}

function findAllRaceResultLinksFromEventHtml(eventHtml = '', eventUrl = '', { className = '' } = {}) {
  // Main Top 5 fallback: collect every race-result link from the event page,
  // with surrounding context. This is separate from normal RaceDay sync and is
  // used only to find B/C/D mains when the event-page class row is not clear.
  const links = [];
  const seen = new Set();

  const addAnchor = (anchor, contextText = '', rowHtml = '', source = 'event') => {
    if (!isViewRaceResultHref(anchor.href)) return;
    const raceUrl = resolveLiveRcUrl(eventUrl, anchor.href);
    if (!raceUrl || seen.has(raceUrl)) return;

    const surrounding = contextText || anchorContextFromHtml(eventHtml, anchor.href) || stripTags(anchor.text || '');
    const combined = cleanSpaces(`${stripTags(anchor.text || '')} ${surrounding}`);
    const mainLabel = normalizeMainLabel(combined);
    const isQualifierCandidate = /Qualifier\s+Round\s+\d+|\bHeat\b|\bQual\b/i.test(combined);
    const isMainCandidate = /Main\s+Events?|Finals?|\b[A-Z]\s*[- ]?Main\b/i.test(combined) || Boolean(mainLabel);

    seen.add(raceUrl);
    links.push({
      raceUrl,
      raceNumber: extractRaceNumberFromText(combined, anchor.href),
      roundLabel: isMainCandidate ? 'Main Events' : '',
      mainLabel,
      raceLabel: mainLabel,
      className,
      linkText: combined,
      rowText: cleanSpaces(surrounding),
      rowHtml,
      resultType: 'main',
      source,
      isMainCandidate,
      isQualifierCandidate,
      eventRowClassMatched: className ? classMatches(combined, className) : false,
    });
  };

  getRows(eventHtml).forEach((rowHtml) => {
    const rowText = stripTags(rowHtml);
    getAnchors(rowHtml).forEach((anchor) => addAnchor(anchor, rowText, rowHtml, 'eventRow'));
  });

  getAnchors(eventHtml).forEach((anchor) => addAnchor(anchor, anchorContextFromHtml(eventHtml, anchor.href) || anchor.text, '', 'eventAnchor'));

  return links;
}

function getRacePageClassText(html = '') {
  const pageText = cleanSpaces(stripTags(html || ''));
  const title = cleanSpaces((String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, ''));
  const headings = [...String(html || '').matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
    .map((match) => cleanSpaces(stripTags(match[1])))
    .filter(Boolean)
    .join(' ');
  const classHeaderHints = [...String(html || '').matchAll(/class[_\s-]*(?:header|name)|race[_\s-]*class/gi)]
    .slice(0, 10)
    .map((match) => String(html || '').slice(Math.max(0, match.index - 180), match.index + 320))
    .map((chunk) => cleanSpaces(stripTags(chunk)))
    .join(' ');

  return cleanSpaces(`${title} ${headings} ${classHeaderHints} ${pageText.slice(0, 2500)}`);
}

function racePageMatchesClass(html = '', className = '') {
  if (!className) return true;
  return classMatches(getRacePageClassText(html), className);
}


function rowMatchesAnyTarget(row = {}, targets = []) {
  return targets.some((target) => rowMatchesTarget(row, target));
}

function filterRowsForTargets(rows = [], targets = []) {
  return rows.filter((row) => rowMatchesAnyTarget(row, targets));
}

function describeRaceAttempt(race = {}) {
  const label = race.mainLabel || race.raceLabel || race.roundLabel || '';
  const raceNumber = race.raceNumber ? `Race ${race.raceNumber}` : '';
  return cleanSpaces([label, raceNumber].filter(Boolean).join(' • ')) || race.raceUrl || 'Unknown main race';
}

function buildTargetAttemptLines(target = {}, raceChecks = [], matched = null) {
  const wantedMain = target.mainLabel || target.finalMainLabel || '';
  if (matched) {
    const foundRace = describeRaceAttempt(matched);
    return [`Found racerLaps: Found${foundRace ? ` (${foundRace})` : ''}`];
  }

  const preferredAttempts = raceChecks.filter((race) => {
    if (!wantedMain) return true;
    const raceMain = race.mainLabel || race.raceLabel || '';
    return !raceMain || mainLabelMatches(raceMain, wantedMain) || race.targetMatchedCount > 0;
  });
  const attemptsSource = preferredAttempts.length ? preferredAttempts : raceChecks;
  const attempts = attemptsSource
    .map((race) => {
      const raceName = describeRaceAttempt(race);
      const matchedText = race.targetMatchedCount ? `target matches: ${race.targetMatchedCount}` : 'target matches: 0';
      const classText = race.pageClassMatched ? 'class matched' : 'class not confirmed';
      const sourceText = race.source ? ` | source: ${race.source}` : '';
      const skipText = race.skippedReason ? ` | skipped: ${race.skippedReason}` : '';
      return `  Attempted: ${raceName} | ${classText} | racerLaps: ${race.racerLapsCount} | ${matchedText}${sourceText}${skipText} | ${race.raceUrl}`;
    });

  return [
    `Found racerLaps: NOT FOUND${wantedMain ? ` (expected ${wantedMain})` : ''}`,
    ...(attempts.length ? attempts : ['  Attempted: No main race pages were available to scan']),
  ];
}

function logMainTop5DriverChecklist(targets = [], racerRows = [], raceChecks = []) {
  const lines = ['Drivers List:'];
  targets.forEach((target) => {
    const matched = findRacerRowForTarget(target, racerRows);
    const position = target.position || target.displayPosition || target.rankingPosition || '?';
    const driverName = target.driver || target.driverName || 'Unknown Driver';
    lines.push(`${position}: ${driverName}`);
    lines.push(...buildTargetAttemptLines(target, raceChecks, matched));
  });
  debugLines('Finding Main Top 5: Found', lines);
}

function findRacerRowForTarget(target = {}, racerRows = []) {
  const allMatches = racerRows.filter((row) => rowMatchesTarget(row, target));
  if (!allMatches.length) return null;

  const targetMainLabel = target.mainLabel || target.finalMainLabel || '';
  const mainMatches = targetMainLabel
    ? allMatches.filter((row) => mainLabelMatches(row.mainLabel || row.raceLabel || row.linkText || row.roundLabel || '', targetMainLabel))
    : allMatches;
  const matches = mainMatches.length ? mainMatches : allMatches;

  if (target.lapsTime || target.rankingLapsTime) {
    const wanted = cleanSpaces(target.lapsTime || target.rankingLapsTime);
    const exact = matches.find((row) => cleanSpaces(row.lapsTime) === wanted);
    if (exact) return exact;
  }

  return matches.slice().sort((a, b) => {
    const aMainScore = targetMainLabel && mainLabelMatches(a.mainLabel || a.raceLabel || '', targetMainLabel) ? 1 : 0;
    const bMainScore = targetMainLabel && mainLabelMatches(b.mainLabel || b.raceLabel || '', targetMainLabel) ? 1 : 0;
    if (aMainScore !== bMainScore) return bMainScore - aMainScore;
    const aCount = Object.values(a || {}).filter(Boolean).length;
    const bCount = Object.values(b || {}).filter(Boolean).length;
    return bCount - aCount;
  })[0] || matches[0];
}

function buildRowsFromFinalTargets(targets = [], racerRows = [], driver = {}) {
  return targets.map((target) => {
    const matched = findRacerRowForTarget(target, racerRows);
    return {
      ...(matched || {}),
      source: matched?.source || 'finalResultsOnly',
      driver: matched?.driver || target.driver,
      driverName: matched?.driverName || target.driverName || target.driver,
      driverCandidates: target.driverCandidates || matched?.driverCandidates || [],
      rankingPosition: target.position,
      displayPosition: target.position,
      rankingDriver: target.driver,
      rankingLapsTime: target.rankingLapsTime || target.lapsTime || '',
      finalMainLabel: target.finalMainLabel || target.mainLabel || matched?.mainLabel || '',
      mainLabel: target.mainLabel || target.finalMainLabel || matched?.mainLabel || '',
      raceLabel: target.mainLabel || target.finalMainLabel || matched?.raceLabel || '',
      lapsTime: matched?.lapsTime || target.lapsTime || target.rankingLapsTime || '',
      top2Consecutive: matched?.top2Consecutive || target.rankingTop2Consecutive || '',
      rankingTop2Consecutive: target.rankingTop2Consecutive || '',
      rankingVerified: true,
      positionVerified: true,
      isMe: target.isMe || driverMatches(target.driver || '', driver) || driverMatches(matched?.driverName || matched?.driver || '', driver),
      verificationNote: matched ? 'Final Results verified' : `Final Results P${target.position}; racerLaps not found`,
    };
  }).sort(sortByPosition);
}

export async function buildMainTop5ForRun(run = {}, { eventHtml, finalResultsHtml } = {}) {
  const className = run?.className || run?.raceClassName || '';
  const driver = run?.driver || {};
  const eventUrl = run?.eventUrl || '';

  debug('start', {
    className,
    driver,
    eventUrl,
    raceUrl: run?.raceUrl || '',
    roundLabel: run?.roundLabel || '',
    savedTop5Count: Array.isArray(run?.top5) ? run.top5.length : 0,
  });

  if (!eventUrl || !className) {
    debug('stop: missing required run data', { hasEventUrl: Boolean(eventUrl), hasClassName: Boolean(className) });
    return Array.isArray(run?.top5) ? run.top5 : [];
  }

  let loadedEventHtml = '';
  try {
    loadedEventHtml = eventHtml || await fetchLiveRcText(eventUrl);
    debug('event html loaded', {
      eventUrl,
      length: loadedEventHtml.length,
      hasFinalResults: /Final\s+Results|event_?overall_?ranking|overall_?ranking/i.test(loadedEventHtml),
      hasRaceResults: /Race\s+Results/i.test(loadedEventHtml),
    });
  } catch (error) {
    debug('error loading event html', { eventUrl, error: error?.message || String(error) });
    return Array.isArray(run?.top5) ? run.top5 : [];
  }

  const finalResultsUrl = findFinalResultsUrlFromEventHtml(loadedEventHtml, eventUrl);
  debug('final results url result', { finalResultsUrl });

  let loadedFinalHtml = '';
  try {
    loadedFinalHtml = finalResultsHtml || (finalResultsUrl ? await fetchLiveRcText(finalResultsUrl) : '');
    debug('final results html loaded', {
      finalResultsUrl,
      length: loadedFinalHtml.length,
      hasClassName: className ? classMatches(stripTags(loadedFinalHtml), className) : false,
      titleSample: cleanSpaces(stripTags(loadedFinalHtml).slice(0, 220)),
    });
  } catch (error) {
    debug('error loading final results html', { finalResultsUrl, error: error?.message || String(error) });
  }

  const finalRows = parseFinalResultsTargetsFromHtml(loadedFinalHtml || loadedEventHtml, { className, driver });
  debug('final results parsed', {
    count: finalRows.length,
    sample: finalRows.slice(0, 6).map((row) => ({ position: row.position, driver: row.driver, lapsTime: row.lapsTime, mainLabel: row.mainLabel })),
  });

  const targets = filterFinalTargets(finalRows, driver);
  debug('final targets selected', {
    count: targets.length,
    sample: targets.slice(0, 6).map((row) => ({ position: row.position, driver: row.driver, lapsTime: row.lapsTime, mainLabel: row.mainLabel })),
  });

  if (!targets.length) {
    debug('stop: no final results targets found', { finalResultsUrl, className });
    return Array.isArray(run?.top5) ? run.top5 : [];
  }

  const raceLinks = findMainRaceLinksFromEventHtml(loadedEventHtml, eventUrl, { className });
  const allEventRaceLinks = findAllRaceResultLinksFromEventHtml(loadedEventHtml, eventUrl, { className });
  const broadMainRaceLinks = allEventRaceLinks.filter((race) => race.isMainCandidate && !race.isQualifierCandidate);
  const classOrMainFallbackLinks = allEventRaceLinks.filter((race) => race.eventRowClassMatched || race.isMainCandidate);

  const raceLinksWithCurrent = run?.raceUrl
    ? [{
        raceUrl: run.raceUrl,
        raceNumber: run.raceNumber || '',
        roundLabel: run.roundLabel || 'Main Events',
        mainLabel: normalizeMainLabel(run?.mainLabel || run?.raceLabel || run?.roundLabel || ''),
        raceLabel: normalizeMainLabel(run?.mainLabel || run?.raceLabel || run?.roundLabel || ''),
        className,
        resultType: 'main',
        source: 'currentRun',
        isMainCandidate: true,
        isQualifierCandidate: false,
      }, ...raceLinks, ...broadMainRaceLinks, ...classOrMainFallbackLinks]
    : [...raceLinks, ...broadMainRaceLinks, ...classOrMainFallbackLinks];

  const uniqueRaceLinks = Array.from(new Map(raceLinksWithCurrent.map((race) => [race.raceUrl, race])).values())
    .filter((race) => !race.isQualifierCandidate);

  debug('main race links found', {
    count: uniqueRaceLinks.length,
    standardCount: raceLinks.length,
    broadMainCount: broadMainRaceLinks.length,
    allEventRaceCount: allEventRaceLinks.length,
    sample: uniqueRaceLinks.slice(0, 12).map((race) => ({
      raceNumber: race.raceNumber,
      mainLabel: race.mainLabel,
      source: race.source,
      isMainCandidate: race.isMainCandidate,
      eventRowClassMatched: race.eventRowClassMatched,
      raceUrl: race.raceUrl,
    })),
  });

  const racerRows = [];
  const classMatchedRaceLinks = [];
  const raceChecks = [];
  for (const race of uniqueRaceLinks) {
    try {
      const html = await fetchLiveRcText(race.raceUrl);
      const racePageText = getRacePageClassText(html);
      const pageClassMatched = racePageMatchesClass(html, className);
      const pageMainLabel = normalizeMainLabel(racePageText);
      const effectiveMainLabel = race.mainLabel || pageMainLabel || normalizeMainLabel(race.linkText || race.rowText || '');
      const pageLooksLikeMain = Boolean(effectiveMainLabel) || race.isMainCandidate || /Main\s+Events?|Finals?/i.test(racePageText);

      // Keep Qualifier pages out of Main Top 5. The broad fallback is allowed
      // to scan all event race links, but only Main-looking pages can provide
      // racerLaps rows for this Main popup.
      if (!pageLooksLikeMain && race.isQualifierCandidate) {
        raceChecks.push({
          ...race,
          raceName: describeRaceAttempt(race),
          pageClassMatched: false,
          skippedReason: 'qualifier/non-main page',
          racerLapsCount: 0,
          targetMatchedCount: 0,
          targetMatchSummary: [],
        });
        debug('main race page skipped: not a main', { raceNumber: race.raceNumber, raceUrl: race.raceUrl, source: race.source });
        continue;
      }

      const parsedRows = parseAllRacerLapsFromResultHtml(html, {
        raceUrl: race.raceUrl,
        raceNumber: race.raceNumber,
        roundLabel: race.roundLabel || 'Main Events',
        className,
        resultType: 'main',
      }).map((row) => ({
        ...row,
        mainLabel: effectiveMainLabel,
        raceLabel: race.raceLabel || effectiveMainLabel,
        linkText: race.linkText || '',
      }));
      const targetMatchedRows = filterRowsForTargets(parsedRows, targets);
      const targetMatchSummary = targets.map((target) => {
        const matches = parsedRows.filter((row) => rowMatchesTarget(row, target));
        return {
          position: target.position || target.displayPosition || target.rankingPosition || '',
          driver: target.driver || target.driverName || '',
          expectedMain: target.mainLabel || target.finalMainLabel || '',
          matchedCount: matches.length,
          matchedSample: matches.slice(0, 3).map((row) => ({
            driver: row.driver || row.driverName,
            lapsTime: row.lapsTime,
            fastestLap: row.fastestLap,
          })),
        };
      });
      raceChecks.push({
        ...race,
        mainLabel: effectiveMainLabel || race.mainLabel || '',
        raceLabel: race.raceLabel || effectiveMainLabel || '',
        raceName: describeRaceAttempt({ ...race, mainLabel: effectiveMainLabel || race.mainLabel || '' }),
        pageClassMatched,
        pageLooksLikeMain,
        source: race.source || '',
        racerLapsCount: parsedRows.length,
        targetMatchedCount: targetMatchedRows.length,
        targetMatchSummary,
      });

      debug('main race page class/target check', {
        raceNumber: race.raceNumber,
        raceUrl: race.raceUrl,
        source: race.source,
        mainLabel: effectiveMainLabel,
        pageLooksLikeMain,
        eventRowClassMatched: race.eventRowClassMatched,
        pageClassMatched,
        className,
        racerLapsCount: parsedRows.length,
        targetMatchedCount: targetMatchedRows.length,
        targetMatchedSample: targetMatchedRows.slice(0, 6).map((row) => ({ driver: row.driver || row.driverName, lapsTime: row.lapsTime })),
        targetMatchSummary,
      });

      // Final Results decides which drivers belong in Main Top 5.
      // For A/B/C mains, LiveRC does not always expose the class name clearly on
      // every race page. If the page class matches, keep all rows from that race.
      // If class detection fails, still keep only rows that match the Final
      // Results target drivers. This lets a P6+ driver from a B/C main get their
      // racerLaps data without pulling unrelated classes/races into the popup.
      if (!pageClassMatched && !targetMatchedRows.length) continue;

      classMatchedRaceLinks.push({
        ...race,
        mainLabel: effectiveMainLabel || race.mainLabel || '',
        raceLabel: race.raceLabel || effectiveMainLabel || '',
        pageClassMatched,
        targetMatchedFallback: !pageClassMatched && targetMatchedRows.length > 0,
      });

      debug('main racerLaps parsed', {
        raceNumber: race.raceNumber,
        raceUrl: race.raceUrl,
        source: race.source,
        mainLabel: effectiveMainLabel,
        pageClassMatched,
        targetMatchedFallback: !pageClassMatched && targetMatchedRows.length > 0,
        racerLapsCount: parsedRows.length,
        keptRowsCount: pageClassMatched ? parsedRows.length : targetMatchedRows.length,
        sample: (pageClassMatched ? parsedRows : targetMatchedRows).slice(0, 8).map((row) => ({ driver: row.driver || row.driverName, lapsTime: row.lapsTime, fastestLap: row.fastestLap })),
      });

      // Keep every racer from class-matched Main pages. If the class cannot be
      // detected on that specific page, keep only the Final Results target rows.
      racerRows.push(...(pageClassMatched ? parsedRows : targetMatchedRows));
    } catch (error) {
      debug('error loading/parsing main race page', {
        raceNumber: race.raceNumber,
        raceUrl: race.raceUrl,
        error: error?.message || String(error),
      });
    }
  }

  debug('class matched main race pages complete', {
    count: classMatchedRaceLinks.length,
    racerRowsCount: racerRows.length,
    sampleRaces: classMatchedRaceLinks.slice(0, 8).map((race) => ({ raceNumber: race.raceNumber, mainLabel: race.mainLabel, raceUrl: race.raceUrl })),
  });

  logMainTop5DriverChecklist(targets, racerRows, raceChecks);

  const finalBuiltRows = buildRowsFromFinalTargets(targets, racerRows, driver);
  debug('final rows built', {
    count: finalBuiltRows.length,
    sample: finalBuiltRows.slice(0, 6).map((row) => ({ position: row.displayPosition, driver: row.driver, lapsTime: row.lapsTime, mainLabel: row.mainLabel, fastestLap: row.fastestLap })),
  });

  return finalBuiltRows;
}
