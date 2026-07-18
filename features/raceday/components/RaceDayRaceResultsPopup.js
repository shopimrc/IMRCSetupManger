import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import RaceDayPopup from './RaceDayPopup';
import { raceDayColors, raceDayStyles } from '../styles/raceDayStyles';
import { buildRaceResultsForRun } from '../lib/liverc/liveRcRaceResultsParser';

const IDENTITY_COL_WIDTH = 124;
const STAT_COL_WIDTH = 98;
const STAT_GAP = 7;
const STAT_COUNT = 10;
const CONTENT_WIDTH = IDENTITY_COL_WIDTH + (STAT_COUNT * STAT_COL_WIDTH) + ((STAT_COUNT + 1) * STAT_GAP) + 22;

function clean(value) {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function displayPosition(row = {}) {
  return row.displayPosition || row.racePosition || row.position || '—';
}

function makeRowKey(row = {}, index = 0) {
  return `${displayPosition(row)}-${row.driver || row.driverName || 'driver'}-${row.raceUrl || row.raceNumber || index}`;
}

function buildStats(row = {}) {
  return [
    { key: 'lapsTime', label: 'Laps/Time', value: row.lapsTime },
    { key: 'fastestLap', label: 'Fast Lap', value: row.fastestLap },
    { key: 'avgLap', label: 'Avg Lap', value: row.avgLap },
    { key: 'top5Avg', label: 'Avg Top 5', value: row.top5Avg },
    { key: 'top10Avg', label: 'Avg Top 10', value: row.top10Avg },
    { key: 'top15Avg', label: 'Avg Top 15', value: row.top15Avg },
    { key: 'top2Consecutive', label: 'Top 2 Cons.', value: row.top2Consecutive },
    { key: 'top3Consecutive', label: 'Top 3 Cons.', value: row.top3Consecutive },
    { key: 'stdDeviation', label: 'Std Dev', value: row.stdDeviation },
    { key: 'consistency', label: 'Consistency', value: row.consistency },
  ];
}

function StatChip({ label, value }) {
  return (
    <View style={localStyles.statChip}>
      <Text style={localStyles.statLabel} numberOfLines={1}>{label}</Text>
      <Text style={localStyles.statValue} numberOfLines={1}>{clean(value)}</Text>
    </View>
  );
}

function GreenHorizontalScrollIndicator({ scrollX, viewportWidth, contentWidth }) {
  const canScroll = contentWidth > viewportWidth + 4;
  if (!canScroll) return null;

  const trackWidth = Math.max(1, viewportWidth);
  const thumbWidth = Math.max(42, Math.min(trackWidth, (viewportWidth / contentWidth) * trackWidth));
  const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);
  const maxScroll = Math.max(1, contentWidth - viewportWidth);
  const thumbLeft = Math.min(maxThumbLeft, Math.max(0, (scrollX / maxScroll) * maxThumbLeft));

  return (
    <View style={localStyles.greenScrollTrack}>
      <View style={[localStyles.greenScrollThumb, { width: thumbWidth, transform: [{ translateX: thumbLeft }] }]} />
    </View>
  );
}

function DriverRaceResultCard({ row = {} }) {
  const stats = useMemo(() => buildStats(row), [row]);
  const position = displayPosition(row);
  const driverName = clean(row.driver || row.driverName);

  return (
    <View style={[localStyles.driverCard, row.isMe ? localStyles.driverCardMe : null]}>
      <View style={localStyles.cardAccent} />
      <View style={localStyles.driverCardBody}>
        <View style={localStyles.identityCol}>
          <View style={localStyles.driverTitleLine}>
            <Text style={localStyles.positionText}>P{position}</Text>
            <Text style={[localStyles.driverName, row.isMe ? localStyles.meText : null]} numberOfLines={1}>
              {driverName}{row.isMe ? ' • ME' : ''}
            </Text>
          </View>
          <Text style={localStyles.driverSub} numberOfLines={1}>
            {row.positionVerified ? 'Race order' : 'racerLaps'}
          </Text>
        </View>
        <View style={localStyles.statRow}>
          {stats.map((stat) => (
            <StatChip key={stat.key} label={stat.label} value={stat.value} />
          ))}
        </View>
      </View>
    </View>
  );
}

