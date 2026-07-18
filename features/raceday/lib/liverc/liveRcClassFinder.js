import { getRows, getCells, stripTags, textKey } from './liveRcHtml';

const BAD_CLASS_HEADERS = new Set([
  'registration',
  'entry list',
  'entries',
  'transponder',
  'driver',
  'name',
  'tx',
  'car',
  'round',
]);

export function cleanClassName(value = '') {
  return stripTags(value)
    .replace(/\bentries?\s*[:\-]?\s*\d+\b/gi, ' ')
    .replace(/\bdrivers?\s*[:\-]?\s*\d+\b/gi, ' ')
    .replace(/\bregistration\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+[•|\-–—]+\s*$/g, '')
    .trim();
}

export function isValidClassName(value = '') {
  const text = cleanClassName(value);
  if (!text) return false;
  const key = textKey(text);
  if (!key || BAD_CLASS_HEADERS.has(key)) return false;
  if (/^\d+$/.test(key)) return false;
  if (/^race\s*#?\s*\d+$/i.test(text)) return false;
  if (text.length < 2) return false;
  return true;
}

function getClassHeaderFromRow(rowHtml = '') {
  const classHeader = rowHtml.match(/class=["'][^"']*class_header[^"']*["'][^>]*>([\s\S]*?)<\/t[dh]>/i)?.[1];
  if (classHeader) return cleanClassName(classHeader);
  const cells = getCells(rowHtml);
  if (cells.length === 1 && isValidClassName(cells[0])) return cleanClassName(cells[0]);
  return '';
}

export function findClassForRowInTable(tableHtml = '', targetRowIndex = -1) {
  const rows = getRows(tableHtml);
  let currentClass = '';

  for (let index = 0; index < rows.length; index += 1) {
    const possibleClass = getClassHeaderFromRow(rows[index]);
    if (isValidClassName(possibleClass)) currentClass = cleanClassName(possibleClass);
    if (index === targetRowIndex && isValidClassName(currentClass)) return cleanClassName(currentClass);
  }

  const beforeTarget = rows.slice(0, Math.max(targetRowIndex, 0)).reverse();
  for (const row of beforeTarget) {
    const possibleClass = getClassHeaderFromRow(row);
    if (isValidClassName(possibleClass)) return cleanClassName(possibleClass);
  }
  return '';
}

export function classMatches(a = '', b = '') {
  const ak = textKey(cleanClassName(a));
  const bk = textKey(cleanClassName(b));
  if (!ak || !bk) return false;
  return ak === bk || ak.includes(bk) || bk.includes(ak);
}
