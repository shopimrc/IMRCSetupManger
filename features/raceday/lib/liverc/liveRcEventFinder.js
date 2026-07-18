import { fetchLiveRcText } from './liveRcClient';
import { getEventsUrl, resolveLiveRcUrl, normalizeLiveRcEventUrl } from './liveRcUrls';
import { getAnchors, getCells, getRows, stripTags } from './liveRcHtml';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function findDateMatch(text = '') {
  const value = String(text);
  return (
    value.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/) ||
    value.match(/\b\d{4}-\d{1,2}-\d{1,2}\b/) ||
    value.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}\b/i)
  );
}

function parseEventDate(dateText = '') {
  const raw = String(dateText).trim().replace(/\s+/g, ' ');
  const match = findDateMatch(raw);
  const value = match ? match[0] : raw;
  let month;
  let day;
  let year;

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) {
    const parts = value.split('-').map((part) => Number(part));
    year = parts[0];
    month = parts[1];
    day = parts[2];
  } else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(value)) {
    const parts = value.split(/[/-]/).map((part) => Number(part));
    month = parts[0];
    day = parts[1];
    year = parts[2];
    if (year < 100) year += 2000;
  } else {
    const parsed = new Date(value.replace(/^(Sept)\b/i, 'Sep'));
    if (Number.isNaN(parsed.getTime())) return null;
    month = parsed.getMonth() + 1;
    day = parsed.getDate();
    year = parsed.getFullYear();
  }

  if (!month || !day || !year) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { date, month, day, year };
}

export function formatEventDateLabel(text = '') {
  const match = findDateMatch(text);
  if (!match) return '';
  const parsed = parseEventDate(match[0]);
  if (!parsed) return match[0];

  const shortYear = String(parsed.year).slice(-2);
  return `${parsed.month}/${parsed.day}/${shortYear} - ${DAY_NAMES[parsed.date.getDay()]}`;
}

function isUsefulEventName(text = '') {
  const value = String(text).trim();
  if (!value) return false;
  if (/^(view|results|entry list|entries|signup|register|details|image)$/i.test(value)) return false;
  if (/^#?\s*(entries|drivers)$/i.test(value)) return false;
  return true;
}

function cleanEventTitle(text = '', fallbackId = '') {
  const value = stripTags(text)
    .replace(/\b(view|results|entry list|entries|signup|register|details)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Important: do NOT remove dates from the title here. On LiveRC, many tracks
  // use the race date as the actual Event Name. Removing the date caused the
  // parser to promote the # Entries / # Drivers columns into the title.
  if (isUsefulEventName(value)) return value;
  return fallbackId ? `LiveRC Event #${fallbackId}` : 'LiveRC Event';
}

function getBestTitleSource({ anchorText = '', cells = [], rowText = '', id = '' } = {}) {
  const anchorTitle = cleanEventTitle(anchorText, id);
  if (!/^LiveRC Event/i.test(anchorTitle)) return anchorTitle;

  const firstCell = cleanEventTitle(cells[0] || '', id);
  if (!/^LiveRC Event/i.test(firstCell)) return firstCell;

  // Last fallback: use row text, but strip the date and numeric-only tail so
  // # Entries / # Drivers do not become fake titles like "33 14".
  const noDate = stripTags(rowText)
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}(?:\s+\d{1,2}:\d{2}:\d{2})?\b/g, ' ')
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, ' ')
    .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}\b/gi, ' ')
    .replace(/(?:^|\s)\d+\s+\d+\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleanEventTitle(noDate, id);
}

function getBestDateSource({ cells = [], rowText = '', anchorText = '' } = {}) {
  // LiveRC /events/ rows are usually: Event Name | Date | # Entries | # Drivers.
  // Prefer a non-title cell for the event date so date-named events still work.
  const dateCell = cells.slice(1).find((cell) => findDateMatch(cell));
  if (dateCell) return dateCell;

  const anyCell = cells.find((cell) => findDateMatch(cell));
  if (anyCell) return anyCell;

  if (findDateMatch(rowText)) return rowText;
  if (findDateMatch(anchorText)) return anchorText;
  return '';
}

function pushEvent(events, seen, { href, text, contextText, rowHtml, siteUrl }) {
  if (!/p=view_event/i.test(href) || !/[?&]id=\d+/i.test(href)) return;

  const resolved = resolveLiveRcUrl(siteUrl, href);
  const url = normalizeLiveRcEventUrl(resolved, siteUrl);
  const id = url.match(/[?&]id=(\d+)/i)?.[1];
  if (!id || seen.has(id)) return;

  seen.add(id);
  const cells = rowHtml ? getCells(rowHtml) : [];
  const rowText = contextText || stripTags(rowHtml || '');
  const title = getBestTitleSource({ anchorText: text, cells, rowText, id });
  const dateSource = getBestDateSource({ cells, rowText, anchorText: text });

  events.push({
    id,
    title,
    eventUrl: url,
    dateLabel: formatEventDateLabel(dateSource),
  });
}

export function parseEventsFromHtml(html = '', siteUrl = '') {
  const seen = new Set();
  const events = [];

  // Prefer row/cell context from the LiveRC event table. The event title should
  // come from the event link / first cell. The date should come from the date
  // cell. Do not build a title from the whole row because that includes
  // # Entries and # Drivers.
  getRows(html).forEach((rowHtml) => {
    const rowText = stripTags(rowHtml);
    getAnchors(rowHtml).forEach((anchor) => {
      pushEvent(events, seen, {
        href: anchor.href,
        text: anchor.text,
        contextText: rowText,
        rowHtml,
        siteUrl,
      });
    });
  });

  // Fallback for event pages that do not wrap entries in table rows.
  if (!events.length) {
    getAnchors(html).forEach((anchor) => {
      pushEvent(events, seen, {
        href: anchor.href,
        text: anchor.text,
        contextText: anchor.text,
        rowHtml: '',
        siteUrl,
      });
    });
  }

  return events;
}

export async function findRecentEvents(siteUrl, { limit = 30, debug } = {}) {
  const eventsUrl = getEventsUrl(siteUrl);
  debug?.add?.('eventFinder:fetch', { eventsUrl });
  const html = await fetchLiveRcText(eventsUrl);
  const events = parseEventsFromHtml(html, eventsUrl).slice(0, limit);
  debug?.add?.('eventFinder:parsed', { count: events.length, events: events.map((event) => event.title) });
  return events;
}
