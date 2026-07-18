import { normalizeLiveRcSiteUrl } from './liveRcUrls';

const DEFAULT_TIMEOUT_MS = 12000;

export async function fetchLiveRcText(url, options = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  let timer = null;
  if (controller) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'IMRC-Setup-Manager/2.0 RaceDay',
        ...(options.headers || {}),
      },
      signal: controller?.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`LiveRC request failed: ${response.status}`);
      error.status = response.status;
      error.url = url;
      error.bodyPreview = text.slice(0, 500);
      throw error;
    }
    return text;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function connectToLiveRc(siteUrl) {
  const normalized = normalizeLiveRcSiteUrl(siteUrl);
  if (!normalized) throw new Error('LiveRC URL is required.');
  const html = await fetchLiveRcText(normalized);
  return {
    siteUrl: normalized,
    ok: /LiveRC|view_event|results/i.test(html),
    html,
  };
}
