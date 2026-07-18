// features/tools/ScaleCalculatorScreen.js
// Race scale / corner weight helper.
// Compact fit-to-screen layout.
// Internally stores weights in grams so unit switching does not lose precision.

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import {
  ToolButton,
  ToolCard,
  ToolScaffold,
  fmt,
  goBack,
} from './ToolShared';
import styles from './ScaleCalculatorScreen.styles';

const STORAGE_KEY = '@imrcToolsRaceScale_v1';
const OZ_TO_G = 28.349523125;

const DEFAULTS = {
  lf: '',
  rf: '',
  lr: '',
  rr: '',
  targetCross: '50',
  targetTotal: '',
  unit: 'g',

  // Canonical values. These are always grams.
  lfG: '',
  rfG: '',
  lrG: '',
  rrG: '',
  targetTotalG: '',
};

function num(value) {
  const n = Number(String(value ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function percent(value, total) {
  return total > 0 ? (value / total) * 100 : 0;
}

function signed(value, places = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${fmt(n, places)}`;
}

function unitLabel(unit) {
  return unit === 'g' ? 'g' : 'oz';
}

function otherUnit(unit) {
  return unit === 'g' ? 'oz' : 'g';
}

function gramsFromInput(value, unit) {
  const n = num(value);
  if (!n) return '';
  return String(unit === 'g' ? n : n * OZ_TO_G);
}

function displayNumber(value, places = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (Math.abs(n - Math.round(n)) < 0.000001) return String(Math.round(n));
  return fmt(n, places);
}

function displayInputFromGrams(valueGrams, unit) {
  const g = num(valueGrams);
  if (!g) return '';
  if (unit === 'g') return displayNumber(g, 1);
  return fmt(g / OZ_TO_G, 2);
}

function displayWeightFromGrams(valueGrams, unit, places = null) {
  const g = Number(valueGrams);
  if (!Number.isFinite(g) || g <= 0) return '—';
  if (unit === 'g') return displayNumber(g, places ?? 1);
  return fmt(g / OZ_TO_G, places ?? 2);
}

function convertDisplayFromGrams(valueGrams, unit) {
  const g = Number(valueGrams);
  if (!Number.isFinite(g) || g <= 0) return '—';
  if (unit === 'g') return `${fmt(g / OZ_TO_G, 2)} oz`;
  return `${displayNumber(g, 1)} g`;
}

function signedWeightFromGrams(valueGrams, unit) {
  const g = Number(valueGrams);
  if (!Number.isFinite(g)) return '—';
  if (unit === 'g') return `${signed(g, 1)} g`;
  return `${signed(g / OZ_TO_G, 2)} oz`;
}

function totalTargetDeltaLabel(totalGrams, targetTotalGrams, unit) {
  const total = Number(totalGrams);
  const target = Number(targetTotalGrams);
  if (!Number.isFinite(total) || !Number.isFinite(target) || target <= 0) return '';
  const delta = target - total;
  if (Math.abs(delta) < 0.000001) return 'On target';
  const amount = unit === 'g' ? `${fmt(Math.abs(delta), 1)} g` : `${fmt(Math.abs(delta) / OZ_TO_G, 2)} oz`;
  return delta > 0 ? `Need +${amount}` : `Over ${amount}`;
}

function percentText(value, hasWeights, places = 1) {
  return hasWeights ? `${fmt(value, places)}%` : '—';
}

function migrateCanonicalWeights(input) {
  const unit = input.unit || 'g';
  return {
    ...input,
    unit,
    lfG: input.lfG || gramsFromInput(input.lf, unit),
    rfG: input.rfG || gramsFromInput(input.rf, unit),
    lrG: input.lrG || gramsFromInput(input.lr, unit),
    rrG: input.rrG || gramsFromInput(input.rr, unit),
    targetTotalG: input.targetTotalG || gramsFromInput(input.targetTotal, unit),
  };
}

function calculateWeights(state) {
  const migrated = migrateCanonicalWeights(state);
  const lf = num(migrated.lfG);
  const rf = num(migrated.rfG);
  const lr = num(migrated.lrG);
  const rr = num(migrated.rrG);
  const total = lf + rf + lr + rr;
  const left = lf + lr;
  const right = rf + rr;
  const front = lf + rf;
  const rear = lr + rr;
  const cross = rf + lr;
  const targetCross = num(state.targetCross) || 50;
  const targetCrossWeight = total > 0 ? total * (targetCross / 100) : 0;

  return {
    lf,
    rf,
    lr,
    rr,
    total,
    left,
    right,
    front,
    rear,
    cross,
    crossPercent: percent(cross, total),
    leftPercent: percent(left, total),
    rightPercent: percent(right, total),
    frontPercent: percent(front, total),
    rearPercent: percent(rear, total),
    targetCross,
    crossDelta: total > 0 ? cross - targetCrossWeight : 0,
  };
}

function compactStyles(shortPhone, tinyPhone) {
  return {
    card: [styles.referenceCard, shortPhone && styles.referenceCardShort, tinyPhone && styles.referenceCardTiny],
    titleBand: [styles.titleBand, shortPhone && styles.titleBandShort, tinyPhone && styles.titleBandTiny],
    titleText: [styles.titleBandText, shortPhone && styles.titleBandTextShort, tinyPhone && styles.titleBandTextTiny],
    topRow: [styles.topRow, shortPhone && styles.rowShort, tinyPhone && styles.rowTiny],
    middleRow: [styles.middleRow, shortPhone && styles.middleRowShort, tinyPhone && styles.middleRowTiny],
    bottomRow: [styles.bottomRow, shortPhone && styles.rowShort, tinyPhone && styles.rowTiny],
    footerRow: [styles.footerRow, shortPhone && styles.footerRowShort, tinyPhone && styles.footerRowTiny],
    scalePad: [styles.scalePad, shortPhone && styles.scalePadShort, tinyPhone && styles.scalePadTiny],
    scaleLabel: [styles.scaleLabel, shortPhone && styles.scaleLabelShort, tinyPhone && styles.scaleLabelTiny],
    scaleConvert: [styles.scaleConvert, tinyPhone && styles.scaleConvertTiny],
    inputShell: [styles.inputShell, shortPhone && styles.inputShellShort, tinyPhone && styles.inputShellTiny],
    input: [styles.input, shortPhone && styles.inputShort, tinyPhone && styles.inputTiny],
    suffix: [styles.suffix, tinyPhone && styles.suffixTiny],
    metricLabel: [styles.metricLabel, shortPhone && styles.metricLabelShort, tinyPhone && styles.metricLabelTiny],
    metricValue: [styles.metricValue, shortPhone && styles.metricValueShort, tinyPhone && styles.metricValueTiny],
    metricValueLarge: [styles.metricValueLarge, shortPhone && styles.metricValueLargeShort, tinyPhone && styles.metricValueLargeTiny],
    metricSub: [styles.metricSub, shortPhone && styles.metricSubShort, tinyPhone && styles.metricSubTiny],
    centerStack: [styles.centerStack, shortPhone && styles.centerStackShort, tinyPhone && styles.centerStackTiny],
    carGlyph: [styles.carGlyph, shortPhone && styles.carGlyphShort, tinyPhone && styles.carGlyphTiny],
    carBody: [styles.carBody, shortPhone && styles.carBodyShort, tinyPhone && styles.carBodyTiny],
    carAxleTop: [styles.carAxle, styles.carAxleTop, shortPhone && styles.carAxleTopShort, tinyPhone && styles.carAxleTopTiny],
    carAxleBottom: [styles.carAxle, styles.carAxleBottom, shortPhone && styles.carAxleBottomShort, tinyPhone && styles.carAxleBottomTiny],
    showUnitButton: [styles.showUnitButton, shortPhone && styles.showUnitButtonShort, tinyPhone && styles.showUnitButtonTiny],
    showUnitText: [styles.showUnitButtonText, shortPhone && styles.showUnitButtonTextShort, tinyPhone && styles.showUnitButtonTextTiny],
    totalLabel: [styles.totalLabel, shortPhone && styles.totalLabelShort, tinyPhone && styles.totalLabelTiny],
    totalValue: [styles.totalValue, shortPhone && styles.totalValueShort, tinyPhone && styles.totalValueTiny],
    totalUnit: [styles.totalUnit, tinyPhone && styles.totalUnitTiny],
    totalConvert: [styles.totalConvert, tinyPhone && styles.totalConvertTiny],
    totalTargetDelta: [styles.totalTargetDelta, tinyPhone && styles.totalTargetDeltaTiny],
    targetRow: [styles.targetMiniRow, shortPhone && styles.targetMiniRowShort, tinyPhone && styles.targetMiniRowTiny],
    targetInputShell: [styles.targetInputShell, shortPhone && styles.targetInputShellShort, tinyPhone && styles.targetInputShellTiny],
    targetLabel: [styles.targetLabel, tinyPhone && styles.targetLabelTiny],
    clearButton: [styles.clearButton, shortPhone && styles.clearButtonShort, tinyPhone && styles.clearButtonTiny],
  };
}

function CompactInput({ value, onChangeText, suffix, inputStyles, shellStyles, suffixStyles }) {
  return (
    <View style={shellStyles}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        selectTextOnFocus
        style={inputStyles}
        placeholderTextColor="rgba(243,255,247,0.28)"
      />
      {!!suffix && <Text style={suffixStyles}>{suffix}</Text>}
    </View>
  );
}

function TargetInput({ label, value, onChangeText, suffix, ui }) {
  return (
    <View style={styles.targetMini}>
      <Text style={ui.targetLabel}>{label}</Text>
      <CompactInput
        value={value}
        onChangeText={onChangeText}
        suffix={suffix}
        shellStyles={ui.targetInputShell}
        inputStyles={ui.input}
        suffixStyles={ui.suffix}
      />
    </View>
  );
}

function MetricBlock({ label, value, sub, large = false, bad = false, ui }) {
  return (
    <View style={[styles.metricBlock, large && styles.metricBlockLarge]}>
      <Text style={ui.metricLabel}>{label}</Text>
      <Text style={[ui.metricValue, large && ui.metricValueLarge, bad && styles.metricValueBad]}>
        {value}
      </Text>
      <Text style={ui.metricSub} numberOfLines={1}>{sub || 'wt'}</Text>
    </View>
  );
}

function ScalePad({ label, valueGrams, unit, onChangeText, ui }) {
  return (
    <View style={ui.scalePad}>
      <Text style={ui.scaleLabel}>{label}</Text>
      <CompactInput
        value={displayInputFromGrams(valueGrams, unit)}
        onChangeText={onChangeText}
        suffix={unitLabel(unit)}
        shellStyles={ui.inputShell}
        inputStyles={ui.input}
        suffixStyles={ui.suffix}
      />
      <Text style={ui.scaleConvert} numberOfLines={1}>
        {num(valueGrams) > 0 ? convertDisplayFromGrams(num(valueGrams), unit) : `${otherUnit(unit)} auto`}
      </Text>
    </View>
  );
}

export default function ScaleCalculatorScreen(props) {
  const [state, setState] = useState(DEFAULTS);
  const { height } = useWindowDimensions();

  const shortPhone = height < 760;
  const tinyPhone = height < 690;
  const ui = compactStyles(shortPhone, tinyPhone);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        const parsed = JSON.parse(raw);
        setState((prev) => migrateCanonicalWeights({ ...prev, ...parsed, unit: parsed.unit || prev.unit || 'g' }));
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  const unit = state.unit || 'g';

  const setWeightField = (key, value) => {
    const gramsKey = `${key}G`;
    setState((prev) => ({
      ...prev,
      [key]: value,
      [gramsKey]: gramsFromInput(value, prev.unit || 'g'),
    }));
  };

  const setTargetTotal = (value) => {
    setState((prev) => ({
      ...prev,
      targetTotal: value,
      targetTotalG: gramsFromInput(value, prev.unit || 'g'),
    }));
  };

  const setUnit = (nextUnit) => {
    setState((prev) => {
      const currentUnit = prev.unit || 'g';
      if (currentUnit === nextUnit) return prev;
      const migrated = migrateCanonicalWeights(prev);
      return {
        ...migrated,
        unit: nextUnit,
        lf: displayInputFromGrams(migrated.lfG, nextUnit),
        rf: displayInputFromGrams(migrated.rfG, nextUnit),
        lr: displayInputFromGrams(migrated.lrG, nextUnit),
        rr: displayInputFromGrams(migrated.rrG, nextUnit),
        targetTotal: displayInputFromGrams(migrated.targetTotalG, nextUnit),
      };
    });
  };

  const w = useMemo(() => calculateWeights(state), [state]);
  const hasWeights = w.total > 0;
  const crossBad = hasWeights && Math.abs(w.crossPercent - w.targetCross) > 0.15;

  return (
    <ToolScaffold title="Corner Weights" onBack={() => goBack(props)} scroll={false}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scaleScroll}
          contentContainerStyle={[styles.fitContainer, tinyPhone && styles.fitContainerTiny]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
        >
          <ToolCard compact style={ui.card}>
          <View style={ui.topRow}>
            <ScalePad label="LF" valueGrams={state.lfG} unit={unit} onChangeText={(v) => setWeightField('lf', v)} ui={ui} />
            <MetricBlock
              label="Front"
              value={percentText(w.frontPercent, hasWeights)}
              sub={hasWeights ? displayWeightFromGrams(w.front, unit) : unitLabel(unit)}
              ui={ui}
            />
            <ScalePad label="RF" valueGrams={state.rfG} unit={unit} onChangeText={(v) => setWeightField('rf', v)} ui={ui} />
          </View>

          <View style={ui.middleRow}>
            <MetricBlock
              label="Left"
              value={percentText(w.leftPercent, hasWeights)}
              sub={hasWeights ? displayWeightFromGrams(w.left, unit) : unitLabel(unit)}
              ui={ui}
            />

            <View style={ui.centerStack}>
              <MetricBlock
                label="Cross"
                value={percentText(w.crossPercent, hasWeights)}
                sub={hasWeights ? `Cross Δ ${signedWeightFromGrams(w.crossDelta, unit)}` : unitLabel(unit)}
                large
                bad={crossBad}
                ui={ui}
              />
              <View style={ui.carGlyph}>
                <View style={ui.carBody} />
                <View style={ui.carAxleTop} />
                <View style={ui.carAxleBottom} />
              </View>
            </View>

            <MetricBlock
              label="Right"
              value={percentText(w.rightPercent, hasWeights)}
              sub={hasWeights ? displayWeightFromGrams(w.right, unit) : unitLabel(unit)}
              ui={ui}
            />
          </View>

          <View style={ui.bottomRow}>
            <ScalePad label="LR" valueGrams={state.lrG} unit={unit} onChangeText={(v) => setWeightField('lr', v)} ui={ui} />
            <MetricBlock
              label="Rear"
              value={percentText(w.rearPercent, hasWeights)}
              sub={hasWeights ? displayWeightFromGrams(w.rear, unit) : unitLabel(unit)}
              ui={ui}
            />
            <ScalePad label="RR" valueGrams={state.rrG} unit={unit} onChangeText={(v) => setWeightField('rr', v)} ui={ui} />
          </View>

          <View style={ui.footerRow}>
            <Pressable
              onPress={() => setUnit(unit === 'g' ? 'oz' : 'g')}
              style={({ pressed }) => [ui.showUnitButton, pressed && styles.pressed]}
            >
              <Text style={ui.showUnitText}>Show {otherUnit(unit)}</Text>
            </Pressable>

            <View style={styles.totalBlock}>
              <Text style={ui.totalLabel}>Total</Text>
              <Text style={ui.totalValue}>{hasWeights ? displayWeightFromGrams(w.total, unit, unit === 'g' ? 1 : 2) : '—'}</Text>
              <Text style={ui.totalUnit}>{unitLabel(unit)}</Text>
              <Text style={ui.totalConvert}>{hasWeights ? convertDisplayFromGrams(w.total, unit) : ''}</Text>
              {!!state.targetTotalG && (
                <Text style={ui.totalTargetDelta} numberOfLines={1}>
                  {hasWeights ? totalTargetDeltaLabel(w.total, state.targetTotalG, unit) : ''}
                </Text>
              )}
            </View>
          </View>

          <View style={ui.targetRow}>
            <TargetInput
              label="Target Cross"
              value={state.targetCross}
              onChangeText={(v) => setState((prev) => ({ ...prev, targetCross: v }))}
              suffix="%"
              ui={ui}
            />
            <TargetInput
              label="Target Total"
              value={displayInputFromGrams(state.targetTotalG, unit)}
              onChangeText={setTargetTotal}
              suffix={unitLabel(unit)}
              ui={ui}
            />
          </View>
        </ToolCard>

          <ToolButton label="Clear" secondary onPress={() => setState(DEFAULTS)} style={ui.clearButton} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ToolScaffold>
  );
}