export default function RaceDayRaceResultsPopup({ visible, run, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [scrollX, setScrollX] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);

  const roundLabel = run?.roundLabel || 'Race';
  const raceNumber = run?.raceNumber ? `Race ${run.raceNumber}` : '';
  const className = run?.className || '';
  const subtitle = [roundLabel, raceNumber, className].filter(Boolean).join(' • ');

  useEffect(() => {
    let cancelled = false;
    setRows([]);
    setMessage('');
    setScrollX(0);

    if (!visible || !run?.raceUrl) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    buildRaceResultsForRun(run)
      .then((nextRows) => {
        if (cancelled) return;
        setRows(Array.isArray(nextRows) ? nextRows : []);
        setMessage(nextRows?.length ? '' : 'No racers found for this race yet.');
      })
      .catch((error) => {
        if (cancelled) return;
        setRows([]);
        setMessage(error?.message || 'Could not load race results.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, run]);

  return (
    <RaceDayPopup
      visible={visible}
      title="Race Results"
      subtitle={subtitle || 'Current race only'}
      onClose={onClose}
      centered
      showScrollIndicator
      bodyScroll={false}
      contentContainerStyle={localStyles.popupContent}
    >
      {loading ? (
        <View style={raceDayStyles.empty}>
          <Text style={raceDayStyles.emptyText}>Loading this race...</Text>
        </View>
      ) : rows.length ? (
        <View style={localStyles.shell}>
          <Text style={localStyles.scrollHint} numberOfLines={1}>Swipe left/right to compare this race</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            directionalLockEnabled={false}
            onScroll={(event) => setScrollX(event.nativeEvent.contentOffset.x)}
            scrollEventThrottle={16}
            onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
            onContentSizeChange={(width) => setContentWidth(width)}
          >
            <View style={localStyles.sharedScrollContent}>
              {rows.map((row, index) => (
                <DriverRaceResultCard key={makeRowKey(row, index)} row={row} />
              ))}
            </View>
          </ScrollView>
          <GreenHorizontalScrollIndicator scrollX={scrollX} viewportWidth={viewportWidth} contentWidth={contentWidth} />
        </View>
      ) : (
        <View style={raceDayStyles.empty}>
          <Text style={raceDayStyles.emptyText}>{message || 'No race result data found.'}</Text>
        </View>
      )}
    </RaceDayPopup>
  );
}

export { RaceDayRaceResultsPopup };

const localStyles = StyleSheet.create({
  popupContent: {
    paddingTop: 10,
    paddingBottom: 6,
  },
  shell: {
    width: '100%',
  },
  scrollHint: {
    color: raceDayColors.faint,
    fontSize: 9.5,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 7,
  },
  sharedScrollContent: {
    width: CONTENT_WIDTH,
    paddingRight: 8,
  },
  driverCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: raceDayColors.card,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    borderRadius: 13,
    minHeight: 50,
    marginBottom: 6,
  },
  driverCardMe: {
    borderColor: 'rgba(34,197,94,0.75)',
    backgroundColor: raceDayColors.accentSofter,
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: raceDayColors.accent,
  },
  driverCardBody: {
    minHeight: 50,
    paddingVertical: 7,
    paddingLeft: 10,
    paddingRight: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: STAT_GAP,
  },
  identityCol: {
    width: IDENTITY_COL_WIDTH,
    paddingLeft: 2,
  },
  driverTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  positionText: {
    color: raceDayColors.text,
    fontSize: 12,
    fontWeight: '900',
    minWidth: 24,
  },
  driverName: {
    flex: 1,
    color: raceDayColors.text,
    fontSize: 11.5,
    fontWeight: '900',
  },
  meText: {
    color: raceDayColors.accent,
  },
  driverSub: {
    color: raceDayColors.faint,
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: STAT_GAP,
  },
  statChip: {
    width: STAT_COL_WIDTH,
    minHeight: 36,
    backgroundColor: raceDayColors.cardAlt,
    borderWidth: 1,
    borderColor: 'rgba(39,49,67,0.72)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 5,
    justifyContent: 'center',
  },
  statLabel: {
    color: raceDayColors.faint,
    fontSize: 8.5,
    lineHeight: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statValue: {
    color: raceDayColors.text,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  greenScrollTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.16)',
    marginTop: 7,
    overflow: 'hidden',
  },
  greenScrollThumb: {
    height: 4,
    borderRadius: 999,
    backgroundColor: raceDayColors.accent,
  },
});
