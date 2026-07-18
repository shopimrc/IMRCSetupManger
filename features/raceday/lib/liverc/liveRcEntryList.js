import { fetchLiveRcText } from './liveRcClient';
import { getEntryListUrl, resolveLiveRcUrl } from './liveRcUrls';
import { getAnchors, getRows, getTables, getCells, stripTags } from './liveRcHtml';

export function findEntryListUrlInEventHtml(eventHtml = '', eventUrl = '') {
  const entryAnchor = getAnchors(eventHtml).find((anchor) => /p=view_entry_list/i.test(anchor.href));
  if (entryAnchor) return resolveLiveRcUrl(eventUrl, entryAnchor.href);
  return getEntryListUrl(eventUrl);
}

export async function fetchEntryListHtml(eventUrl, { debug } = {}) {
  const guessedUrl = getEntryListUrl(eventUrl);
  debug?.add?.('entryList:fetch', { entryListUrl: guessedUrl });
  try {
    return {
      entryListUrl: guessedUrl,
      html: await fetchLiveRcText(guessedUrl),
    };
  } catch (error) {
    debug?.add?.('entryList:guessFailed', { message: error.message });
    const eventHtml = await fetchLiveRcText(eventUrl);
    const foundUrl = findEntryListUrlInEventHtml(eventHtml, eventUrl);
    return {
      entryListUrl: foundUrl,
      html: await fetchLiveRcText(foundUrl),
    };
  }
}

export function parseEntryTables(html = '') {
  return getTables(html).map((tableHtml, tableIndex) => {
    const rows = getRows(tableHtml).map((rowHtml, rowIndex) => ({
      rowHtml,
      rowIndex,
      cells: getCells(rowHtml),
      text: stripTags(rowHtml),
    }));
    return {
      tableIndex,
      tableHtml,
      rows,
      text: stripTags(tableHtml),
    };
  });
}
