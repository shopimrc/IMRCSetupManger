// features/tools/CamberGaugeScreen.js
// Live phone camber gauge with guided auto calibration popup.
// Uses expo-sensors Accelerometer when the dev client is rebuilt with expo-sensors.

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  InfoText,
  Segmented,
  ToolButton,
  ToolCard,
  ToolScaffold,
  ToolSectionTitle,
  TOOL_CARD_2,
  TOOL_GREEN,
  TOOL_LINE,
  TOOL_MUTED,
  TOOL_RED,
  TOOL_TEXT,
  fmt,
  goBack,
} from './ToolShared';

const STORAGE_KEY = '@imrcToolsCamberLive_v4';

let cachedSensorsModule = undefined;

const DEFAULTS = {
  side: 'left',
  flipSign: false,
  flipTip: false,
  tipLimit: 3,
  flat: null,
  vertical: null,
  verticalSign: null,
  zeroCamber: null,
  zeroTip: null,
};

const AUTO_HOLD_MS = 2000;
const STABLE_DELTA_LIMIT = 0.032;

function getOptionalSensorsModule() {
  if (cachedSensorsModule !== undefined) return cachedSensorsModule;
  try {
    // Requires: npx expo install expo-sensors, then rebuild the dev app.
    // eslint-disable-next-line global-require
    cachedSensorsModule = require('expo-sensors');
  } catch (error) {
    cachedSensorsModule = null;
  }
  return cachedSensorsModule;
}

