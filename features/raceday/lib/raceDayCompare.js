import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_COMPARE_FIELDS, RACE_DAY_KEYS } from './raceDayModel';

// Keep this order matched to the Results popup from top to bottom.
// Dashboard blocks use this list so selected blocks display left-to-right
// in the same order they appear on the Results screen.
export const COMPARE_FIELD_OPTIONS = [
  { key: 'position', label: 'Pos' },
  { key: 'lapsTime', label: 'Laps/Time' },
  { key: 'fastestLap', label: 'Fast Lap' },
  { key: 'avgLap', label: 'Avg Lap' },
  { key: 'top5Avg', label: 'Top 5 Avg' },
  { key: 'top10Avg', label: 'Top 10 Avg' },
  { key: 'top15Avg', label: 'Top 15 Avg' },
  { key: 'top2Consecutive', label: 'Top 2 Cons.' },
  { key: 'top3Consecutive', label: 'Top 3 Cons.' },
  { key: 'stdDeviation', label: 'Std Dev' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'motorTemp', label: 'Motor Temp' },
];

const COMPARE_FIELD_ORDER = new Map(COMPARE_FIELD_OPTIONS.map((option, index) => [option.key, index]));

export function sortCompareFieldsForDashboard(fields = []) {
  return fields
    .filter(Boolean)
    .slice()
    .sort((a, b) => {
      const aIndex = COMPARE_FIELD_ORDER.has(a) ? COMPARE_FIELD_ORDER.get(a) : 999;
      const bIndex = COMPARE_FIELD_ORDER.has(b) ? COMPARE_FIELD_ORDER.get(b) : 999;
      return aIndex - bIndex;
    });
}

export async function getCompareFields() {
  try {
    const raw = await AsyncStorage.getItem(RACE_DAY_KEYS.COMPARE_FIELDS);
    const parsed = raw ? JSON.parse(raw) : DEFAULT_COMPARE_FIELDS;
    return Array.isArray(parsed) && parsed.length ? parsed.slice(0, 3) : DEFAULT_COMPARE_FIELDS;
  } catch {
    return DEFAULT_COMPARE_FIELDS;
  }
}

export async function saveCompareFields(fields = []) {
  const next = fields.filter(Boolean).slice(0, 3);
  await AsyncStorage.setItem(RACE_DAY_KEYS.COMPARE_FIELDS, JSON.stringify(next));
  return next;
}

export function getCompareLabel(key) {
  return COMPARE_FIELD_OPTIONS.find((option) => option.key === key)?.label || key;
}

export function getCompareValue(run = {}, key) {
  if (!run) return '—';
  const value = run[key] ?? run.stats?.[key] ?? run.result?.[key];
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

export function buildCompareRows(run, fields = DEFAULT_COMPARE_FIELDS) {
  return sortCompareFieldsForDashboard(fields).slice(0, 3).map((key) => ({
    key,
    label: getCompareLabel(key),
    value: getCompareValue(run, key),
  }));
}

export function toggleCompareField(fields = [], key) {
  if (fields.includes(key)) return fields.filter((field) => field !== key);
  if (fields.length >= 3) return [...fields.slice(1), key];
  return [...fields, key];
}
