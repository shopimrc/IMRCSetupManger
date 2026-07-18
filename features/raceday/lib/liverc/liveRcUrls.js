export function ensureProtocol(url = '') {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';

  // RaceDay LiveRC requests should always use HTTPS. If the user pasted
  // http:// or left the protocol off, force https:// before opening it.
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, 'https://');
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/\//, '')}`;
}

export function stripTrailingSlash(url = '') {
  return String(url || '').replace(/\/+$/, '');
}

export function getLiveRcOrigin(input = '') {
  const withProtocol = ensureProtocol(input);
  if (!withProtocol) return '';
  try {
    return new URL(withProtocol).origin;
  } catch {
    const host = withProtocol.replace(/^https?:\/\//i, '').split('/')[0];
    return host ? `https://${host}` : '';
  }
}

export function normalizeLiveRcSiteUrl(input = '') {
  const origin = getLiveRcOrigin(input);
  return origin ? `${origin}/results/` : '';
}

export function normalizeLiveRcEventsUrl(input = '') {
  const origin = getLiveRcOrigin(input);
  return origin ? `${origin}/events/` : '';
}

export function normalizeLiveRcEventUrl(input = '', fallbackSiteUrl = '') {
  const url = ensureProtocol(input);
  if (!url) return '';

  const id = String(url).match(/[?&]id=(\d+)/i)?.[1] || String(url).match(/event[^0-9]*(\d+)/i)?.[1];
  if (id) {
    const resultsUrl = normalizeLiveRcSiteUrl(fallbackSiteUrl || url);
    return `${resultsUrl}?p=view_event&id=${id}`;
  }

  return url;
}

export function getEventsUrl(siteUrl = '') {
  return normalizeLiveRcEventsUrl(siteUrl);
}

export function getEntryListUrl(eventUrl = '') {
  if (!eventUrl) return '';
  if (/p=view_entry_list/i.test(eventUrl)) return ensureProtocol(eventUrl);
  return ensureProtocol(eventUrl).replace(/p=view_event/i, 'p=view_entry_list');
}

export function resolveLiveRcUrl(baseUrl = '', href = '') {
  const cleanHref = String(href || '').replace(/&amp;/g, '&').trim();
  if (!cleanHref) return '';
  try {
    const resolved = new URL(cleanHref, ensureProtocol(baseUrl)).toString();
    return ensureProtocol(resolved);
  } catch {
    const base = normalizeLiveRcSiteUrl(baseUrl);
    return `${base}${cleanHref.replace(/^\//, '')}`;
  }
}

export function getHostLabel(url = '') {
  try {
    return new URL(ensureProtocol(url)).host.replace(/^www\./, '');
  } catch {
    return String(url || '').replace(/^https?:\/\//, '').split('/')[0];
  }
}

export function sameLiveRcEvent(a = '', b = '') {
  const aId = String(a).match(/[?&]id=(\d+)/)?.[1];
  const bId = String(b).match(/[?&]id=(\d+)/)?.[1];
  return Boolean(aId && bId && aId === bId);
}