function deg(rad) {
  return (rad * 180) / Math.PI;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(value) {
  let output = Number(value) || 0;
  while (output > 180) output -= 360;
  while (output < -180) output += 360;
  return output;
}

function angleText(value) {
  const angle = Number(value);
  if (!Number.isFinite(angle)) return '—';
  return `${angle >= 0 ? '+' : ''}${fmt(angle, 2)}°`;
}

function cleanReading(reading) {
  if (!reading) return null;
  const x = Number(reading.x);
  const y = Number(reading.y);
  const z = Number(reading.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

function readingDelta(a, b) {
  if (!a || !b) return 999;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

function smoothReading(previous, next) {
  if (!previous) return cleanReading(next);
  const current = cleanReading(next);
  if (!current) return previous;

  const keep = 0.82;
  const add = 1 - keep;

  return {
    x: previous.x * keep + current.x * add,
    y: previous.y * keep + current.y * add,
    z: previous.z * keep + current.z * add,
  };
}

function rawAnglesFromReading(reading, verticalSign = null) {
  const sensor = cleanReading(reading);
  if (!sensor) {
    return {
      camber: 0,
      tip: 0,
      ySign: 1,
    };
  }

  const ySign = verticalSign || (sensor.y >= 0 ? 1 : -1);
  const y = sensor.y * ySign;

  return {
    camber: deg(Math.atan2(sensor.x, y)),
    tip: deg(Math.atan2(sensor.z, y)),
    ySign,
  };
}

function measuredAngles(reading, calibration) {
  if (!reading || !Number.isFinite(calibration?.zeroCamber) || !Number.isFinite(calibration?.zeroTip)) {
    return {
      ready: false,
      camber: 0,
      tip: 0,
      rawCamber: 0,
      rawTip: 0,
    };
  }

  const raw = rawAnglesFromReading(reading, calibration.verticalSign || 1);
  let camber = normalizeAngle(raw.camber - calibration.zeroCamber);
  let tip = normalizeAngle(raw.tip - calibration.zeroTip);

  // Opposite sides read opposite signs when the phone is held the same way.
  if (calibration.side === 'right') camber *= -1;
  if (calibration.flipSign) camber *= -1;
  if (calibration.flipTip) tip *= -1;

  return {
    ready: true,
    camber,
    tip,
    rawCamber: raw.camber,
    rawTip: raw.tip,
  };
}

function camberDirection(angle) {
  if (Math.abs(angle) < 0.04) return 'Zero / straight up';
  return angle < 0 ? 'Negative camber' : 'Positive camber';
}

function flatScore(reading) {
  const sensor = cleanReading(reading);
  if (!sensor) return 0;
  const levelXY = Math.sqrt(sensor.x * sensor.x + sensor.y * sensor.y);
  const zAbs = Math.abs(sensor.z);
  const levelScore = clamp(1 - levelXY / 0.23, 0, 1);
  const zScore = clamp((zAbs - 0.72) / 0.22, 0, 1);
  return Math.min(levelScore, zScore);
}

function verticalScore(reading) {
  const sensor = cleanReading(reading);
  if (!sensor) return 0;
  const yAbs = Math.abs(sensor.y);
  const xAbs = Math.abs(sensor.x);
  const zAbs = Math.abs(sensor.z);
  const yScore = clamp((yAbs - 0.72) / 0.22, 0, 1);
  const xScore = clamp(1 - xAbs / 0.18, 0, 1);
  const zScore = clamp(1 - zAbs / 0.25, 0, 1);
  return Math.min(yScore, xScore, zScore);
}

function orientationPercent(score, stableSince) {
  if (score < 0.9 || !stableSince) return 0;
  return clamp(((Date.now() - stableSince) / AUTO_HOLD_MS) * 100, 0, 100);
}

function stablePercent(stableSince) {
  if (!stableSince) return 0;
  return clamp(((Date.now() - stableSince) / AUTO_HOLD_MS) * 100, 0, 100);
}

function uprightPercent(reading) {
  const sensor = cleanReading(reading);
  if (!sensor) return 0;

  // During step 2, the user is tipping the phone up from the table.
  // Do not start the 2 second timer until gravity is mostly on the phone's Y axis,
  // meaning the phone is close to sitting upright on its bottom edge.
  const yAbs = Math.abs(sensor.y);
  const xAbs = Math.abs(sensor.x);
  const zAbs = Math.abs(sensor.z);

  const yScore = clamp((yAbs - 0.58) / 0.32, 0, 1);
  const sideLeanScore = clamp(1 - xAbs / 0.42, 0, 1);
  const forwardBackScore = clamp(1 - zAbs / 0.48, 0, 1);

  return Math.min(yScore, sideLeanScore, forwardBackScore);
}

function uprightInstruction(score, stableSince) {
  if (score < 0.45) return 'Tip phone up toward 90°';
  if (score < 0.82) return 'Almost upright';
  return stableSince ? 'Hold still...' : 'Phone upright - hold still';
}

function tipInstruction(tip, limit) {
  if (!Number.isFinite(tip)) return 'Hold phone steady';
  if (Math.abs(tip) <= limit) return 'F/B Tip OK';
  return tip > limit ? 'Tip Forward' : 'Tip Back';
}

function StepPill({ label, done, active }) {
  return (
    <View style={[styles.stepPill, active && styles.stepPillActive, done && styles.stepPillDone]}>
      <Text style={[styles.stepPillText, active && styles.stepPillTextActive, done && styles.stepPillTextDone]}>
        {done ? '✓' : active ? '•' : '○'} {label}
      </Text>
    </View>
  );
}

function ProgressBar({ percent, good }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, good && styles.progressFillGood, { width: `${clamp(percent, 0, 100)}%` }]} />
    </View>
  );
}

export default function CamberGaugeScreen(props) {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState(DEFAULTS);
  const [reading, setReading] = useState(null);
  const [sensorReady, setSensorReady] = useState(false);
  const [sensorError, setSensorError] = useState('');
  const [calibrationVisible, setCalibrationVisible] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState('flat');
  const [flatStableSince, setFlatStableSince] = useState(null);
  const [verticalStableSince, setVerticalStableSince] = useState(null);
  const [flatCalibratedMessage, setFlatCalibratedMessage] = useState(false);
  const [verticalCalibratedMessage, setVerticalCalibratedMessage] = useState(false);

  const lastReadingRef = useRef(null);
  const autoFlatDoneRef = useRef(false);
  const autoVerticalDoneRef = useRef(false);

  const hasFlat = !!settings.flat;
  const hasVertical = Number.isFinite(settings.zeroCamber) && Number.isFinite(settings.zeroTip);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        const parsed = JSON.parse(raw);
        setSettings((prev) => ({ ...prev, ...parsed }));
      })
      .catch(() => {});

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings]);

  useEffect(() => {
    const Sensors = getOptionalSensorsModule();
    const Accelerometer = Sensors?.Accelerometer;

    if (!Accelerometer?.addListener) {
      setSensorReady(false);
      setSensorError('Sensor module missing. Install expo-sensors and rebuild the dev app.');
      return undefined;
    }

    let subscription = null;
    let mounted = true;

    const start = async () => {
      try {
        if (Accelerometer.isAvailableAsync) {
          const available = await Accelerometer.isAvailableAsync();
          if (!available) {
            setSensorReady(false);
            setSensorError('Accelerometer is not available on this device.');
            return;
          }
        }

        Accelerometer.setUpdateInterval?.(70);

        subscription = Accelerometer.addListener((next) => {
          if (!mounted) return;
          setSensorReady(true);
          setSensorError('');
          setReading((prev) => smoothReading(prev, next));
        });
      } catch (error) {
        setSensorReady(false);
        setSensorError(`Sensor failed: ${error?.message || 'Rebuild dev app with expo-sensors.'}`);
      }
    };

    start();

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  const measurement = useMemo(() => measuredAngles(reading, settings), [reading, settings]);
  const tipLimit = Number(settings.tipLimit) > 0 ? Number(settings.tipLimit) : 3;
  const tipOk = measurement.ready && Math.abs(measurement.tip) <= tipLimit;
  const markerLeft = clamp(50 + measurement.camber * 8, 2, 98);
  const tipMarkerLeft = clamp(50 + measurement.tip * 8, 2, 98);
  const tipTargetLeft = clamp(50 - tipLimit * 8, 2, 50);
  const tipTargetWidth = clamp(tipLimit * 16, 8, 96);
  const flatProgress = stablePercent(flatStableSince);
  const uprightScore = uprightPercent(reading);
  const verticalProgress = stablePercent(verticalStableSince);
  const verticalPrompt = uprightInstruction(uprightScore, verticalStableSince);
  const tipPrompt = measurement.ready ? tipInstruction(measurement.tip, tipLimit) : 'Hold phone steady';

  const setFlatTable = () => {
    if (!reading) return;
    setSettings((prev) => ({
      ...prev,
      flat: cleanReading(reading),
    }));
    setFlatCalibratedMessage(true);
    autoFlatDoneRef.current = true;
    setFlatStableSince(null);
    setTimeout(() => {
      setFlatCalibratedMessage(false);
      setCalibrationStep('vertical');
      lastReadingRef.current = null;
    }, 650);
  };

  const setVerticalZero = () => {
    if (!reading) return;

    const raw = rawAnglesFromReading(reading);
    setSettings((prev) => ({
      ...prev,
      vertical: cleanReading(reading),
      verticalSign: raw.ySign,
      zeroCamber: raw.camber,
      zeroTip: raw.tip,
    }));
    setVerticalCalibratedMessage(true);
    autoVerticalDoneRef.current = true;
    setVerticalStableSince(null);
    setTimeout(() => {
      setVerticalCalibratedMessage(false);
      setCalibrationStep('ready');
    }, 650);
  };

  const startCalibration = () => {
    autoFlatDoneRef.current = false;
    autoVerticalDoneRef.current = false;
    lastReadingRef.current = null;
    setFlatStableSince(null);
    setVerticalStableSince(null);
    setFlatCalibratedMessage(false);
    setVerticalCalibratedMessage(false);
    setCalibrationStep(hasFlat && !hasVertical ? 'vertical' : 'flat');
    setCalibrationVisible(true);
  };

  const resetCalibration = () => {
    autoFlatDoneRef.current = false;
    autoVerticalDoneRef.current = false;
    lastReadingRef.current = null;
    setFlatStableSince(null);
    setVerticalStableSince(null);
    setFlatCalibratedMessage(false);
    setVerticalCalibratedMessage(false);
    setCalibrationStep('flat');
    setSettings((prev) => ({
      ...prev,
      flat: null,
      vertical: null,
      verticalSign: null,
      zeroCamber: null,
      zeroTip: null,
    }));
    setCalibrationVisible(true);
  };

  const tareZeroNow = () => {
    setVerticalZero();
  };

  useEffect(() => {
    if (!calibrationVisible || !sensorReady || !reading) return;

    const last = lastReadingRef.current;
    const isStable = readingDelta(last, reading) < 0.018;
    lastReadingRef.current = reading;

    if (calibrationStep === 'flat' && !autoFlatDoneRef.current) {
      if (isStable) {
        if (!flatStableSince) {
          setFlatStableSince(Date.now());
          return;
        }

        if (Date.now() - flatStableSince >= AUTO_HOLD_MS) {
          setFlatTable();
        }
      } else {
        setFlatStableSince(null);
      }
    }

    if (calibrationStep === 'vertical' && !autoVerticalDoneRef.current) {
      const isUpright = uprightScore >= 0.82;

      // Let the user tip the phone up first. The 2 second steady timer only starts
      // after the phone is close to upright / 90 degrees.
      if (isUpright && isStable) {
        if (!verticalStableSince) {
          setVerticalStableSince(Date.now());
          return;
        }

        if (Date.now() - verticalStableSince >= AUTO_HOLD_MS) {
          setVerticalZero();
        }
      } else {
        setVerticalStableSince(null);
      }
    }
  }, [
    calibrationVisible,
    calibrationStep,
    flatStableSince,
    reading,
    sensorReady,
    uprightScore,
    verticalStableSince,
  ]);

  const statusText = !sensorReady
    ? 'Waiting for sensor'
    : !hasFlat
      ? 'Set phone on table'
      : !hasVertical
        ? 'Tip top of phone up'
        : tipOk
          ? 'OK to read'
          : tipPrompt;

  return (
    <ToolScaffold title="Camber Gauge" subtitle="live phone sensor" onBack={() => goBack(props)}>
      <ToolCard compact style={styles.gaugeCard}>
        <View style={styles.stepRow}>
          <StepPill label="Flat" done={hasFlat} active={!hasFlat} />
          <StepPill label="90°" done={hasVertical} active={hasFlat && !hasVertical} />
          <StepPill label="Tip OK" done={tipOk} active={hasVertical && !tipOk} />
        </View>

        <Text style={styles.gaugeLabel}>{settings.side === 'left' ? 'Left Side' : 'Right Side'}</Text>
        <Text style={[styles.gaugeValue, !tipOk && measurement.ready && styles.gaugeValueWarn]}>
          {measurement.ready ? angleText(measurement.camber) : '—'}
        </Text>
        <Text style={styles.direction}>{measurement.ready ? camberDirection(measurement.camber) : statusText}</Text>

        <View style={styles.levelBar}>
          <View style={styles.centerLine} />
          <View style={[styles.levelMark, { left: `${markerLeft}%` }]} />
        </View>

        <View style={styles.tipRow}>
          <Text style={[styles.tipText, !tipOk && measurement.ready && styles.tipTextBad]}>
            F/B Tip {measurement.ready ? angleText(measurement.tip) : '—'}
          </Text>
          <Text style={[styles.tipStatus, tipOk && styles.tipStatusGood, !tipOk && measurement.ready && styles.tipStatusBad]}>
            {tipOk ? 'OK' : tipPrompt}
          </Text>
        </View>

        <View style={styles.tipBar}>
          <View style={[styles.tipTargetZone, { left: `${tipTargetLeft}%`, width: `${tipTargetWidth}%` }]} />
          <View style={styles.centerLine} />
          <View style={[styles.tipMark, !tipOk && measurement.ready && styles.tipMarkBad, { left: `${tipMarkerLeft}%` }]} />
        </View>
      </ToolCard>

      <ToolCard compact>
        <ToolSectionTitle>Setup</ToolSectionTitle>

        <View style={styles.row}>
          <View style={styles.col}>
            <Segmented
              value={settings.side}
              onChange={(side) => setSettings((prev) => ({ ...prev, side }))}
              options={[
                { label: 'Left', value: 'left' },
                { label: 'Right', value: 'right' },
              ]}
            />
          </View>
          <View style={styles.col}>
            <Segmented
              value={settings.flipSign ? 'flip' : 'normal'}
              onChange={(value) => setSettings((prev) => ({ ...prev, flipSign: value === 'flip' }))}
              options={[
                { label: 'Normal', value: 'normal' },
                { label: 'Flip', value: 'flip' },
              ]}
            />
          </View>
        </View>

        <View style={styles.buttonsRow}>
          <ToolButton label="Calibrate Phone" onPress={startCalibration} disabled={!sensorReady} style={styles.rowButton} />
          <ToolButton label="Tare / Set 0" secondary onPress={tareZeroNow} disabled={!sensorReady} style={styles.rowButton} />
        </View>

        <View style={styles.buttonsRow}>
          <ToolButton
            label={settings.flipTip ? 'Tip Direction Flipped' : 'Flip Tip Direction'}
            secondary
            onPress={() => setSettings((prev) => ({ ...prev, flipTip: !prev.flipTip }))}
            style={styles.rowButton}
          />
          <Pressable
            onPress={() => setSettings((prev) => ({ ...prev, tipLimit: prev.tipLimit === 3 ? 2 : 3 }))}
            style={({ pressed }) => [styles.tipLimitButton, pressed && styles.pressed]}
          >
            <Text style={styles.tipLimitText}>Tip Limit ±{tipLimit}°</Text>
          </Pressable>
        </View>

        <InfoText numberOfLines={3}>
          Calibrate on the setup table, stand the phone on the bottom edge, then place that same edge against the tire. Keep F/B Tip inside the green target zone.
        </InfoText>
      </ToolCard>

      {!!sensorError && (
        <ToolCard compact style={styles.warningCard}>
          <ToolSectionTitle>Sensor Build Needed</ToolSectionTitle>
          <Text style={styles.warningText}>{sensorError}</Text>
          <Text style={styles.commandText}>npx expo install expo-sensors</Text>
          <Text style={styles.commandText}>Build/install a new dev APK</Text>
        </ToolCard>
      )}

      <ToolButton label="Reset Tare" secondary onPress={resetCalibration} />

      <Modal
        visible={calibrationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalibrationVisible(false)}
      >
        <View
          style={[
            styles.modalOverlay,
            {
              paddingTop: Math.max(insets.top + 18, 24),
              paddingBottom: Math.max(insets.bottom + 18, 24),
            },
          ]}
        >
          <View style={styles.calModal}>
            {calibrationStep === 'flat' && (
              <>
                <Text style={styles.modalTitle}>Set Phone on Table</Text>
                <Text style={styles.modalText}>
                  Lay the phone flat on the setup table. Hold it still for 2 seconds.
                </Text>

                <View style={styles.modalStatusBox}>
                  <Text style={styles.modalStatusLabel}>Flat Table Calibration</Text>
                  <Text style={[styles.modalStatusValue, flatCalibratedMessage && styles.calibratedText]}>{flatCalibratedMessage ? 'Calibrated' : flatStableSince ? 'Hold still...' : 'Waiting for steady phone'}</Text>
                  <ProgressBar percent={flatCalibratedMessage ? 100 : flatProgress} good={!!flatStableSince || flatCalibratedMessage} />
                </View>

                <View style={styles.modalButtons}>
                  <ToolButton label="Cancel" secondary onPress={() => setCalibrationVisible(false)} style={styles.modalButton} />
                  <ToolButton label="Set Flat Now" onPress={setFlatTable} disabled={!sensorReady} style={styles.modalButton} />
                </View>
              </>
            )}

            {calibrationStep === 'vertical' && (
              <>
                <Text style={styles.modalTitle}>Tip Top of Phone Up</Text>
                <Text style={styles.modalText}>
                  Leave the bottom of the phone on the table. Tip the top up toward 90°. The 2 second timer starts only after it is upright.
                </Text>

                <View style={styles.modalStatusBox}>
                  <Text style={styles.modalStatusLabel}>90° / Upright Calibration</Text>
                  <Text style={[styles.modalStatusValue, verticalCalibratedMessage && styles.calibratedText]}>
                    {verticalCalibratedMessage ? 'Calibrated' : verticalPrompt}
                  </Text>
                  <ProgressBar
                    percent={verticalCalibratedMessage ? 100 : verticalStableSince ? verticalProgress : uprightScore * 72}
                    good={!!verticalStableSince || verticalCalibratedMessage}
                  />
                </View>

                <View style={styles.modalButtons}>
                  <ToolButton label="Back" secondary onPress={() => setCalibrationStep('flat')} style={styles.modalButton} />
                  <ToolButton label="Tare / Set 0" onPress={tareZeroNow} disabled={!sensorReady} style={styles.modalButton} />
                </View>
              </>
            )}

            {calibrationStep === 'ready' && (
              <>
                <Text style={styles.modalTitle}>Camber Gauge Ready</Text>
                <Text style={styles.modalText}>
                  Put the same bottom edge of the phone against the tire. Keep F/B Tip inside the translucent green target zone.
                </Text>

                <View style={styles.modalStatusBox}>
                  <Text style={styles.modalStatusLabel}>Current Camber</Text>
                  <Text style={styles.modalReadyValue}>{measurement.ready ? angleText(measurement.camber) : '—'}</Text>
                </View>

                <ToolButton label="Done" onPress={() => setCalibrationVisible(false)} style={styles.doneButton} />
              </>
            )}
          </View>
        </View>
      </Modal>
    </ToolScaffold>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  col: {
    flex: 1,
  },

  gaugeCard: {
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: TOOL_CARD_2,
    borderColor: 'rgba(38,217,109,0.32)',
  },
  stepRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  stepPill: {
    flex: 1,
    minHeight: 25,
    borderRadius: 999,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  stepPillActive: {
    borderColor: 'rgba(255,212,107,0.42)',
    backgroundColor: 'rgba(255,212,107,0.08)',
  },
  stepPillDone: {
    backgroundColor: 'rgba(57,255,136,0.12)',
    borderColor: TOOL_LINE,
  },
  stepPillText: {
    color: TOOL_MUTED,
    fontSize: 10,
    fontWeight: '900',
  },
  stepPillTextActive: {
    color: '#ffd46b',
  },
  stepPillTextDone: {
    color: TOOL_GREEN,
  },
  gaugeLabel: {
    color: TOOL_MUTED,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 10,
    marginBottom: 0,
  },
  gaugeValue: {
    color: TOOL_GREEN,
    fontWeight: '900',
    fontSize: 58,
    lineHeight: 66,
    letterSpacing: -1.5,
  },
  gaugeValueWarn: {
    color: '#ffd46b',
  },
  direction: {
    color: TOOL_TEXT,
    fontWeight: '900',
    fontSize: 13,
    marginTop: -4,
  },
  levelBar: {
    width: '100%',
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 10,
    overflow: 'hidden',
  },
  centerLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  levelMark: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 5,
    borderRadius: 4,
    backgroundColor: TOOL_GREEN,
  },
  tipRow: {
    width: '100%',
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  tipText: {
    color: TOOL_TEXT,
    fontSize: 12,
    fontWeight: '900',
  },
  tipTextBad: {
    color: '#ffd46b',
  },
  tipStatus: {
    color: TOOL_MUTED,
    fontSize: 12,
    fontWeight: '900',
  },
  tipStatusGood: {
    color: TOOL_GREEN,
  },
  tipStatusBad: {
    color: '#ffd46b',
  },
  tipBar: {
    width: '100%',
    height: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 6,
    overflow: 'hidden',
  },
  tipTargetZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(57,255,136,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(57,255,136,0.40)',
  },
  tipMark: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 5,
    borderRadius: 4,
    backgroundColor: TOOL_GREEN,
  },
  tipMarkBad: {
    backgroundColor: '#ffd46b',
  },

  buttonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  rowButton: {
    flex: 1,
  },
  tipLimitButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(57,255,136,0.10)',
    borderWidth: 1,
    borderColor: TOOL_LINE,
  },
  tipLimitText: {
    color: TOOL_GREEN,
    fontWeight: '900',
    fontSize: 13,
  },

  warningCard: {
    borderColor: 'rgba(255,212,107,0.35)',
  },
  warningText: {
    color: TOOL_TEXT,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  commandText: {
    marginTop: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    color: TOOL_GREEN,
    fontSize: 11,
    fontWeight: '900',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(57,255,136,0.18)',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  calModal: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 20,
    padding: 16,
    backgroundColor: '#101915',
    borderWidth: 1,
    borderColor: TOOL_LINE,
  },
  modalTitle: {
    color: TOOL_TEXT,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  modalText: {
    color: TOOL_MUTED,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 9,
  },
  modalStatusBox: {
    marginTop: 14,
    borderRadius: 15,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  modalStatusLabel: {
    color: TOOL_MUTED,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  modalStatusValue: {
    color: '#ffd46b',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 3,
  },
  calibratedText: {
    color: TOOL_GREEN,
  },
  modalReadyValue: {
    color: TOOL_GREEN,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#ffd46b',
  },
  progressFillGood: {
    backgroundColor: TOOL_GREEN,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  modalButton: {
    flex: 1,
  },
  doneButton: {
    marginTop: 14,
  },
  badText: {
    color: TOOL_RED,
  },
});
