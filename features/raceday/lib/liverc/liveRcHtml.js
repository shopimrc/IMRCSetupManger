export function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripTags(html = '') {
  return decodeHtml(String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

export function getAnchors(html = '') {
  const anchors = [];
  const re = /<a\b[^>]*href=["']?([^"' >]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    anchors.push({
      href: decodeHtml(match[1]),
      text: stripTags(match[2]),
      raw: match[0],
    });
  }
  return anchors;
}

export function getTables(html = '') {
  const tables = [];
  const re = /<table\b[\s\S]*?<\/table>/gi;
  let match;
  while ((match = re.exec(html))) tables.push(match[0]);
  return tables;
}

export function getRows(tableHtml = '') {
  const rows = [];
  const re = /<tr\b[\s\S]*?<\/tr>/gi;
  let match;
  while ((match = re.exec(tableHtml))) rows.push(match[0]);
  return rows;
}

export function getCells(rowHtml = '') {
  const cells = [];
  const re = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let match;
  while ((match = re.exec(rowHtml))) cells.push(stripTags(match[1]));
  return cells;
}

export function textKey(value = '') {
  return stripTags(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function parseHiddenName(rowHtml = '') {
  const hidden = rowHtml.match(/<span\b[^>]*class=["'][^"']*hidden[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  if (!hidden) return '';
  const text = stripTags(hidden);
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`.toUpperCase();
  return text.toUpperCase();
}

export function parseNumber(value = '') {
  const match = String(value).replace(',', '').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}
