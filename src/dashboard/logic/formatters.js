// src/dashboard/logic/formatters.js
export function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function formatLastSync(ts) {
  if (!ts) return 'never';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function cleanLabel(s) {
  return String(s || '—').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function shortVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  const s = typeof v === 'string' ? v : String(v);
  return s.length > 80 ? s.slice(0, 77) + '…' : s;
}

export function sessionPrettyTime(ms) {
  const t = Number(ms || 0);
  if (!t) return '—';
  try { return new Date(t).toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return '—'; }
}
