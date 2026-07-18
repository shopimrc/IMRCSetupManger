// features/tools/RolloutCalculatorScreen.js

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  InfoText,
  Segmented,
  ToolButton,
  ToolCard,
  ToolScaffold,
  ToolSectionTitle,
  TOOL_GREEN,
  TOOL_MUTED,
  TOOL_TEXT,
  fmt,
  goBack,
} from './ToolShared';
import {
  calculateRollout,
  chooseTargetGearCenter,
  diameterToMm,
  displayUnitLabel,
  formatInputFromMm,
  makeGearMatrix,
  mmToUnit,
  toNumber,
  valueToMm,
} from './lib/rolloutMath';

const STORAGE_KEY = '@imrcToolsRollout_v5_targetChart';

const DEFAULTS = {
  tireDiameter: '2.480',
  tireUnit: 'in',
  pinion: '25',
  spur: '84',
  internalRatio: '1',
  targetRollout: '',
};

function unitPlaces(unit) {
  return unit === 'mm' ? 2 : 3;
}

function targetToMm(targetRollout, tireUnit) {
  const target = toNumber(targetRollout);
  if (target <= 0) return 0;
  return valueToMm(target, tireUnit);
}

function rolloutForUnit(result, unit) {
  return unit === 'mm' ? result.rolloutMm : result.rolloutIn;
}

function deltaForUnit(row, unit) {
  return unit === 'mm' ? row.deltaMm : row.deltaIn;
}

function formatUnitValue(value, unit) {
  return `${fmt(value, unitPlaces(unit))} ${displayUnitLabel(unit)}`;
}

function sameGear(cell, pinion, spur) {
  return Math.round(toNumber(pinion)) === cell?.pinion && Math.round(toNumber(spur)) === cell?.spur;
}

