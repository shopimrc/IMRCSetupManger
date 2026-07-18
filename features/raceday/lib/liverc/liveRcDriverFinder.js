import { parseEntryTables } from './liveRcEntryList';
import { cleanClassName, findClassForRowInTable } from './liveRcClassFinder';
import { getCells, parseHiddenName, stripTags, textKey } from './liveRcHtml';

function cleanDriverNickname(value = '', fullName = '') {
  const cleanedFull = String(fullName || '').replace(/\s+/g, ' ').trim();
  const cleaned = String(value || '')
    .replace(/\b\d{5,}\b/g, ' ')
    .replace(/^\s*#?\d{1,3}\s+/, '')
    .replace(/^(driver|name|transponder|tx|car|position|pos)\s*[:#-]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  if (textKey(cleaned) === textKey(cleanedFull)) return '';
  return cleaned;
}

function extractDriverNickname(rowHtml = '', fullName = '') {
  const rowWithoutHidden = rowHtml.replace(/<span\b[^>]*class=["'][^"']*hidden[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, ' ');
  const cells = getCells(rowWithoutHidden);
  const joined = cells.join(' ').replace(/\s+/g, ' ').trim();
  const txFree = joined.replace(/\b\d{5,}\b/g, '').trim();
  const cleanedFull = String(fullName || '').replace(/\s+/g, ' ').trim();
  if (!txFree) return '';
  if (textKey(txFree) === textKey(cleanedFull)) return '';

  const parts = txFree.split(/\s{2,}|\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const candidate = parts.find((part) => textKey(part) !== textKey(cleanedFull)) || txFree;
  return cleanDriverNickname(candidate, cleanedFull);
}

function rowMatchesTransponder(rowText = '', transponder = '') {
  if (!transponder) return false;
  const pattern = new RegExp(`(^|\\D)${String(transponder).replace(/[^0-9]/g, '')}(\\D|$)`);
  return pattern.test(rowText.replace(/\s+/g, ' '));
}

function rowMatchesName(rowText = '', searchName = '') {
  if (!searchName) return false;
  return textKey(rowText).includes(textKey(searchName));
}

export function findDriverInEntryList(entryHtml = '', { transponder, fullName, nickname } = {}, { debug } = {}) {
  const tables = parseEntryTables(entryHtml);
  const tx = String(transponder || '').replace(/[^0-9]/g, '');
  debug?.add?.('driverFinder:start', { tx, fullName, nickname, tableCount: tables.length });

  for (const table of tables) {
    for (const row of table.rows) {
      const rowText = stripTags(row.rowHtml);
      const txMatch = rowMatchesTransponder(rowText, tx);
      const nameMatch = !tx && (rowMatchesName(rowText, nickname) || rowMatchesName(rowText, fullName));
      if (!txMatch && !nameMatch) continue;

      const detectedFullName = parseHiddenName(row.rowHtml) || String(fullName || '').toUpperCase();
      const detectedNickname = extractDriverNickname(row.rowHtml, detectedFullName) || cleanDriverNickname(nickname, detectedFullName) || detectedFullName;
      const detectedClass = cleanClassName(findClassForRowInTable(table.tableHtml, row.rowIndex));

      const result = {
        transponder: tx,
        fullName: detectedFullName,
        nickname: detectedNickname,
        displayName: detectedNickname || detectedFullName,
        className: detectedClass,
        tableIndex: table.tableIndex,
        rowIndex: row.rowIndex,
        rowText,
      };
      debug?.add?.('driverFinder:matched', result);
      return result;
    }
  }

  debug?.add?.('driverFinder:notFound', { tx, fullName, nickname });
  return null;
}
