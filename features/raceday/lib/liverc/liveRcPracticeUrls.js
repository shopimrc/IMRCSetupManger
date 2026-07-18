const LIVERC_HOST_HINT = 'liverc.com';

function cleanUrl(value = '') {
  return String(value || '').trim();
}

function stripTrailingSlash(value = '') {
  return String(value || '').replace(/\/+$/, '');
}

export function normalizeMonthKey(value = '') {
  const match = String(value || '').match(/^(20\d{2})-(\d{1,2})$/);
  if (!match) return '';
  return `${match[1]}-${String(match[2]).padStart(2, '0')}`;
}

export function normalizePracticeDayKey(value = '') {
  const raw = String(value || '').trim();
  let match = raw.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;

  match = raw.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;

  match = raw.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (match) {
    const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
    if (Number.isFinite(year)) return `${year}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
  }

  return '';
}

export function normalizeLiveRcPracticeSiteUrl(value = '') {
  let url = cleanUrl(value);
  if (!url) return '';

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  url = url.replace(/^http:\/\//i, 'https://');

  try {
    const parsed = new URL(url);
    const host = parsed.host;
    if (!host) return '';
    return `https://${host}`;
  } catch (error) {
    const hostOnly = url.replace(/^https:\/\//i, '').split('/')[0];
    if (!hostOnly || !hostOnly.includes('.')) return '';
    return `https://${hostOnly}`;
  }
}

export function getPracticeUrl(siteUrl = '') {
  const normalized = normalizeLiveRcPracticeSiteUrl(siteUrl);
  if (!normalized) return '';
  return `${stripTrailingSlash(normalized)}/practice/`;
}

export function getPracticeMonthCalendarUrl(siteUrl = '', monthKey = '') {
  const practiceUrl = getPracticeUrl(siteUrl);
  const normalizedMonth = normalizeMonthKey(monthKey);
  if (!practiceUrl) return '';
  if (!normalizedMonth) return practiceUrl;
  return `${practiceUrl}?p=calendar&d=${normalizedMonth}`;
}

export function getPracticeDaySessionListUrl(siteUrl = '', dayKey = '') {
  const practiceUrl = getPracticeUrl(siteUrl);
  const normalizedDay = normalizePracticeDayKey(dayKey);
  if (!practiceUrl) return '';
  if (!normalizedDay) return practiceUrl;
  return `${practiceUrl}?p=session_list&d=${normalizedDay}`;
}

// Backwards-compatible export name. LiveRC uses p=session_list for a specific
// practice day. p=calendar is only for month calendars.
export function getPracticeDayCalendarUrl(siteUrl = '', dayKey = '') {
  return getPracticeDaySessionListUrl(siteUrl, dayKey);
}

export function normalizePracticeUrl(url = '', siteUrl = '') {
  const raw = cleanUrl(url);
  const base = normalizeLiveRcPracticeSiteUrl(siteUrl);
  if (!raw && base) return getPracticeUrl(base);
  if (!raw) return '';

  let next = raw.replace(/^http:\/\//i, 'https://');

  if (next.startsWith('//')) {
    next = `https:${next}`;
  } else if (next.startsWith('/')) {
    next = `${base}${next}`;
  } else if (!/^https?:\/\//i.test(next)) {
    next = base ? `${base}/${next.replace(/^\/+/, '')}` : `https://${next}`;
  }

  try {
    const parsed = new URL(next);
    return parsed.toString();
  } catch (error) {
    return next;
  }
}

export function getPracticeDayUrl(day = {}, siteUrl = '') {
  const explicit = normalizePracticeUrl(day.practiceUrl || day.url || day.href || '', day.siteUrl || siteUrl);
  if (explicit && /[?&]d=20\d{2}-\d{1,2}-\d{1,2}/i.test(explicit)) return explicit;

  const dayKey = normalizePracticeDayKey(day.key || day.dateKey || day.dateLabel || day.label || explicit);
  if (dayKey) return getPracticeDaySessionListUrl(day.siteUrl || siteUrl || explicit, dayKey);
  return explicit || getPracticeUrl(day.siteUrl || siteUrl);
}

export function looksLikeLiveRcPracticeSite(value = '') {
  const normalized = normalizeLiveRcPracticeSiteUrl(value);
  return Boolean(normalized && normalized.includes(LIVERC_HOST_HINT));
}
