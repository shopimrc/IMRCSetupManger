import {
  getPracticeDaySessionListUrl,
  getPracticeMonthCalendarUrl,
  getPracticeUrl,
  normalizeLiveRcPracticeSiteUrl,
  normalizePracticeUrl,
} from './liveRcPracticeUrls';

function decodeHtml(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value = '') {
  return decodeHtml(
    String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function getAttr(tag = '', attr = '') {
  const pattern = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i');
  return String(tag || '').match(pattern)?.[1] || '';
}

function twoDigitYearToFullYear(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n < 70 ? 2000 + n : 1900 + n;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function getPracticeDateKeyFromText(text = '') {
  const clean = decodeHtml(text);

  let match = clean.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (match) return `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`;

  match = clean.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (match) {
    const year = match[3].length === 2 ? twoDigitYearToFullYear(match[3]) : Number(match[3]);
    if (year) return `${year}-${pad2(match[1])}-${pad2(match[2])}`;
  }

  const monthNames = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };

  match = clean.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(20\d{2}|\d{2})\b/i);
  if (match) {
    const month = monthNames[match[1].toLowerCase().replace('.', '')];
    const year = match[3].length === 2 ? twoDigitYearToFullYear(match[3]) : Number(match[3]);
    if (month && year) return `${year}-${pad2(month)}-${pad2(match[2])}`;
  }

  return '';
}

export function formatPracticeDateLabel(keyOrText = '') {
  const key = getPracticeDateKeyFromText(keyOrText) || String(keyOrText || '').trim();
  const match = key.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return String(keyOrText || key || '').trim();

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return key;

  const shortYear = String(year).slice(-2);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
  return `${month}/${day}/${shortYear} - ${weekday}`;
}

function rowHasPracticeSignal(text = '', html = '') {
  const combined = `${text} ${html}`.toLowerCase();
  return combined.includes('practice') || /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(combined) || /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/.test(combined);
}

function buildPracticeDay({ text, href, siteUrl, index }) {
  const key = getPracticeDateKeyFromText(text) || getPracticeDateKeyFromText(href) || `practice-${index + 1}`;
  const dateLabel = formatPracticeDateLabel(key || text);
  const normalizedSite = normalizeLiveRcPracticeSiteUrl(siteUrl);
  const linkedUrl = normalizePracticeUrl(href, normalizedSite);
  const practiceUrl = linkedUrl || (key && /^20\d{2}-\d{2}-\d{2}$/.test(key)
    ? getPracticeDaySessionListUrl(normalizedSite, key)
    : getPracticeUrl(normalizedSite));

  const sessionMatch = String(text || '').match(/\b(\d+)\s*(?:runs?|sessions?|entries?|drivers?|laps?)\b/i);
  const sessionCount = sessionMatch ? Number(sessionMatch[1]) || 0 : 0;

  return {
    key,
    dateKey: key,
    label: dateLabel || stripTags(text) || `Practice ${index + 1}`,
    dateLabel: dateLabel || '',
    title: dateLabel || stripTags(text) || `Practice ${index + 1}`,
    practiceUrl,
    siteUrl: normalizedSite,
    sessionCount,
    totalLaps: 0,
    source: 'liverc-practice',
  };
}

function uniqueByKey(days = []) {
  const map = new Map();
  days.forEach((day) => {
    const key = day.key || day.practiceUrl || day.label;
    if (!key || map.has(key)) return;
    map.set(key, day);
  });
  return Array.from(map.values());
}

export function parsePracticeDaysFromHtml(html = '', siteUrl = '', { limit = 30 } = {}) {
  const days = [];

  const rowMatches = String(html || '').match(/<tr[\s\S]*?<\/tr>/gi) || [];
  rowMatches.forEach((row, index) => {
    const text = stripTags(row);
    if (!rowHasPracticeSignal(text, row)) return;
    const anchor = row.match(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/i)?.[0] || '';
    const href = getAttr(anchor, 'href') || getAttr(row, 'href') || '';
    const dateKey = getPracticeDateKeyFromText(text) || getPracticeDateKeyFromText(href);
    if (!dateKey && !href.toLowerCase().includes('practice')) return;
    days.push(buildPracticeDay({ text, href, siteUrl, index }));
  });

  if (!days.length) {
    const anchorMatches = String(html || '').match(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) || [];
    anchorMatches.forEach((anchor, index) => {
      const href = getAttr(anchor, 'href');
      const text = stripTags(anchor);
      const combined = `${text} ${href}`;
      if (!href || !String(href).toLowerCase().includes('practice')) return;
      const dateKey = getPracticeDateKeyFromText(combined);
      if (!dateKey && !rowHasPracticeSignal(combined, anchor)) return;
      days.push(buildPracticeDay({ text: combined, href, siteUrl, index }));
    });
  }

  if (!days.length) {
    const today = new Date();
    const key = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
    days.push({
      key,
      dateKey: key,
      label: formatPracticeDateLabel(key),
      dateLabel: formatPracticeDateLabel(key),
      title: formatPracticeDateLabel(key),
      practiceUrl: getPracticeDaySessionListUrl(siteUrl, key),
      siteUrl: normalizeLiveRcPracticeSiteUrl(siteUrl),
      sessionCount: 0,
      totalLaps: 0,
      source: 'today-fallback',
    });
  }

  return uniqueByKey(days).slice(0, limit);
}

export async function findPracticeDays(siteUrl = '', { limit = 30, monthKey = '' } = {}) {
  const normalized = normalizeLiveRcPracticeSiteUrl(siteUrl);
  if (!normalized) return [];

  const practiceUrl = monthKey ? getPracticeMonthCalendarUrl(normalized, monthKey) : getPracticeUrl(normalized);
  console.log('[IMRC RaceDay Practice] findPracticeDays URL', { practiceUrl, monthKey, siteUrl: normalized });
  const response = await fetch(practiceUrl, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`LiveRC practice page failed to load (${response.status}) at ${practiceUrl}`);
  }

  const html = await response.text();
  return parsePracticeDaysFromHtml(html, normalized, { limit });
}
