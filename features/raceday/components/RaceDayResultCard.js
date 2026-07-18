import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getCompareLabel, sortCompareFieldsForDashboard } from '../lib/raceDayCompare';
import { raceDayColors, raceDayStyles } from '../styles/raceDayStyles';
import RaceDayRaceResultsPopup from './RaceDayRaceResultsPopup';

function clean(value) {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function getRunValue(run = {}, key) {
  return clean(run[key] ?? run.stats?.[key] ?? run.result?.[key]);
}

function Stat({
  label,
  value,
  wide = false,
  compareKey,
  activeCompareFields = [],
  onToggleCompareField,
}) {
  const selectable = Boolean(compareKey && onToggleCompareField);
  const selected = selectable && activeCompareFields.includes(compareKey);
  const Box = selectable ? TouchableOpacity : View;

  return (
    <Box
      style={[
        raceDayStyles.resultStatBox,
        wide && raceDayStyles.resultStatBoxWide,
        selectable && raceDayStyles.resultStatBoxSelectable,
        selected && raceDayStyles.resultStatBoxSelected,
      ]}
      onPress={selectable ? () => onToggleCompareField(compareKey) : undefined}
      activeOpacity={selectable ? 0.84 : 1}
    >
      <View style={raceDayStyles.resultStatHeaderRow}>
        <Text style={raceDayStyles.statLabel} numberOfLines={1}>{label}</Text>
        {selected ? <Text style={raceDayStyles.resultShownBadge}>Shown</Text> : null}
      </View>
      <Text style={raceDayStyles.resultStatValue} numberOfLines={1}>{clean(value)}</Text>
    </Box>
  );
}

function SectionTitle({ children }) {
  return <Text style={raceDayStyles.resultSectionTitle}>{children}</Text>;
}

export default function RaceDayResultCard({ run, compareFields = [], onToggleCompareField, onOpenTop5 }) {
  const [raceResultsOpen, setRaceResultsOpen] = useState(false);

  if (!run) {
    return (
      <View style={raceDayStyles.empty}>
        <Text style={raceDayStyles.emptyText}>No synced race result yet.</Text>
      </View>
    );
  }

  const round = run.roundLabel || 'Race Result';
  const raceNumber = run.raceNumber ? `Race ${run.raceNumber}` : '';
  const resultType = run.resultType ? String(run.resultType).toUpperCase() : 'RACE';
  const selectedLabels = sortCompareFieldsForDashboard(compareFields).map(getCompareLabel).join(' • ');
  const hasRaceUrl = Boolean(run.raceUrl || run.resultUrl || run.url);

  return (
    <>
    <View style={raceDayStyles.resultDetailCard}>
      <View style={raceDayStyles.rowBetween}>
        <View style={raceDayStyles.flex1}>
          <Text style={raceDayStyles.cardTitle}>{round}</Text>
          <Text style={raceDayStyles.cardSub}>
            {[raceNumber, run.className, resultType].filter(Boolean).join(' • ')}
          </Text>
        </View>
        <View style={localStyles.resultActionRow}>
          <TouchableOpacity
            style={[raceDayStyles.resultTop5Button, localStyles.resultActionButton, !hasRaceUrl && localStyles.disabledButton]}
            onPress={() => setRaceResultsOpen(true)}
            disabled={!hasRaceUrl}
            activeOpacity={0.82}
          >
            <Text style={raceDayStyles.resultTop5ButtonText}>Race Results</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[raceDayStyles.resultTop5Button, localStyles.resultActionButton]}
            onPress={onOpenTop5 ? () => onOpenTop5(run) : undefined}
            disabled={!onOpenTop5}
            activeOpacity={0.82}
          >
            <Text style={raceDayStyles.resultTop5ButtonText}>View Top 5</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={raceDayStyles.dashboardBlockHintBox}>
        <Text style={raceDayStyles.dashboardBlockHintTitle}>Dashboard Blocks</Text>
        <Text style={raceDayStyles.dashboardBlockHintText} numberOfLines={2}>
          Tap any stat box to show it on the dashboard. Current: {selectedLabels || 'none'}
        </Text>
      </View>

      <SectionTitle>Race</SectionTitle>
      <View style={raceDayStyles.resultStatGrid}>
        <Stat label="Driver" value={run.driver || run.driverName || run.stats?.driverName} wide />
        <Stat label="Position" value={run.position} compareKey="position" activeCompareFields={compareFields} onToggleCompareField={onToggleCompareField} />
        <Stat label="Laps/Time" value={getRunValue(run, 'lapsTime')} compareKey="lapsTime" activeCompareFields={compareFields} onToggleCompareField={onToggleCompareField} />
        <Stat label="Fast Lap" value={getRunValue(run, 'fastestLap')} compareKey="fastestLap" activeCompareFields={compareFields} onToggleCompareField={onToggleCompareField} />
        <Stat label="Avg Lap" value={getRunValue(run, 'avgLap')} compareKey="avgLap" activeCompareFields={compareFields} onToggleCompareField={onToggleCompareField} />
      </View>

      <SectionTitle>Averages</SectionTitle>
      <View style={raceDayStyles.resultStatGrid}>
        <Stat label="Avg Top 5" value={getRunValue(run, 'top5Avg')} compareKey="top5Avg" activeCompareFields={compareFields} onToggleCompareField={onToggleCompareField} />
        <Stat label="Avg Top 10" value={getRunValue(run, 'top10Avg')} compareKey="top10Avg" activeCompareFields={compareFields} onToggleCompareField={onToggleCompareField} />
        <Stat label="Avg Top 15" value={getRunValue(run, 'top15Avg')} compareKey="top15Avg" activeCompareFields={compareFields} onToggleCompareField={onToggleCompareField} />
      </View>

      <SectionTitle>Consecutive / Consistency</SectionTitle>
      <View style={raceDayStyles.resultStatGrid}>
        <Stat label="Top 2 Cons." value={getRunValue(run, 'top2Consecutive')} compareKey="top2Consecutive" activeCompareFields={compareFields} onToggleCompareField={onToggleCompareField} />
        <Stat label="Top 3 Cons." value={getRunValue(run, 'top3Consecutive')} compareKey="top3Consecutive" activeCompareFields={compareFields} onToggleCompareField={onToggleCompareField} />
        <Stat label="Std Dev" value={getRunValue(run, 'stdDeviation')} compareKey="stdDeviation" activeCompareFields={compareFields} onToggleCompareField={onToggleCompareField} />
        <Stat label="Consistency" value={getRunValue(run, 'consistency')} compareKey="consistency" activeCompareFields={compareFields} onToggleCompareField={onToggleCompareField} />
      </View>

      {Array.isArray(run.stats?.laps) && run.stats.laps.length ? (
        <>
          <SectionTitle>Laps</SectionTitle>
          <View style={raceDayStyles.lapListBox}>
            {run.stats.laps.slice(0, 80).map((lap, index) => (
              <View key={`${lap.lapNumber || index}_${lap.lapTime || ''}`} style={raceDayStyles.lapRow}>
                <Text style={raceDayStyles.lapNum}>L{lap.lapNumber || index + 1}</Text>
                <Text style={raceDayStyles.lapTime}>{lap.lapTime || '—'}</Text>
                <Text style={raceDayStyles.lapTotal}>{lap.totalTime || ''}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
    <RaceDayRaceResultsPopup visible={raceResultsOpen} run={run} onClose={() => setRaceResultsOpen(false)} />
    </>
  );
}

export { RaceDayResultCard };

const localStyles = StyleSheet.create({
  resultActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 7,
    marginLeft: 8,
  },
  resultActionButton: {
    minHeight: 31,
    paddingHorizontal: 10,
  },
  disabledButton: {
    opacity: 0.45,
    borderColor: raceDayColors.border,
    backgroundColor: raceDayColors.cardAlt,
  },
});
