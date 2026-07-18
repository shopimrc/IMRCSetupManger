import { fetchLiveRcText } from './liveRcClient';
import { resolveLiveRcUrl } from './liveRcUrls';
import { decodeHtml, getAnchors, getCells, getRows, getTables, stripTags, textKey } from './liveRcHtml';

const DEBUG_PREFIX = '[IMRC RaceDay Lineups]';

function clean(value = '') {
  return decodeHtml(String(value || ''))
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDriver(value = '') {
  return clean(value)
    .toUpperCase()
    .replace(/^[#\d]+\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeClass(value = '') {
  return clean(value)
    .replace(/\bentries\s*:?\s*\d+\b/gi, '')
    .replace(/\bRace\s*#?\s*\d+\b/gi, '')
    .replace(/\bQualifier\s+Round\s+\d+\b/gi, '')
    .replace(/\bMain Events?\b/gi, '')
    .replace(/\b[A-Z]-?Main\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTx(value = '') {
  return String(value || '').replace(/[^0-9]/g, '').trim();
}


function decodeHtmlLoose(value = '') {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function htmlToLineText(html = '') {
  return decodeHtmlLoose(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(tr|div|p|li|h[1-6]|table|thead|tbody|section|article)\s*>/gi, '\n')
    .replace(/<\s*(tr|div|p|li|h[1-6]|table|thead|tbody|section|article)\b[^>]*>/gi, '\n')
    .replace(/<\/\s*t[dh]\s*>/gi, ' | ')
    .replace(/<\s*t[dh]\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function getLinesFromHtml(html = '') {
  return htmlToLineText(html)
    .split(/\n+/)
    .map((line) => clean(line.replace(/\s*\|\s*/g, ' | ')))
    .filter(Boolean);
}

function isStandaloneRaceNumberLine(line = '') {
  return /^\d{1,3}$/.test(clean(line));
}

function lineHasDriverTableHeader(line = '') {
  return /\bPos\b/i.test(line) && (/\bDriver\b/i.test(line) || /\bCar\s*#\b/i.test(line) || /\bTx\s*#\b/i.test(line));
}

function getRoundFromHeatSheetLines(lines = [], link = {}) {
  const linkRound = link?.roundLabel ? {
    roundLabel: link.roundLabel,
    roundType: link.roundType,
    roundNum: link.roundNum,
  } : null;

  const heading = lines.find((line) => /Race\s+Lineup/i.test(line) && (/Qualifier\s+Round\s+\d+/i.test(line) || /Main Events?|[A-Z]-?Main/i.test(line)));
  if (heading) return getRoundFromText(heading);
  return linkRound || { roundLabel: '', roundType: '', roundNum: 0 };
}

function looksLikeHeatRaceStart(lines = [], index = 0) {
  const line = clean(lines[index]);
  if (!isStandaloneRaceNumberLine(line)) return false;

  const lookAhead = lines.slice(index + 1, index + 8).join(' ');
  return /\bLength\s*:|\bTimed\b|\bStatus\s*:|\bPos\b.*\bDriver\b|\bTx\s*#/i.test(lookAhead);
}

function extractHeatSheetSections(html = '', link = {}) {
  const lines = getLinesFromHtml(html);
  const round = getRoundFromHeatSheetLines(lines, link);
  const sections = [];
  const startIndexes = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (looksLikeHeatRaceStart(lines, i)) startIndexes.push(i);
  }

  for (let sIndex = 0; sIndex < startIndexes.length; sIndex += 1) {
    const start = startIndexes[sIndex];
    const end = startIndexes[sIndex + 1] || lines.length;
    const sectionLines = lines.slice(start, end);
    const raceNumber = clean(sectionLines[0]);
    const headerIndex = sectionLines.findIndex(lineHasDriverTableHeader);
    const classLines = headerIndex > 1 ? sectionLines.slice(1, headerIndex) : sectionLines.slice(1, 4);
    const className = normalizeClass(classLines.find((line) => /[A-Za-z]/.test(line) && !/Length\s*:|Timed|Status\s*:/i.test(line)) || link.className || '');
    const sectionText = sectionLines.join(' ');

    sections.push({
      raceNumber,
      raceLabel: raceNumber ? `Race ${raceNumber}` : '',
      className,
      classKey: textKey(className),
      roundLabel: round.roundLabel || link.roundLabel || '',
      roundType: round.roundType || link.roundType || '',
      roundNum: round.roundNum || link.roundNum || 0,
      lines: sectionLines,
      text: sectionText,
    });
  }

  return sections;
}

function sectionMatchesTarget(section = {}, target = {}) {
  const sectionText = ` ${section.text || ''} `;
  if (target.tx && new RegExp(`\\b${target.tx}\\b`).test(sectionText)) return true;

  const sectionKey = normalizeDriver(sectionText);
  const driverOk = target.driver && sectionKey.includes(target.driver);
  const fullNameOk = target.fullName && sectionKey.includes(target.fullName);
  if (!(driverOk || fullNameOk)) return false;

  if (!target.classKey) return true;
  const sectionClassKey = textKey(section.className || '');
  return !sectionClassKey || sectionClassKey.includes(target.classKey) || target.classKey.includes(sectionClassKey);
}

function getVehicleId(vehicle = {}) {
  return String(vehicle.id || vehicle.vehicleId || vehicle.key || '').trim();
}

function getVehicleTx(vehicle = {}) {
  return normalizeTx(vehicle.transponder || vehicle.tx || vehicle.transponderNumber || vehicle.transponderId || vehicle.number || '');
}

function getRaceNumber(text = '', href = '') {
  const value = `${clean(text)} ${clean(href)}`;
  return (
    value.match(/\brace\s*#?\s*(\d+)\b/i)?.[1] ||
    value.match(/\br(?:ace)?[_-]?(\d+)\b/i)?.[1] ||
    value.match(/[?&]race(?:_id|Id)?=(\d+)/i)?.[1] ||
    ''
  );
}

function getRoundFromText(text = '') {
  const haystack = clean(text);
  const mainMatch = haystack.match(/\b(Main Events?|[A-Z]-?Main|Finals?)\b/i);
  if (mainMatch) {
    const mainLabel = clean(mainMatch[1]).replace(/^main events?$/i, 'Main Events');
    return { roundType: 'main', roundNum: 999, roundLabel: mainLabel };
  }

  const qualMatch = haystack.match(/\bQualifier\s+Round\s+(\d+)\b/i);
  if (qualMatch) return { roundType: 'qualifier', roundNum: Number(qualMatch[1]) || 0, roundLabel: `Qualifier Round ${qualMatch[1]}` };

  const shortQualMatch = haystack.match(/\bQ\s*(\d+)\b/i);
  if (shortQualMatch) return { roundType: 'qualifier', roundNum: Number(shortQualMatch[1]) || 0, roundLabel: `Qualifier Round ${shortQualMatch[1]}` };

  return { roundType: '', roundNum: 0, roundLabel: '' };
}

function compareRoundPriority(a = {}, b = {}) {
  const aPriority = a.roundType === 'main' ? 10000 : Number(a.roundNum || 0);
  const bPriority = b.roundType === 'main' ? 10000 : Number(b.roundNum || 0);
  return bPriority - aPriority;
}

function sliceRaceLineupsSection(html = '') {
  const source = String(html || '');
  const lower = source.toLowerCase();
  const startCandidates = [
    lower.indexOf('race lineups & entry list'),
    lower.indexOf('race lineups'),
    lower.indexOf('lineups & entry list'),
  ].filter((idx) => idx >= 0);
  if (!startCandidates.length) return source;

  const start = Math.min(...startCandidates);
  const endCandidates = [
    lower.indexOf('race results', start + 1),
    lower.indexOf('overall results', start + 1),
    lower.indexOf('rankings', start + 1),
  ].filter((idx) => idx > start);
  const end = endCandidates.length ? Math.min(...endCandidates) : source.length;
  return source.slice(start, end);
}

function getAnchorContext(sectionHtml = '', anchorRaw = '') {
  const index = sectionHtml.indexOf(anchorRaw);
  if (index < 0) return stripTags(anchorRaw);

  const before = sectionHtml.slice(Math.max(0, index - 2600), index);
  const after = sectionHtml.slice(index, Math.min(sectionHtml.length, index + 1200));
  const rowStart = before.lastIndexOf('<tr');
  const rowEnd = after.search(/<\/tr>/i);
  if (rowStart >= 0 && rowEnd >= 0) {
    return stripTags(before.slice(rowStart) + after.slice(0, rowEnd + 5));
  }
  return stripTags(before.slice(-900) + ' ' + after.slice(0, 900));
}

function isLikelyLineupLink(anchor = {}, context = '') {
  const href = String(anchor.href || '');
  const text = clean(anchor.text || '');
  const combined = `${href} ${text} ${context}`;

  if (/view_(race_)?result|view_round_ranking|view_event|view_entry_list/i.test(href)) return false;
  if (/view_heat_sheet/i.test(href)) return /Qualifier\s+Round\s+\d+|Main Events?|Race\s+Lineups?|Lineup/i.test(combined);
  if (/view_(race_)?lineup|lineup/i.test(href)) return true;
  if (/\bRace\s*#?\s*\d+\b/i.test(combined) && /\bQualifier\s+Round\s+\d+\b|\bMain Events?\b|\b[A-Z]-?Main\b/i.test(combined)) return true;
  return false;
}

function extractClassFromLineupContext(context = '') {
  const text = clean(context);
  const racePattern = /(?:Race\s*#?\s*\d+\s*[:\-]?\s*)([^|\n\r<>]+?)(?=\s*(?:\bRace\s*#?\s*\d+\b|\bQualifier\s+Round\s+\d+\b|\bMain Events?\b|$))/i;
  const raceMatch = text.match(racePattern);
  if (raceMatch?.[1]) return normalizeClass(raceMatch[1]);

  // Common LiveRC context may be: "Race 25 25.5 Hcot Truck".
  const afterRaceNumber = text.match(/\bRace\s*#?\s*\d+\s+(.{2,80})/i)?.[1] || '';
  if (afterRaceNumber) {
    const cleaned = normalizeClass(afterRaceNumber.split(/\s{2,}|\|/)[0]);
    if (cleaned && !/^Race$/i.test(cleaned)) return cleaned;
  }

  return '';
}

export function parseRaceLineupLinksFromEventHtml(html = '', options = {}) {
  const { eventUrl = '', siteUrl = '' } = options;
  const sectionHtml = sliceRaceLineupsSection(html);
  const anchors = getAnchors(sectionHtml);
  const links = [];
  const seen = new Set();

  for (const anchor of anchors) {
    const context = getAnchorContext(sectionHtml, anchor.raw);
    if (!isLikelyLineupLink(anchor, context)) continue;

    const url = resolveLiveRcUrl(eventUrl || siteUrl, anchor.href);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const combined = `${context} ${anchor.text} ${anchor.href}`;
    const round = getRoundFromText(combined);
    const raceNumber = getRaceNumber(combined, anchor.href);
    const className = extractClassFromLineupContext(combined);

    links.push({
      url,
      raceUrl: url,
      raceNumber,
      raceLabel: raceNumber ? `Race ${raceNumber}` : clean(anchor.text || 'Race'),
      className,
      classKey: textKey(className),
      roundType: round.roundType,
      roundNum: round.roundNum,
      roundLabel: round.roundLabel,
      source: 'Race Lineups & Entry List',
      context: clean(context).slice(0, 600),
    });
  }

  return links.sort(compareRoundPriority);
}

function parseLineupRowsFromHtml(html = '') {
  const rows = [];
  const tables = getTables(html);

  for (const table of tables) {
    for (const rowHtml of getRows(table)) {
      const cells = getCells(rowHtml).map(clean).filter(Boolean);
      if (cells.length < 2) continue;
      const joined = cells.join(' | ');
      if (/driver\s*class|transponder|position|race/i.test(joined) && !/\d{4,}/.test(joined)) continue;

      const tx = normalizeTx(joined.match(/\b(\d{5,9})\b/)?.[1] || '');
      const position = cells.find((cell) => /^\d{1,2}$/.test(cell)) || '';
      const driverCell = cells.find((cell) => /[A-Za-z]/.test(cell) && !/class|race|transponder|position/i.test(cell)) || '';
      const classCell = cells.slice().reverse().find((cell) => /[A-Za-z]/.test(cell) && cell !== driverCell && !/^\d{1,2}$/.test(cell)) || '';

      rows.push({
        position,
        driver: clean(driverCell),
        driverKey: normalizeDriver(driverCell),
        className: normalizeClass(classCell || ''),
        classKey: textKey(classCell || ''),
        tx,
        cells,
        text: joined,
      });
    }
  }

  if (!rows.length) {
    const plain = stripTags(html);
    const lines = plain.split(/\n|\r|(?=\b\d+\s+[A-Za-z])/).map(clean).filter(Boolean);
    for (const line of lines) {
      if (!/\b\d{5,9}\b/.test(line) && !/\b[A-Za-z]{2,}\b/.test(line)) continue;
      const tx = normalizeTx(line.match(/\b(\d{5,9})\b/)?.[1] || '');
      const position = line.match(/^\s*(\d{1,2})\b/)?.[1] || '';
      const driver = line
        .replace(/^\s*\d{1,2}\s+/, '')
        .replace(/\([^)]*\d{5,9}[^)]*\)/g, '')
        .split(/\s{2,}|\|/)[0];
      rows.push({
        position,
        driver: clean(driver),
        driverKey: normalizeDriver(driver),
        className: '',
        classKey: '',
        tx,
        cells: [line],
        text: line,
      });
    }
  }

  return rows.filter((row) => row.driver || row.tx || row.className);
}

function getTargetInfo(vehicle = {}, entryMatch = {}) {
  const vehicleId = getVehicleId(vehicle) || String(entryMatch.vehicleId || entryMatch.id || '').trim();
  const tx = getVehicleTx(vehicle) || normalizeTx(entryMatch.tx || entryMatch.transponder || entryMatch.transponderNumber || '');
  const driver = normalizeDriver(entryMatch.driver || entryMatch.driverName || entryMatch.nickname || vehicle.driver || vehicle.nickname || vehicle.name || '');
  const fullName = normalizeDriver(entryMatch.fullName || entryMatch.name || vehicle.fullName || '');
  const className = normalizeClass(entryMatch.className || entryMatch.class || vehicle.className || vehicle.raceClass || '');

  return { vehicleId, tx, driver, fullName, className, classKey: textKey(className) };
}

function classMatches(link = {}, row = {}, target = {}) {
  if (!target.classKey) return true;
  const linkKey = textKey(link.className || '');
  if (linkKey) return linkKey.includes(target.classKey) || target.classKey.includes(linkKey);

  const rowKey = textKey(row.className || '');
  if (!rowKey) return true;
  return rowKey.includes(target.classKey) || target.classKey.includes(rowKey);
}

function rowMatchesTarget(row = {}, target = {}, link = {}) {
  const txOk = target.tx && row.tx && target.tx === row.tx;
  const driverOk = target.driver && row.driverKey && (row.driverKey === target.driver || row.driverKey.includes(target.driver) || target.driver.includes(row.driverKey));
  const fullNameOk = target.fullName && row.driverKey && (row.driverKey === target.fullName || row.driverKey.includes(target.fullName) || target.fullName.includes(row.driverKey));

  return classMatches(link, row, target) && (txOk || driverOk || fullNameOk);
}

function buildBestLineup(currentBest, candidate) {
  if (!currentBest) return candidate;
  const priorityDelta = compareRoundPriority(currentBest, candidate);
  if (priorityDelta > 0) return candidate;
  if (priorityDelta < 0) return currentBest;
  const currentRace = Number(currentBest.raceNumber || 0);
  const candidateRace = Number(candidate.raceNumber || 0);
  return candidateRace > currentRace ? candidate : currentBest;
}

export async function findRaceLineupsForVehicles(options = {}) {
  const { eventUrl = '', siteUrl = '', vehicles = [], entryMatches = [], eventHtml = '', fetchText = fetchLiveRcText, debug = false } = options;
  if (!eventUrl) return [];

  const html = eventHtml || (await fetchText(eventUrl));
  const links = parseRaceLineupLinksFromEventHtml(html, { eventUrl, siteUrl });
  const entryByVehicle = new Map((entryMatches || []).map((entry) => [String(entry.vehicleId || entry.id || ''), entry]));
  const targets = (vehicles || []).map((vehicle) => getTargetInfo(vehicle, entryByVehicle.get(getVehicleId(vehicle)) || {}));
  const byVehicle = new Map();

  if (debug) {
    console.log(DEBUG_PREFIX, 'lineup links found', { count: links.length, sample: links.slice(0, 8).map((link) => ({ roundLabel: link.roundLabel, raceNumber: link.raceNumber, className: link.className, url: link.url })) });
  }

  for (const link of links) {
    let lineupHtml = '';
    try {
      lineupHtml = await fetchText(link.url);
    } catch (error) {
      if (debug) console.log(DEBUG_PREFIX, 'lineup page failed', { url: link.url, message: error?.message });
      continue;
    }

    const heatSections = extractHeatSheetSections(lineupHtml, link);
    if (debug) {
      console.log(DEBUG_PREFIX, 'heat sheet sections parsed', {
        roundLabel: link.roundLabel,
        linkRaceNumber: link.raceNumber,
        sections: heatSections.map((section) => ({
          raceNumber: section.raceNumber,
          className: section.className,
          roundLabel: section.roundLabel,
          sample: section.text.slice(0, 160),
        })),
      });
    }

    let matchedAnyHeatSection = false;
    for (const target of targets) {
      if (!target.vehicleId) continue;
      const matchedSection = heatSections.find((section) => sectionMatchesTarget(section, target));
      if (!matchedSection?.raceNumber) continue;

      matchedAnyHeatSection = true;
      const lineup = {
        vehicleId: target.vehicleId,
        tx: target.tx,
        driver: target.driver || target.fullName || '',
        className: target.className || matchedSection.className || link.className || '',
        raceNumber: matchedSection.raceNumber,
        raceLabel: `Race ${matchedSection.raceNumber}`,
        roundLabel: matchedSection.roundLabel || link.roundLabel,
        roundType: matchedSection.roundType || link.roundType,
        roundNum: matchedSection.roundNum || link.roundNum,
        lineupUrl: link.url,
        source: 'Race Lineups & Entry List',
        updatedAt: new Date().toISOString(),
      };

      if (debug) console.log(DEBUG_PREFIX, 'matched pre-race lineup', { vehicleId: target.vehicleId, tx: target.tx, raceNumber: lineup.raceNumber, roundLabel: lineup.roundLabel, className: lineup.className });
      byVehicle.set(target.vehicleId, buildBestLineup(byVehicle.get(target.vehicleId), lineup));
    }

    // Older LiveRC pages can still expose standard table rows. Keep this as a fallback,
    // but do not depend on completed race results for the yellow pre-race badge.
    if (matchedAnyHeatSection) continue;

    const rows = parseLineupRowsFromHtml(lineupHtml);
    if (debug) console.log(DEBUG_PREFIX, 'lineup rows parsed fallback', { roundLabel: link.roundLabel, raceNumber: link.raceNumber, className: link.className, rows: rows.length });

    for (const target of targets) {
      if (!target.vehicleId) continue;
      const matchedRow = rows.find((row) => rowMatchesTarget(row, target, link));
      if (!matchedRow) continue;

      const lineup = {
        vehicleId: target.vehicleId,
        tx: target.tx,
        driver: matchedRow.driver || target.driver || target.fullName || '',
        className: target.className || link.className || matchedRow.className || '',
        raceNumber: link.raceNumber || matchedRow.raceNumber || '',
        raceLabel: link.raceNumber ? `Race ${link.raceNumber}` : link.raceLabel,
        roundLabel: link.roundLabel,
        roundType: link.roundType,
        roundNum: link.roundNum,
        lineupUrl: link.url,
        source: 'Race Lineups & Entry List',
        updatedAt: new Date().toISOString(),
      };

      if (!lineup.raceNumber) continue;
      byVehicle.set(target.vehicleId, buildBestLineup(byVehicle.get(target.vehicleId), lineup));
    }
  }

  return Array.from(byVehicle.values());
}

export function getBestLineupForVehicle(lineups = [], vehicle = {}, entryMatch = {}) {
  const target = getTargetInfo(vehicle, entryMatch);
  const matches = (lineups || []).filter((lineup) => String(lineup.vehicleId || '') === target.vehicleId);
  return matches.sort(compareRoundPriority)[0] || null;
}
