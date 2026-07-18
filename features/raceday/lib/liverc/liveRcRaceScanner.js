import { fetchLiveRcText } from './liveRcClient';
import { resolveLiveRcUrl } from './liveRcUrls';
import { getAnchors, getRows, stripTags } from './liveRcHtml';
import { classMatches } from './liveRcClassFinder';

const ROUND_LABEL_RE = /(Main\s+Events?|Qualifier\s+Round\s+\d+|Final\s+Results?|Practice\s+Round\s+\d+)/i;
const ROUND_LABEL_GLOBAL_RE = /(Main\s+Events?|Qualifier\s+Round\s+\d+|Final\s+Results?|Practice\s+Round\s+\d+)/gi;

function cleanSpaces(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeRoundLabel(value = '') {
  const text = cleanSpaces(stripTags(value));
  return text.match(ROUND_LABEL_RE)?.[0] || text || 'Race Results';
}

function getRaceResultsSection(eventHtml = '') {
  const index = String(eventHtml).search(/Race\s+Results/i);
  if (index < 0) return eventHtml;

  // Keep the Race Results area and ignore the event header / entry list area.
  // LiveRC pages usually put Main Events / Qualifier Round sections under this
  // heading. Keeping everything after Race Results is safer than cutting too
  // early because tracks can have several qualifier rounds.
  return eventHtml.slice(index);
}

function splitRaceResultsRounds(eventHtml = '') {
  const sectionHtml = getRaceResultsSection(eventHtml);
  const matches = [];
  let match;

  while ((match = ROUND_LABEL_GLOBAL_RE.exec(sectionHtml))) {
    matches.push({ label: normalizeRoundLabel(match[0]), index: match.index });
  }

  if (!matches.length) {
    return [{ label: 'Race Results', html: sectionHtml, index: 0 }];
  }

  return matches.map((item, index) => {
    const next = matches[index + 1];
    return {
      label: item.label,
      html: sectionHtml.slice(item.index, next ? next.index : sectionHtml.length),
      index: item.index,
    };
  });
}

function extractRaceNumber(text = '', href = '') {
  const source = `${text} ${href}`;
  return (
    source.match(/race\s*#?\s*:?\s*(\d+)/i)?.[1] ||
    source.match(/\brace\s+(\d+)\b/i)?.[1] ||
    ''
  );
}

function extractRoundLabel(html = '', fallback = '') {
  const pageText = stripTags(html);
  const labels = [
    pageText.match(/Qualifier\s+Round\s+\d+/i)?.[0],
    pageText.match(/Main\s+Events?/i)?.[0],
    pageText.match(/Final\s+Results?/i)?.[0],
    pageText.match(/Practice\s+Round\s+\d+/i)?.[0],
    String(fallback || '').match(ROUND_LABEL_RE)?.[0],
  ].filter(Boolean);
  return normalizeRoundLabel(labels[0] || fallback || 'Race Result');
}

function getResultType(label = '', text = '', href = '') {
  const value = `${label} ${text} ${href}`.toLowerCase();
  if (value.includes('final')) return 'final';
  if (value.includes('main')) return 'main';
  if (value.includes('qual')) return 'qualifier';
  if (value.includes('practice')) return 'practice';
  return 'race';
}

function isRaceResultHref(href = '') {
  // Normal RaceDay sync should only hydrate actual race result pages.
  // Overall ranking pages are reserved for Top 5 / ranking verification logic
  // and must not be saved as vehicle runs.
  return /p=view_race_result/i.test(href);
}

function looksLikeRaceResultRow(text = '', href = '') {
  return /race\s*#?\s*:?\s*\d+/i.test(text) || /p=view_race_result/i.test(href);
}

function pushRaceLink(links, seen, { anchor, eventUrl, className, contextText = '', roundLabel = '' }) {
  if (!isRaceResultHref(anchor.href)) return;

  const text = stripTags(anchor.text);
  const matchText = cleanSpaces(`${roundLabel} ${text} ${contextText}`);
  if (!looksLikeRaceResultRow(matchText, anchor.href)) return;
  if (className && !classMatches(matchText, className)) return;

  const url = resolveLiveRcUrl(eventUrl, anchor.href);
  if (!url || seen.has(url)) return;
  seen.add(url);

  const raceNumber = extractRaceNumber(matchText || text, anchor.href);
  const resultType = getResultType(roundLabel, matchText, anchor.href);

  links.push({
    raceUrl: url,
    linkText: matchText || text,
    raceNumber,
    className,
    roundLabel: normalizeRoundLabel(roundLabel || matchText),
    resultType,
  });
}

function parseRoundRaceLinks(round = {}, eventUrl = '', className = '', seen = new Set()) {
  const links = [];
  const roundLabel = normalizeRoundLabel(round.label || 'Race Results');

  // Preferred path: each LiveRC Race Results race is normally a table row under
  // Main Events / Qualifier Round X. The class may sit beside the link instead
  // of inside the anchor, so use the whole row as matching context.
  getRows(round.html).forEach((rowHtml) => {
    const contextText = stripTags(rowHtml);
    getAnchors(rowHtml).forEach((anchor) => {
      pushRaceLink(links, seen, { anchor, eventUrl, className, contextText, roundLabel });
    });
  });

  // Fallback for non-table LiveRC layouts.
  getAnchors(round.html).forEach((anchor) => {
    pushRaceLink(links, seen, { anchor, eventUrl, className, contextText: anchor.text, roundLabel });
  });

  return links;
}

export function parseRaceLinks(eventHtml = '', eventUrl = '', className = '') {
  const seen = new Set();
  const rounds = splitRaceResultsRounds(eventHtml);
  const links = [];

  rounds.forEach((round) => {
    links.push(...parseRoundRaceLinks(round, eventUrl, className, seen));
  });

  return links;
}

export async function scanRaceLinks(eventUrl, className, { debug } = {}) {
  debug?.add?.('raceScanner:fetchEvent', { eventUrl, className });
  const eventHtml = await fetchLiveRcText(eventUrl);
  const rounds = splitRaceResultsRounds(eventHtml).map((round) => ({
    label: normalizeRoundLabel(round.label),
    races: parseRoundRaceLinks(round, eventUrl, className, new Set()).length,
  }));
  const links = parseRaceLinks(eventHtml, eventUrl, className);

  debug?.add?.('raceScanner:rounds', {
    className,
    rounds,
    candidateCount: links.length,
  });

  const hydrated = [];
  for (const link of links) {
    try {
      const html = await fetchLiveRcText(link.raceUrl);
      const roundLabel = extractRoundLabel(html, link.roundLabel || link.linkText);
      hydrated.push({
        ...link,
        html,
        roundLabel,
        resultType: getResultType(roundLabel, link.linkText, link.raceUrl),
      });
    } catch (error) {
      debug?.add?.('raceScanner:raceFetchFailed', { raceUrl: link.raceUrl, message: error.message });
    }
  }

  debug?.add?.('raceScanner:matches', {
    className,
    count: hydrated.length,
    labels: hydrated.map((item) => item.roundLabel),
    raceNumbers: hydrated.map((item) => item.raceNumber).filter(Boolean),
  });
  return hydrated;
}
