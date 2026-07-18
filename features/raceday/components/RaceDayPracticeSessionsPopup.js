import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import RaceDayPopup from './RaceDayPopup';
import { getVehicleDisplayName, normalizeId } from '../lib/raceDayModel';
import { getPracticeSessionsForVehicle } from '../lib/raceDayPracticeStorage';
import { raceDayColors, raceDayStyles } from '../styles/raceDayStyles';

function clean(value) {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function toLapNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const cleaned = String(value).replace(/[^0-9.:-]/g, '');
  if (!cleaned) return null;
  if (cleaned.includes(':')) {
    const [minRaw, secRaw] = cleaned.split(':');
    const minutes = Number(minRaw || 0);
    const seconds = Number(secRaw || 0);
    if (Number.isFinite(minutes) && Number.isFinite(seconds)) return minutes * 60 + seconds;
  }
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function compareLapValues(a, b) {
  const aNum = toLapNumber(a);
  const bNum = toLapNumber(b);
  if (aNum === null && bNum === null) return 0;
  if (aNum === null) return 1;
  if (bNum === null) return -1;
  return aNum - bNum;
}

function formatPracticeClock(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const timeMatch = raw.match(/(?:T|\b)(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b/i);
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = timeMatch[2];
    const suffix = String(timeMatch[3] || '').toUpperCase();

    if (suffix === 'PM' && hour < 12) hour += 12;
    if (suffix === 'AM' && hour === 12) hour = 0;

    const displayHour = hour % 12 || 12;
    const displaySuffix = hour >= 12 ? 'PM' : 'AM';
    return `${displayHour}:${minute} ${displaySuffix}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  return raw.replace(/^Practice\s*•\s*/i, '').replace(/^\d{4}-\d{2}-\d{2}\s+/i, '');
}

function formatPracticeSessionTitle(session = {}) {
  const clock =
    formatPracticeClock(session.timeText) ||
    formatPracticeClock(session.startedAt) ||
    formatPracticeClock(session.endedAt) ||
    formatPracticeClock(session.createdAt) ||
    formatPracticeClock(session.label);
  return clock ? `Practice • ${clock}` : 'Practice';
}

function SortButton({ active, label, onPress }) {
  return (
    <TouchableOpacity style={[styles.sortButton, active && styles.sortButtonActive]} onPress={onPress} activeOpacity={0.82}>
      <Text style={[styles.sortButtonText, active && styles.sortButtonTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.detailStatBox}>
      <Text style={styles.detailStatLabel}>{label}</Text>
      <Text style={styles.detailStatValue} numberOfLines={1}>{clean(value)}</Text>
    </View>
  );
}

function PracticeSessionRow({ session, expanded, onToggle }) {
  const title = formatPracticeSessionTitle(session);
  return (
    <TouchableOpacity style={styles.sessionCard} onPress={onToggle} activeOpacity={0.86}>
      <View style={styles.sessionHeaderRow}>
        <View style={raceDayStyles.flex1}>
          <Text style={styles.sessionTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.sessionSub} numberOfLines={1}>
            Fast {clean(session.fastLap)} • Avg {clean(session.avgLap)} • Laps {session.lapCount || 0}
          </Text>
        </View>
        <Text style={styles.expandText}>{expanded ? 'Hide' : 'View'}</Text>
      </View>

      {expanded ? (
        <View style={styles.detailWrap}>
          <View style={styles.detailGrid}>
            <Stat label="Fast Lap" value={session.fastLap} />
            <Stat label="Avg Lap" value={session.avgLap} />
            <Stat label="Top 5" value={session.top5Avg} />
            <Stat label="Top 10" value={session.top10Avg} />
            <Stat label="Top 15" value={session.top15Avg} />
            <Stat label="Std Dev" value={session.stdDeviation} />
            <Stat label="Consistency" value={session.consistency} />
            <Stat label="Total Time" value={session.totalTime} />
          </View>
          {session.notes ? <Text style={styles.notesText}>{session.notes}</Text> : null}
          {Array.isArray(session.laps) && session.laps.length ? (
            <View style={styles.lapBox}>
              {session.laps.slice(0, 50).map((lap, index) => (
                <View key={`${session.id}_${index}`} style={styles.lapRow}>
                  <Text style={styles.lapNum}>L{lap.lapNumber || lap.lap || index + 1}</Text>
                  <Text style={styles.lapTime}>{lap.lapTime || lap.time || lap.value || '—'}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default function RaceDayPracticeSessionsPopup({ visible, raceDay, vehicle, practiceDayKey, practiceDayLabel, onClose }) {
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sortMode, setSortMode] = useState('latest');
  const [expandedId, setExpandedId] = useState(null);

  const raceDayId = raceDay?.id || raceDay?.raceDayId;
  const vehicleId = normalizeId(vehicle?.id || vehicle?.vehicleId);
  const vehicleName = vehicle ? getVehicleDisplayName(vehicle) : 'Vehicle';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!visible || !raceDayId || !vehicleId) return;
      setLoading(true);
      try {
        const next = await getPracticeSessionsForVehicle(raceDayId, vehicleId, practiceDayKey);
        if (!cancelled) setSessions(next);
      } catch (error) {
        console.warn('[RaceDayPracticeSessionsPopup] Failed to load sessions', error);
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [visible, raceDayId, vehicleId, practiceDayKey]);

  const sortedSessions = useMemo(() => {
    const list = [...sessions];
    if (sortMode === 'bestLap') return list.sort((a, b) => compareLapValues(a.fastLap, b.fastLap));
    if (sortMode === 'bestTop5') return list.sort((a, b) => compareLapValues(a.top5Avg, b.top5Avg));
    return list.sort((a, b) => new Date(b.endedAt || b.startedAt || 0).getTime() - new Date(a.endedAt || a.startedAt || 0).getTime());
  }, [sessions, sortMode]);

  return (
    <RaceDayPopup
      visible={visible}
      title="Practice Sessions"
      subtitle={`${vehicleName} • ${practiceDayLabel || 'Practice'} • ${sessions.length} run${sessions.length === 1 ? '' : 's'}`}
      onClose={onClose}
      centered
      showScrollIndicator
      contentContainerStyle={styles.popupContent}
    >
      <View style={styles.sortRow}>
        <SortButton label="Latest" active={sortMode === 'latest'} onPress={() => setSortMode('latest')} />
        <SortButton label="Best Lap" active={sortMode === 'bestLap'} onPress={() => setSortMode('bestLap')} />
        <SortButton label="Best Top 5" active={sortMode === 'bestTop5'} onPress={() => setSortMode('bestTop5')} />
      </View>

      {loading ? (
        <View style={raceDayStyles.empty}><ActivityIndicator /></View>
      ) : sortedSessions.length ? (
        <View style={styles.listWrap}>
          {sortedSessions.map((session) => (
            <PracticeSessionRow
              key={session.id}
              session={session}
              expanded={expandedId === session.id}
              onToggle={() => setExpandedId(expandedId === session.id ? null : session.id)}
            />
          ))}
        </View>
      ) : (
        <View style={raceDayStyles.empty}>
          <Text style={raceDayStyles.emptyText}>No practice sessions saved for this vehicle yet.</Text>
        </View>
      )}
    </RaceDayPopup>
  );
}

export { RaceDayPracticeSessionsPopup };

const styles = StyleSheet.create({
  popupContent: {
    paddingTop: 10,
    paddingBottom: 8,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 8,
  },
  sortButton: {
    flex: 1,
    minHeight: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: raceDayColors.border,
    backgroundColor: raceDayColors.cardAlt,
    paddingHorizontal: 8,
  },
  sortButtonActive: {
    backgroundColor: raceDayColors.accentSoft,
    borderColor: raceDayColors.accent,
  },
  sortButtonText: {
    color: raceDayColors.muted,
    fontSize: 10,
    fontWeight: '900',
  },
  sortButtonTextActive: {
    color: raceDayColors.text,
  },
  listWrap: {
    gap: 6,
    paddingBottom: 4,
  },
  sessionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    backgroundColor: raceDayColors.card,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sessionTitle: {
    color: raceDayColors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  sessionSub: {
    color: raceDayColors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  expandText: {
    color: raceDayColors.accent,
    fontSize: 10,
    fontWeight: '900',
  },
  detailWrap: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(38,51,73,0.75)',
    paddingTop: 8,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  detailStatBox: {
    width: '48%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    backgroundColor: raceDayColors.cardAlt,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  detailStatLabel: {
    color: raceDayColors.faint,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailStatValue: {
    color: raceDayColors.text,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },
  notesText: {
    color: raceDayColors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  lapBox: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    backgroundColor: raceDayColors.cardAlt,
    overflow: 'hidden',
  },
  lapRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(38,51,73,0.45)',
  },
  lapNum: {
    color: raceDayColors.faint,
    fontSize: 10,
    fontWeight: '900',
  },
  lapTime: {
    color: raceDayColors.text,
    fontSize: 12,
    fontWeight: '900',
  },
});