function CompactInput({ label, value, onChangeText, suffix, placeholder }) {
  return (
    <View style={styles.compactInputWrap}>
      {!!label && <Text style={styles.compactLabel} numberOfLines={1}>{label}</Text>}
      <View style={styles.compactInputRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(244,255,248,0.30)"
          keyboardType="decimal-pad"
          autoCapitalize="none"
          style={styles.compactInput}
        />
        {!!suffix && <Text style={styles.compactSuffix} numberOfLines={1}>{suffix}</Text>}
      </View>
    </View>
  );
}

export default function RolloutCalculatorScreen(props) {
  const [state, setState] = useState(DEFAULTS);
  const [targetChartOpen, setTargetChartOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        const parsed = JSON.parse(raw);
        setState((prev) => ({ ...prev, ...parsed, tireUnit: parsed?.tireUnit === 'mm' ? 'mm' : 'in' }));
        if (parsed?.targetChartOpen) setTargetChartOpen(true);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, targetChartOpen })).catch(() => {});
  }, [state, targetChartOpen]);

  const setField = (key, value) => setState((prev) => ({ ...prev, [key]: value }));

  const changeUnit = (nextUnit) => {
    setState((prev) => {
      const currentUnit = prev.tireUnit === 'mm' ? 'mm' : 'in';
      if (nextUnit === currentUnit) return prev;

      const diameterMm = diameterToMm(prev.tireDiameter, currentUnit);
      const targetMm = targetToMm(prev.targetRollout, currentUnit);

      return {
        ...prev,
        tireUnit: nextUnit,
        tireDiameter: diameterMm > 0 ? formatInputFromMm(diameterMm, nextUnit) : '',
        targetRollout: targetMm > 0 ? formatInputFromMm(targetMm, nextUnit) : '',
      };
    });
  };

  const unit = state.tireUnit === 'mm' ? 'mm' : 'in';
  const unitLabel = displayUnitLabel(unit);
  const result = useMemo(() => calculateRollout(state), [state]);
  const targetMm = useMemo(() => targetToMm(state.targetRollout, unit), [state.targetRollout, unit]);
  const targetDisplay = targetMm > 0 ? mmToUnit(targetMm, unit) : 0;
  const hasBase = toNumber(state.tireDiameter) > 0 && toNumber(state.pinion) > 0 && toNumber(state.spur) > 0 && toNumber(state.internalRatio, 1) > 0;
  const hasTargetInputs = targetMm > 0 && toNumber(state.tireDiameter) > 0 && toNumber(state.internalRatio, 1) > 0 && (toNumber(state.spur) > 0 || toNumber(state.pinion) > 0);

  const targetCenter = useMemo(() => chooseTargetGearCenter({
    tireDiameter: state.tireDiameter,
    tireUnit: unit,
    internalRatio: state.internalRatio,
    currentPinion: state.pinion,
    currentSpur: state.spur,
    targetRolloutMm: targetMm,
  }), [state.tireDiameter, state.internalRatio, state.pinion, state.spur, targetMm, unit]);

  const chart = useMemo(() => {
    if (!targetChartOpen || !targetCenter.canBuild) return { spurs: [], rows: [], bestCell: null };
    return makeGearMatrix({
      tireDiameter: state.tireDiameter,
      tireUnit: unit,
      internalRatio: state.internalRatio,
      spur: targetCenter.centerSpur,
      centerPinion: targetCenter.centerPinion,
      pinionRadius: 3,
      spurRadius: 2,
      targetRolloutMm: targetMm,
    });
  }, [state.tireDiameter, state.internalRatio, targetCenter, targetChartOpen, targetMm, unit]);

  const currentRollout = rolloutForUnit(result, unit);
  const otherUnit = unit === 'in' ? 'mm' : 'in';
  const otherRollout = rolloutForUnit(result, otherUnit);
  const bestCell = chart.bestCell;
  const bestDelta = bestCell ? deltaForUnit(bestCell, unit) : 0;

  return (
    <ToolScaffold title="Rollout" subtitle="inches standard" onBack={() => goBack(props)}>
      <ToolCard compact>
        <ToolSectionTitle right={hasBase ? 'live' : 'enter setup'}>Results</ToolSectionTitle>
        <View style={styles.resultGrid}>
          <View style={[styles.resultBox, styles.mainResultBox]}>
            <Text style={styles.boxLabel}>Rollout</Text>
            <Text style={styles.boxValue}>{hasBase ? formatUnitValue(currentRollout, unit) : '—'}</Text>
            <Text style={styles.boxSub}>{hasBase ? formatUnitValue(otherRollout, otherUnit) : 'Enter tire + gears'}</Text>
          </View>
          <View style={styles.resultBox}>
            <Text style={styles.boxLabel}>FDR</Text>
            <Text style={styles.boxValue}>{hasBase ? fmt(result.finalDriveRatio, 3) : '—'}</Text>
            <Text style={styles.boxSub}>{hasBase ? `${fmt(result.gearRatio, 3)} gear` : ''}</Text>
          </View>
          <View style={styles.resultBox}>
            <Text style={styles.boxLabel}>Target</Text>
            <Text style={styles.boxValue}>{targetMm > 0 ? formatUnitValue(targetDisplay, unit) : '—'}</Text>
            <Text style={styles.boxSub}>{targetCenter.canBuild ? targetCenter.anchorLabel : 'Finder chart'}</Text>
          </View>
        </View>
      </ToolCard>

      <ToolCard compact>
        <ToolSectionTitle>Inputs</ToolSectionTitle>
        <Segmented
          value={unit}
          onChange={changeUnit}
          options={[
            { label: 'inch', value: 'in' },
            { label: 'mm', value: 'mm' },
          ]}
        />
        <View style={styles.row}>
          <View style={styles.col}><CompactInput label="Tire Dia" value={state.tireDiameter} onChangeText={(v) => setField('tireDiameter', v)} suffix={unitLabel} /></View>
          <View style={styles.col}><CompactInput label="Internal" value={state.internalRatio} onChangeText={(v) => setField('internalRatio', v)} suffix=":1" /></View>
        </View>
        <View style={styles.row}>
          <View style={styles.col}><CompactInput label="Pinion" value={state.pinion} onChangeText={(v) => setField('pinion', v)} suffix="T" /></View>
          <View style={styles.col}><CompactInput label="Spur" value={state.spur} onChangeText={(v) => setField('spur', v)} suffix="T" /></View>
        </View>
        <View style={styles.targetFinderRow}>
          <View style={styles.targetInputCol}>
            <CompactInput label="Target Rollout" value={state.targetRollout} onChangeText={(v) => setField('targetRollout', v)} suffix={unitLabel} placeholder={`ex: ${unit === 'in' ? '1.000' : '25.40'}`} />
          </View>
          <ToolButton
            label={targetChartOpen ? 'Refresh Chart' : 'Find Chart'}
            onPress={() => setTargetChartOpen(true)}
            disabled={!hasTargetInputs}
            style={styles.findChartButton}
          />
          {targetChartOpen && (
            <ToolButton
              label="Hide"
              secondary
              onPress={() => setTargetChartOpen(false)}
              style={styles.hideChartButton}
            />
          )}
        </View>
        {!hasTargetInputs && (
          <InfoText numberOfLines={2}>Enter tire diameter, internal ratio, target rollout, and at least the current spur or pinion. Spur is used first when both are entered.</InfoText>
        )}
      </ToolCard>

      {targetChartOpen && targetCenter.canBuild && !!chart.rows.length && (
        <ToolCard compact style={styles.chartCard}>
          <ToolSectionTitle right={targetCenter.anchorLabel}>Target Pinion / Spur Chart</ToolSectionTitle>
          <View style={styles.compactTargetRow}>
            <Text style={styles.compactTargetLabel}>Target</Text>
            <Text style={styles.compactTargetValue} numberOfLines={1}>
              {bestCell ? `${bestCell.pinion}T / ${bestCell.spur}T · ${formatUnitValue(rolloutForUnit(bestCell, unit), unit)} · Δ ${bestDelta >= 0 ? '+' : ''}${fmt(bestDelta, unitPlaces(unit))} ${unitLabel}` : `${targetCenter.centerPinion}T / ${targetCenter.centerSpur}T · closest gear is highlighted`}
            </Text>
          </View>
          <View style={styles.matrixHeader}>
            <Text style={styles.matrixPinionHeader}>P/S</Text>
            {chart.spurs.map((spur) => (
              <Text key={spur} style={styles.matrixHeadCell}>{spur}T</Text>
            ))}
          </View>
          {chart.rows.map((row) => {
            const currentPinion = Math.round(toNumber(state.pinion)) === row.pinion;
            return (
              <View key={row.pinion} style={[styles.matrixRow, currentPinion && styles.currentMatrixRow]}>
                <Text style={[styles.matrixPinion, currentPinion && styles.currentText]}>{row.pinion}T</Text>
                {row.cells.map((cell) => {
                  const currentCell = sameGear(cell, state.pinion, state.spur);
                  const targetCell = bestCell && cell.pinion === bestCell.pinion && cell.spur === bestCell.spur;
                  return (
                    <Text
                      key={`${cell.pinion}-${cell.spur}`}
                      style={[
                        styles.matrixCell,
                        currentCell && styles.currentCell,
                        targetCell && styles.targetCell,
                      ]}
                    >
                      {fmt(rolloutForUnit(cell, unit), unitPlaces(unit))}{targetCell ? '*' : ''}
                    </Text>
                  );
                })}
              </View>
            );
          })}
          <Text style={styles.chartNote}>* closest target rollout. Current car gear is softly highlighted when it is inside the chart.</Text>
        </ToolCard>
      )}

      <ToolButton label="Reset" secondary onPress={() => { setState(DEFAULTS); setTargetChartOpen(false); }} />
    </ToolScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 7, marginBottom: 1 },
  col: { flex: 1 },
  chartCard: { paddingHorizontal: 7, paddingVertical: 8 },
  resultGrid: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 0,
  },
  resultBox: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(38,217,109,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(38,217,109,0.20)',
    minHeight: 42,
  },
  mainResultBox: { flex: 1.18 },
  boxLabel: {
    color: TOOL_MUTED,
    fontWeight: '900',
    fontSize: 8,
    textTransform: 'uppercase',
  },
  boxValue: {
    color: TOOL_GREEN,
    fontWeight: '900',
    fontSize: 13,
    marginTop: 1,
  },
  boxSub: {
    color: TOOL_MUTED,
    fontWeight: '800',
    fontSize: 8,
    marginTop: 0,
  },
  targetFinderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: -1,
  },
  targetInputCol: { flex: 1 },
  findChartButton: {
    width: 112,
    minHeight: 32,
    borderRadius: 10,
  },
  hideChartButton: {
    width: 55,
    minHeight: 32,
    borderRadius: 10,
  },
  compactInputWrap: { marginBottom: 5 },
  compactLabel: {
    color: TOOL_MUTED,
    fontSize: 9,
    fontWeight: '900',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.22,
  },
  compactInputRow: {
    minHeight: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(244,255,248,0.13)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  compactInput: {
    flex: 1,
    color: TOOL_TEXT,
    fontWeight: '850',
    fontSize: 14,
    paddingVertical: 3,
  },
  compactSuffix: {
    color: TOOL_MUTED,
    fontWeight: '900',
    marginLeft: 5,
    fontSize: 11,
  },
  compactTargetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginBottom: 5,
    backgroundColor: 'rgba(38,217,109,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(38,217,109,0.16)',
  },
  compactTargetLabel: {
    color: TOOL_MUTED,
    fontWeight: '950',
    fontSize: 8,
    textTransform: 'uppercase',
  },
  compactTargetValue: {
    flex: 1,
    color: TOOL_GREEN,
    fontWeight: '950',
    fontSize: 11,
    textAlign: 'right',
  },
  matrixHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 34,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.045)',
  },
  currentMatrixRow: { backgroundColor: 'rgba(38,217,109,0.04)' },
  matrixPinionHeader: {
    width: 36,
    color: TOOL_MUTED,
    fontWeight: '950',
    fontSize: 12,
    textAlign: 'center',
  },
  matrixPinion: {
    width: 36,
    color: TOOL_GREEN,
    fontWeight: '950',
    fontSize: 13,
    textAlign: 'center',
  },
  matrixHeadCell: {
    flex: 1,
    color: TOOL_GREEN,
    fontWeight: '950',
    fontSize: 12,
    textAlign: 'center',
  },
  matrixCell: {
    flex: 1,
    color: TOOL_TEXT,
    fontWeight: '900',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 6,
  },
  currentCell: {
    color: TOOL_GREEN,
    fontWeight: '900',
    backgroundColor: 'rgba(38,217,109,0.10)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  targetCell: {
    color: '#061109',
    fontWeight: '950',
    backgroundColor: TOOL_GREEN,
    borderRadius: 6,
    overflow: 'hidden',
  },
  currentText: { color: TOOL_GREEN },
  chartNote: {
    color: TOOL_MUTED,
    fontWeight: '800',
    fontSize: 8,
    marginTop: 5,
    textAlign: 'center',
  },
});
