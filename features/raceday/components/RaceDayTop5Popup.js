import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import RaceDayPopup from './RaceDayPopup';
import { raceDayStyles } from '../styles/raceDayStyles';
import { buildQualifierTop5ForRun } from '../lib/liverc/liveRcTop5Parser';
import { buildMainTop5ForRun } from '../lib/liverc/liveRcMainTop5Parser';

const RACEDAY_GREEN = '#22c55e';
const TOP5_POPUP_DEBUG_PREFIX = '[IMRC RaceDay Top5 Popup]';
const IDENTITY_COL_WIDTH = 132;
const STAT_COL_WIDTH = 102;
const STAT_GAP = 7;
const TOP5_STAT_COUNT = 10;
const SHARED_CONTENT_WIDTH = IDENTITY_COL_WIDTH + (TOP5_STAT_COUNT * STAT_COL_WIDTH) + ((TOP5_STAT_COUNT + 1) * STAT_GAP) + 22;

function top5PopupDebug(step = '', data = {}) {
  try {
    console.log(TOP5_POPUP_DEBUG_PREFIX, step, data);
  } catch (error) {
    console.log(TOP5_POPUP_DEBUG_PREFIX, step);
  }
}

function clean(value) {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function formatRaceSeconds(seconds) {
  const totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const wholeSeconds = Math.floor(totalMs / 1000);
  const ms = totalMs % 1000;
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const sec = wholeSeconds % 60;
  const msText = String(ms).padStart(3, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${msText}`;
  return `${minutes}:${String(sec).padStart(2, '0')}.${msText}`;
}

function formatRaceTimeValue(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/\d+:(?:\d{2}:)?\d{2}\.\d{1,3}/.test(text)) return text.match(/\d+:(?:\d{2}:)?\d{2}\.\d{1,3}/)?.[0] || text;
  const raw = Number.parseFloat(text.match(/\d+(?:\.\d{1,3})?/)?.[0] || '');
  if (!Number.isFinite(raw)) return '';
  if (raw > 90000 && raw < 100000) return formatRaceSeconds(100000 - raw);
  if (raw >= 60) return formatRaceSeconds(raw);
  return raw.toFixed(3);
}

function formatLapsTime(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/\b0*(\d+)\s*\/\s*([0-9:]+(?:\.\d{1,3})?)\b/);
  if (!match) return text;
  const laps = Number.parseInt(match[1], 10);
  const time = formatRaceTimeValue(match[2]);
  return Number.isFinite(laps) && time ? `${laps}/${time}` : text;
}

function displayPosition(row = {}) {
  return row.displayPosition || row.rankingPosition || row.position || '—';
}

function numericPosition(row = {}) {
  const raw = displayPosition(row);
  const match = String(raw ?? '').match(/\d+/);
  const position = Number.parseInt(match?.[0] || '', 10);
  return Number.isFinite(position) ? position : Number.MAX_SAFE_INTEGER;
}

function sortRowsByPosition(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, originalIndex) => ({ row, originalIndex }))
    .sort((a, b) => {
      const positionDifference = numericPosition(a.row) - numericPosition(b.row);
      if (positionDifference !== 0) return positionDifference;
      return a.originalIndex - b.originalIndex;
    })
    .map(({ row }) => row);
}

function verifyText(row = {}) {
  if (row.positionVerified) return 'Verified';
  if (row.rankingVerified && row.rankingPosition) return `Rank P${row.rankingPosition}`;
  return 'No rank check';
}

function isQualifierRound(value = '') {
  return /Qualifier\s+Round\s+\d+/i.test(String(value || ''));
}

function isMainRound(value = '') {
  const text = String(value || '');
  return /Main\s+Events?|A-?Main|B-?Main|C-?Main|Final\s+Results?|Main$/i.test(text) && !isQualifierRound(text);
}

function makeRowKey(row = {}, index = 0) {
  return `${displayPosition(row)}-${row.driver || row.driverName || 'driver'}-${row.raceUrl || row.raceNumber || index}`;
}

function buildStats(row = {}) {
  return [
    { key: 'lapsTime', label: 'Laps/Time', value: formatLapsTime(row.lapsTime || row.rankingLapsTime) },
    { key: 'fastestLap', label: 'Fast Lap', value: row.fastestLap },
    { key: 'avgLap', label: 'Avg Lap', value: row.avgLap },
    { key: 'top5Avg', label: 'Avg Top 5', value: row.top5Avg },
    { key: 'top10Avg', label: 'Avg Top 10', value: row.top10Avg },
    { key: 'top15Avg', label: 'Avg Top 15', value: row.top15Avg },
    { key: 'top2Consecutive', label: 'Top 2 Cons.', value: row.top2Consecutive || row.rankingTop2Consecutive },
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

function DriverTop5Card({ row = {} }) {
  const stats = useMemo(() => buildStats(row), [row]);
  const position = displayPosition(row);
  const driverName = clean(row.driver || row.driverName);

  return (
    <View style={[localStyles.driverCard, row.isMe ? localStyles.driverCardMe : null]}>
      <View style={localStyles.cardAccent} />
      <View style={localStyles.driverCardBody}>
        <View style={localStyles.identityCol}>
          <View style={localStyles.driverTitleLine}>
            <Text style={localStyles.positionBadgeText}>P{position}</Text>
            <Text style={[localStyles.driverName, row.isMe ? localStyles.meText : null]} numberOfLines={1}>
              {driverName}{row.isMe ? ' • ME' : ''}
            </Text>
          </View>
          <Text style={localStyles.verifyText} numberOfLines={1}>{verifyText(row)}</Text>
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

export default function RaceDayTop5Popup({ visible, run, onClose }) {
  const savedRows = useMemo(() => sortRowsByPosition(run?.top5), [run]);
  const [rows, setRows] = useState(savedRows);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [scrollX, setScrollX] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);

  const roundLabel = run?.roundLabel || 'Race';
  const className = run?.className || '';
  const shouldBuildQualifierTop5 = visible && run?.eventUrl && isQualifierRound(roundLabel);
  const shouldBuildMainTop5 = visible && run?.eventUrl && isMainRound(roundLabel);
  const shouldBuildTop5 = shouldBuildQualifierTop5 || shouldBuildMainTop5;

  useEffect(() => {
    let cancelled = false;
    setRows(savedRows);
    setMessage('');
    setScrollX(0);

    top5PopupDebug('open/change', {
      visible,
      shouldBuildQualifierTop5,
      shouldBuildMainTop5,
      savedRows: savedRows.length,
      runKeys: Object.keys(run || {}),
      roundLabel,
      className,
      eventUrl: run?.eventUrl || '',
      raceUrl: run?.raceUrl || '',
    });

    if (!shouldBuildTop5) {
      setLoading(false);
      top5PopupDebug('skip build', {
        visible,
        hasEventUrl: Boolean(run?.eventUrl),
        isQualifierRound: isQualifierRound(roundLabel),
        isMainRound: isMainRound(roundLabel),
      });
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    const builder = shouldBuildMainTop5 ? buildMainTop5ForRun : buildQualifierTop5ForRun;
    builder(run)
      .then((nextRows) => {
        if (cancelled) return;
        top5PopupDebug('build complete', {
          resultRows: Array.isArray(nextRows) ? nextRows.length : 0,
          fallbackRows: savedRows.length,
        });
        setRows(sortRowsByPosition(nextRows?.length ? nextRows : savedRows));
        setMessage(nextRows?.length ? '' : (shouldBuildMainTop5 ? 'No Final Results data found yet.' : 'No Qualifier Round ranking data found yet.'));
      })
      .catch((error) => {
        if (cancelled) return;
        top5PopupDebug('build error', { error: error?.message || String(error) });
        setRows(sortRowsByPosition(savedRows));
        setMessage(error?.message || (shouldBuildMainTop5 ? 'Could not build Main Top 5.' : 'Could not build Qualifier Round Top 5.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, run, savedRows, shouldBuildTop5, shouldBuildMainTop5]);

  return (
    <RaceDayPopup
      visible={visible}
      title="Top 5"
      subtitle={run ? `${roundLabel}${className ? ` • ${className}` : ''}` : 'No result selected'}
      onClose={onClose}
      centered
      showScrollIndicator
      bodyScroll={false}
      contentContainerStyle={[raceDayStyles.top5PopupContent, localStyles.popupContent]}
    >
      {loading ? (
        <View style={raceDayStyles.empty}>
          <Text style={raceDayStyles.emptyText}>{shouldBuildMainTop5 ? 'Building Main Top 5...' : 'Building Qualifier Round Top 5...'}</Text>
        </View>
      ) : rows.length ? (
        <View style={localStyles.shell}>
          <Text style={localStyles.scrollHint} numberOfLines={1}>Swipe left/right to compare all drivers</Text>
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
                <DriverTop5Card key={makeRowKey(row, index)} row={row} />
              ))}
            </View>
          </ScrollView>
          <GreenHorizontalScrollIndicator scrollX={scrollX} viewportWidth={viewportWidth} contentWidth={contentWidth} />
        </View>
      ) : (
        <View style={raceDayStyles.empty}>
          <Text style={raceDayStyles.emptyText}>{message || 'No Top 5 data found for this round yet.'}</Text>
        </View>
      )}
    </RaceDayPopup>
  );
}

const localStyles = StyleSheet.create({
  popupContent: {
    width: '100%',
    paddingTop: 12,
    paddingBottom: 6,
  },
  shell: {
    width: '100%',
  },
  scrollHint: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  sharedScrollContent: {
    width: SHARED_CONTENT_WIDTH,
    gap: 6,
    paddingRight: 4,
  },
  driverCard: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#223049',
    backgroundColor: '#101722',
  },
  driverCardMe: {
    borderColor: RACEDAY_GREEN,
    backgroundColor: 'rgba(34, 197, 94, 0.10)',
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: RACEDAY_GREEN,
  },
  driverCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: STAT_GAP,
    paddingLeft: 13,
    paddingRight: 8,
    paddingVertical: 7,
  },
  identityCol: {
    width: IDENTITY_COL_WIDTH,
    justifyContent: 'center',
    minHeight: 42,
  },
  driverTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  positionBadgeText: {
    minWidth: 24,
    color: RACEDAY_GREEN,
    fontSize: 12,
    fontWeight: '900',
  },
  driverName: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '900',
  },
  meText: {
    color: RACEDAY_GREEN,
  },
  verifyText: {
    color: '#94a3b8',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 3,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: STAT_GAP,
  },
  statChip: {
    width: STAT_COL_WIDTH,
    minHeight: 42,
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#24324b',
    backgroundColor: '#0b1220',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statLabel: {
    color: '#8190a8',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '900',
  },
  greenScrollTrack: {
    height: 5,
    borderRadius: 999,
    marginTop: 8,
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    overflow: 'hidden',
  },
  greenScrollThumb: {
    height: 5,
    borderRadius: 999,
    backgroundColor: RACEDAY_GREEN,
  },
});

export { RaceDayTop5Popup };
