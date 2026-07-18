// features/tools/GearToothCounterScreen.js

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, Image as SvgImage, Line, Path, Rect } from 'react-native-svg';
import {
  Segmented,
  ToolButton,
  ToolCard,
  ToolInput,
  ToolScaffold,
  ToolSectionTitle,
  TOOL_CARD_2,
  TOOL_GREEN,
  TOOL_LINE,
  TOOL_LINE_SOFT,
  TOOL_MUTED,
  TOOL_TEXT,
  fmt,
  goBack,
} from './ToolShared';
import {
  GEAR_PITCH_OPTIONS,
  convertDiameter,
  estimateToothCount,
  outsideDiameterForTeeth,
  pitchInfo,
} from './lib/gearMath';
import { autoCountGearTeethFromBase64 } from './lib/gearPhotoAutoCount';

const STORAGE_KEY = '@imrcToolsGearCounter_v7';

const DEFAULTS = {
  count: 0,
  outsideDiameter: '',
  diameterUnit: 'in',
  pitchType: '48p',
  customPitch: '',
  toothCount: '',
  photoUri: '',
  photoStatus: '',
  autoCount: 0,
  autoConfidence: 0,
  autoMethod: '',
  autoUsable: false,
  autoVerified: false,
  autoExpected: 0,
  photoGuess: 0,
  autoOverlay: null,
  autoTopCandidates: [],
  autoBrief: '',
  experimentAuto: false,
  selectedAutoCandidate: 0,
  photoZoom: 1,
};

const FALLBACK_GEAR_PITCH_OPTIONS = [
  { label: '32P', value: '32p', kind: 'dp', pitch: 32, group: 'Inch pitch' },
  { label: '48P', value: '48p', kind: 'dp', pitch: 48, group: 'Inch pitch' },
  { label: '64P', value: '64p', kind: 'dp', pitch: 64, group: 'Inch pitch' },
  { label: '72P', value: '72p', kind: 'dp', pitch: 72, group: 'Inch pitch' },
  { label: 'M0.3', value: 'mod03', kind: 'mod', pitch: 0.3, group: 'Metric module' },
  { label: 'M0.4', value: 'mod04', kind: 'mod', pitch: 0.4, group: 'Metric module' },
  { label: 'M0.5', value: 'mod05', kind: 'mod', pitch: 0.5, group: 'Metric module' },
  { label: 'M0.6', value: 'mod06', kind: 'mod', pitch: 0.6, group: 'Metric module' },
  { label: 'M0.7', value: 'mod07', kind: 'mod', pitch: 0.7, group: 'Metric module' },
  { label: 'M0.8', value: 'mod08', kind: 'mod', pitch: 0.8, group: 'Metric module' },
  { label: 'M1.0', value: 'mod10', kind: 'mod', pitch: 1.0, group: 'Metric module' },
  { label: 'Custom M', value: 'customMod', kind: 'customMod', pitch: 0, group: 'Custom' },
];

const SAFE_GEAR_PITCH_OPTIONS = Array.isArray(GEAR_PITCH_OPTIONS) && GEAR_PITCH_OPTIONS.length
  ? GEAR_PITCH_OPTIONS
  : FALLBACK_GEAR_PITCH_OPTIONS;

const DP_OPTIONS = SAFE_GEAR_PITCH_OPTIONS.filter((p) => p.group === 'Inch pitch');
const MOD_OPTIONS = SAFE_GEAR_PITCH_OPTIONS.filter((p) => p.group === 'Metric module');
const CUSTOM_OPTIONS = SAFE_GEAR_PITCH_OPTIONS.filter((p) => p.group === 'Custom');

function unitValueLabel(inValue, mmValue, unit) {
  if (unit === 'mm') return `${fmt(mmValue, 2)} mm`;
  return `${fmt(inValue, 4)} in`;
}



function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function midpointAngle(tick, cx, cy) {
  const mx = ((tick?.x1 || 0) + (tick?.x2 || 0)) / 2;
  const my = ((tick?.y1 || 0) + (tick?.y2 || 0)) / 2;
  return Math.atan2(my - cy, mx - cx);
}

function normalizeAngle(angle) {
  let next = angle;
  while (next < -Math.PI) next += Math.PI * 2;
  while (next > Math.PI) next -= Math.PI * 2;
  return next;
}

function pointOnRotatedEllipse(cx, cy, rx, ry, rotation, theta) {
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const cosR = Math.cos(rotation || 0);
  const sinR = Math.sin(rotation || 0);
  const ex = rx * cosT;
  const ey = ry * sinT;
  return {
    x: cx + (ex * cosR - ey * sinR),
    y: cy + (ex * sinR + ey * cosR),
  };
}

function buildGuideTicksFromCount(overlay, toothCount) {
  const count = Math.max(0, Math.round(Number(toothCount) || 0));
  if (!overlay || count < 3) return Array.isArray(overlay?.ticks) ? overlay.ticks : [];

  const cx = overlay.ellipse?.cx || overlay.cx || 0;
  const cy = overlay.ellipse?.cy || overlay.cy || 0;
  const sourceTicks = Array.isArray(overlay.ticks) ? overlay.ticks : [];
  const sourceCount = Math.max(1, sourceTicks.length || count);
  const firstAngle = sourceTicks.length ? midpointAngle(sourceTicks[0], cx, cy) : -Math.PI / 2;
  const sourceStep = (Math.PI * 2) / sourceCount;
  const targetStep = (Math.PI * 2) / count;

  let startAngle = firstAngle;
  if (sourceTicks.length > 1) {
    // Keep the new guide centered near the existing guide rather than drifting by
    // a full tooth when the candidate count changes.
    startAngle = firstAngle - ((targetStep - sourceStep) * 0.5);
  }

  const ticks = [];
  for (let i = 0; i < count; i += 1) {
    const angle = startAngle + i * targetStep;
    const isMajor = i % 5 === 0;

    if (overlay.ellipse) {
      const rx = overlay.ellipse.rx;
      const ry = overlay.ellipse.ry;
      const rotation = overlay.ellipse.rotation || ((overlay.ellipse.rotationDeg || 0) * Math.PI / 180);
      const innerScale = isMajor ? 0.965 : 0.982;
      const outerScale = isMajor ? 1.03 : 1.018;
      const p1 = pointOnRotatedEllipse(cx, cy, rx * innerScale, ry * innerScale, rotation, angle);
      const p2 = pointOnRotatedEllipse(cx, cy, rx * outerScale, ry * outerScale, rotation, angle);
      ticks.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, angle });
    } else {
      const outer = overlay.outerRadius || 1;
      const inner = outer * (isMajor ? 0.96 : 0.982);
      const beyond = outer * (isMajor ? 1.03 : 1.018);
      ticks.push({
        x1: cx + Math.cos(angle) * inner,
        y1: cy + Math.sin(angle) * inner,
        x2: cx + Math.cos(angle) * beyond,
        y2: cy + Math.sin(angle) * beyond,
        angle,
      });
    }
  }

  return ticks;
}

function buildCandidateGuideOverlay(overlay, selectedToothCount) {
  if (!overlay) return null;
  const selected = Math.max(0, Math.round(Number(selectedToothCount) || 0));
  if (!selected) return overlay;
  return {
    ...overlay,
    ticks: buildGuideTicksFromCount(overlay, selected),
    selectedToothCount: selected,
  };
}

function gearBoundsForOverlay(overlay) {
  if (!overlay) return null;

  if (overlay.ellipse) {
    const rotation = overlay.ellipse.rotation || ((overlay.ellipse.rotationDeg || 0) * Math.PI / 180);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const rx = overlay.ellipse.rx || overlay.outerRadius || 1;
    const ry = overlay.ellipse.ry || overlay.outerRadius || 1;

    // Rotated ellipse screen-space half-bounds.
    const halfW = Math.sqrt((rx * rx * cos * cos) + (ry * ry * sin * sin));
    const halfH = Math.sqrt((rx * rx * sin * sin) + (ry * ry * cos * cos));

    return {
      cx: overlay.ellipse.cx || overlay.cx || 0,
      cy: overlay.ellipse.cy || overlay.cy || 0,
      width: halfW * 2,
      height: halfH * 2,
    };
  }

  const radius = overlay.clipRadius || overlay.outerRadius || 1;
  return {
    cx: overlay.cx || 0,
    cy: overlay.cy || 0,
    width: radius * 2,
    height: radius * 2,
  };
}

function zoomedViewBox(viewBox, focusX, focusY, zoom, overlay) {
  const vb = viewBox || { x: 0, y: 0, width: 100, height: 100 };
  const factor = clamp(Number(zoom) || 1, 1, 3);
  if (factor <= 1.02) return vb;

  const gearBounds = gearBoundsForOverlay(overlay);
  const fullGearMinWidth = gearBounds ? Math.min(vb.width, gearBounds.width * 1.10) : vb.width * 0.82;
  const fullGearMinHeight = gearBounds ? Math.min(vb.height, gearBounds.height * 1.10) : vb.height * 0.82;

  // Zoom by tightening dead space, but never shrink the viewBox smaller than
  // the whole gear. This keeps the full gear visible while still making it
  // easier to inspect teeth.
  const nextWidth = Math.max(vb.width / factor, fullGearMinWidth);
  const nextHeight = Math.max(vb.height / factor, fullGearMinHeight);
  const maxX = vb.x + vb.width - nextWidth;
  const maxY = vb.y + vb.height - nextHeight;
  const focusCenterX = gearBounds?.cx || focusX || (vb.x + vb.width / 2);
  const focusCenterY = gearBounds?.cy || focusY || (vb.y + vb.height / 2);
  const x = clamp(focusCenterX - nextWidth / 2, vb.x, maxX);
  const y = clamp(focusCenterY - nextHeight / 2, vb.y, maxY);

  return { x, y, width: nextWidth, height: nextHeight };
}

function photoBoxHeightForZoom(zoom) {
  const factor = clamp(Number(zoom) || 1, 1, 3);
  // Grow the whole preview box aggressively so the complete gear can remain
  // visible when zoomed.
  return Math.round(230 + (factor - 1) * 210);
}

function summarizeAutoCount(result) {
  const perspective = result?.overlay?.perspectiveCorrected ? 'corrected for the gear angle, ' : '';
  const whiteMode = result?.debug?.whiteGearMode ? 'detected a white/light gear, inverted it internally, ' : '';
  const background = result?.overlay?.backgroundRemoved ? 'removed the background and shadow, ' : 'trimmed the visible shadow, ';
  const method = String(result?.method || '').toLowerCase();

  let countStep = 'then counted the visible outer tooth peaks.';
  if (method.includes('center bore')) {
    countStep = 'then centered from the bore and counted the visible outer tooth peaks.';
  } else if (method.includes('outer-ring')) {
    countStep = 'then counted the visible outer tooth peaks around the outer ring.';
  }

  return `It ${whiteMode}${perspective}${background}${countStep}`.replace(/\s+/g, ' ').trim();
}

function buildTopCandidateDisplay(autoCount, autoConfidence, topCandidates) {
  const list = Array.isArray(topCandidates) ? topCandidates : [];
  const deduped = [];
  const seen = new Set();
  const topScore = Number(list[0]?.score || 0);

  const pushCandidate = (teeth, percent, primary = false) => {
    const t = Number(teeth);
    const p = Math.max(1, Math.min(99, Math.round(Number(percent) || 0)));
    if (!t || seen.has(t)) return;
    seen.add(t);
    deduped.push({ teeth: t, percent: p, primary: !!primary });
  };

  if (autoCount) {
    pushCandidate(autoCount, autoConfidence || 70, true);
  }

  list.forEach((candidate) => {
    const teeth = Number(candidate?.teeth || 0);
    if (!teeth || seen.has(teeth)) return;

    let percent = 0;
    if (topScore > 0 && Number(candidate?.score || 0) > 0 && autoConfidence > 0) {
      percent = (Number(candidate.score) / topScore) * Number(autoConfidence);
    } else if (Number(candidate?.quality || 0) > 0) {
      percent = Number(candidate.quality) * 100;
    } else {
      percent = Math.max(8, (autoConfidence || 70) - deduped.length * 6);
    }

    pushCandidate(teeth, percent, false);
  });

  return deduped.slice(0, 3);
}

function optionalImagePicker() {
  try {
    // Keep this optional so old dev builds do not crash if the native picker is missing.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    return require('expo-image-picker');
  } catch {
    return null;
  }
}

function PitchChip({ option, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pitchChip,
        selected && styles.pitchChipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.pitchChipText, selected && styles.pitchChipTextSelected]} numberOfLines={1}>
        {option.label}
      </Text>
    </Pressable>
  );
}

function MiniResult({ label, value, note, accent = false }) {
  return (
    <View style={[styles.miniResult, accent && styles.miniResultAccent]}>
      <Text style={styles.miniLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.miniValue, accent && styles.miniValueAccent]} numberOfLines={1}>{value}</Text>
      {!!note && <Text style={styles.miniNote} numberOfLines={1}>{note}</Text>}
    </View>
  );
}

function GearPhotoGuide({ uri, overlay, zoom = 1, onZoomIn, onZoomOut }) {
  if (!uri) return null;
  if (!overlay?.width || !overlay?.height) {
    return (
      <View style={styles.photoWrap}>
        <Image source={{ uri }} style={styles.photo} resizeMode="contain" />
      </View>
    );
  }

  const ticks = Array.isArray(overlay.ticks) ? overlay.ticks : [];
  const baseViewBox = overlay.viewBox || { x: 0, y: 0, width: overlay.width, height: overlay.height };
  const currentViewBox = zoomedViewBox(baseViewBox, overlay.ellipse?.cx || overlay.cx, overlay.ellipse?.cy || overlay.cy, zoom, overlay);
  const photoBoxHeight = photoBoxHeightForZoom(zoom);

  return (
    <View style={[styles.photoWrap, styles.photoWrapZoom, { height: photoBoxHeight }]}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <Defs>
          <ClipPath id="gearOnlyClip">
            {overlay.ellipse ? (
              <Ellipse
                cx={overlay.ellipse.cx}
                cy={overlay.ellipse.cy}
                rx={(overlay.ellipse.rx || overlay.outerRadius) * 1.12}
                ry={(overlay.ellipse.ry || overlay.outerRadius) * 1.12}
                transform={`rotate(${overlay.ellipse.rotationDeg || 0} ${overlay.ellipse.cx} ${overlay.ellipse.cy})`}
              />
            ) : (
              <Circle
                cx={overlay.cx}
                cy={overlay.cy}
                r={overlay.clipRadius || overlay.outerRadius * 1.055}
              />
            )}
          </ClipPath>
        </Defs>
        <Rect
          x={0}
          y={0}
          width={overlay.width}
          height={overlay.height}
          fill="#05080b"
        />
        <SvgImage
          href={{ uri }}
          x={0}
          y={0}
          width={overlay.width}
          height={overlay.height}
          preserveAspectRatio="none"
          clipPath="url(#gearOnlyClip)"
        />
        {overlay.ellipse ? (
          <>
            <Ellipse
              cx={overlay.ellipse.cx}
              cy={overlay.ellipse.cy}
              rx={overlay.ellipse.rx}
              ry={overlay.ellipse.ry}
              transform={`rotate(${overlay.ellipse.rotationDeg || 0} ${overlay.ellipse.cx} ${overlay.ellipse.cy})`}
              stroke="rgba(38,217,109,0.85)"
              strokeWidth={2.4}
              fill="none"
            />
            <Ellipse
              cx={overlay.ellipse.cx}
              cy={overlay.ellipse.cy}
              rx={overlay.ellipse.rx * 0.74}
              ry={overlay.ellipse.ry * 0.74}
              transform={`rotate(${overlay.ellipse.rotationDeg || 0} ${overlay.ellipse.cx} ${overlay.ellipse.cy})`}
              stroke="rgba(255,255,255,0.26)"
              strokeWidth={1.3}
              fill="none"
            />
          </>
        ) : (
          <>
            <Circle
              cx={overlay.cx}
              cy={overlay.cy}
              r={overlay.outerRadius}
              stroke="rgba(38,217,109,0.85)"
              strokeWidth={2.4}
              fill="none"
            />
            <Circle
              cx={overlay.cx}
              cy={overlay.cy}
              r={overlay.innerRadius}
              stroke="rgba(255,255,255,0.26)"
              strokeWidth={1.3}
              fill="none"
            />
          </>
        )}
        {!!overlay.sectorPath && (
          <Path
            d={overlay.sectorPath}
            stroke="rgba(255,214,102,0.96)"
            strokeWidth={5.5}
            strokeLinecap="round"
            fill="none"
          />
        )}
        {ticks.map((tick, idx) => (
          <Line
            key={`${idx}-${tick.x1}-${tick.y1}`}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke={idx % 5 === 0 ? 'rgba(38,217,109,1)' : 'rgba(38,217,109,0.72)'}
            strokeWidth={idx % 5 === 0 ? 2.6 : 1.7}
            strokeLinecap="round"
          />
        ))}
      </Svg>
      <View style={styles.zoomBadge}>
        <Text style={styles.zoomBadgeText}>{fmt(zoom, 1)}x</Text>
      </View>
      <View style={styles.zoomRail}>
        <Pressable onPress={onZoomIn} style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}>
          <Text style={styles.zoomButtonText}>+</Text>
        </Pressable>
        <Pressable onPress={onZoomOut} style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}>
          <Text style={styles.zoomButtonText}>−</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function GearToothCounterScreen(props) {
  const [state, setState] = useState(DEFAULTS);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [photoBase64, setPhotoBase64] = useState('');

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        const parsed = JSON.parse(raw);
        setState((prev) => ({
          ...prev,
          ...parsed,
          diameterUnit: parsed?.diameterUnit || 'in',
          photoStatus: '',
          autoOverlay: null,
        }));
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const saveable = {
      ...state,
      photoStatus: '',
      autoOverlay: null,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(saveable)).catch(() => {});
  }, [state]);

  const setField = (key, value) => setState((prev) => ({ ...prev, [key]: value }));

  const applySizeEstimateToCount = (nextState) => {
    const nextEstimate = estimateToothCount(nextState);
    if (!nextEstimate.nearest || nextEstimate.nearest <= 0) return nextState;

    return {
      ...nextState,
      count: nextEstimate.nearest,
      toothCount: String(nextEstimate.nearest),
    };
  };

  const setOutsideDiameterAndAutoCount = (value) => {
    setState((prev) => applySizeEstimateToCount({
      ...prev,
      outsideDiameter: value,
    }));
  };

  const setPitchTypeAndAutoCount = (pitchType) => {
    setState((prev) => applySizeEstimateToCount({
      ...prev,
      pitchType,
    }));
  };

  const setCustomPitchAndAutoCount = (customPitch) => {
    setState((prev) => applySizeEstimateToCount({
      ...prev,
      customPitch,
    }));
  };

  const setToothCountManual = (value) => {
    const nextCount = Math.max(0, Math.round(Number(String(value ?? '').replace(/[^0-9.\-]/g, '')) || 0));
    setState((prev) => ({
      ...prev,
      toothCount: value,
      count: nextCount,
    }));
  };

  const setDiameterUnit = (nextUnit) => {
    setState((prev) => applySizeEstimateToCount({
      ...prev,
      diameterUnit: nextUnit,
      outsideDiameter: convertDiameter(prev.outsideDiameter, prev.diameterUnit, nextUnit),
    }));
  };

  const estimate = useMemo(() => estimateToothCount(state), [state]);
  const odForTeeth = useMemo(() => outsideDiameterForTeeth(state), [state]);
  const selectedPitch = useMemo(() => pitchInfo(state.pitchType, state.customPitch), [state.pitchType, state.customPitch]);
  const autoTopDisplay = useMemo(
    () => buildTopCandidateDisplay(state.autoCount, state.autoConfidence, state.autoTopCandidates),
    [state.autoCount, state.autoConfidence, state.autoTopCandidates]
  );

  const selectedAutoTooth = useMemo(() => {
    const direct = Math.round(Number(state.selectedAutoCandidate || 0));
    if (direct > 0) return direct;
    if (autoTopDisplay.length) return autoTopDisplay[0].teeth;
    return Math.round(Number(state.autoCount || 0));
  }, [state.selectedAutoCandidate, state.autoCount, autoTopDisplay]);

  const displayAutoOverlay = useMemo(
    () => buildCandidateGuideOverlay(state.autoOverlay, selectedAutoTooth),
    [state.autoOverlay, selectedAutoTooth]
  );

  const runAutoCount = async (base64Override = '') => {
    const base64 = base64Override || photoBase64;
    if (!base64) {
      setField('photoStatus', 'Auto count needs a fresh photo. Tap Take Photo or Pick Photo first.');
      return;
    }

    setAutoBusy(true);
    setField('photoStatus', 'Auto counting teeth… keep this app open.');
    try {
      // Give the UI a frame to show the busy message before pure-JS JPEG decoding starts.
      await new Promise((resolve) => setTimeout(resolve, 25));
      const result = await autoCountGearTeethFromBase64(base64, {
        expectedFromOd: estimate.nearest,
        pitchType: state.pitchType,
        customPitch: state.customPitch,
        outsideDiameter: state.outsideDiameter,
        diameterUnit: state.diameterUnit,
      });

      if (result.ok) {
        setState((prev) => ({
          ...prev,
          count: result.count,
          toothCount: String(result.count),
          autoCount: result.count,
          autoConfidence: result.confidence,
          autoMethod: result.method,
          autoUsable: !!result.usable,
          autoVerified: !!result.verifiedByOd,
          autoExpected: result.expected || 0,
          photoGuess: result.photoGuess || result.count,
          autoOverlay: result.overlay || null,
          autoTopCandidates: Array.isArray(result.debug?.topCandidates) ? result.debug.topCandidates.slice(0, 3) : [],
          autoBrief: summarizeAutoCount(result),
          selectedAutoCandidate: result.count || 0,
          photoZoom: 1,
          photoStatus: result.message,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          autoCount: 0,
          autoConfidence: 0,
          autoMethod: '',
          autoUsable: false,
          autoVerified: false,
          autoExpected: 0,
          photoGuess: 0,
          autoOverlay: null,
          autoTopCandidates: [],
          autoBrief: '',
          selectedAutoCandidate: 0,
          photoZoom: 1,
          photoStatus: result.message || 'Auto count could not read this photo.',
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        autoTopCandidates: [],
        autoBrief: '',
        photoStatus: 'Auto count failed. Try a closer, straighter photo on a plain background.',
      }));
    } finally {
      setAutoBusy(false);
    }
  };

  const handlePickPhoto = async (mode = 'library') => {
    if (photoBusy || autoBusy) return;
    setPhotoBusy(true);
    try {
      const ImagePicker = optionalImagePicker();
      if (!ImagePicker) {
        setField('photoStatus', 'Photo picker is not available in this dev build. Rebuild the dev app to enable it.');
        return;
      }

      if (mode === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync?.();
        if (perm && perm.status !== 'granted') {
          setField('photoStatus', 'Camera permission was not granted.');
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync?.();
        if (perm && perm.status !== 'granted') {
          setField('photoStatus', 'Photo permission was not granted.');
          return;
        }
      }

      const launch = mode === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const result = await launch({
        mediaTypes: ImagePicker.MediaType?.Images ? [ImagePicker.MediaType.Images] : (ImagePicker.MediaTypeOptions?.Images || 'Images'),
        allowsEditing: false,
        quality: 0.9,
        base64: true,
        exif: false,
      });

      if (result?.canceled) {
        setField('photoStatus', '');
        return;
      }

      const asset = Array.isArray(result?.assets) ? result.assets[0] : result;
      if (asset?.uri) {
        const base64 = asset.base64 || '';
        setPhotoBase64(base64);
        setState((prev) => ({
          ...prev,
          photoUri: asset.uri,
          autoCount: 0,
          autoConfidence: 0,
          autoMethod: '',
          autoUsable: false,
          autoVerified: false,
          autoExpected: 0,
          photoGuess: 0,
          autoTopCandidates: [],
          autoBrief: '',
          selectedAutoCandidate: 0,
          photoZoom: 1,
          photoStatus: base64
            ? 'Photo loaded. Auto count starting…'
            : 'Photo loaded, but this build did not return image data for auto count.',
        }));
        if (base64) setTimeout(() => runAutoCount(base64), 80);
      }
    } catch (err) {
      setField('photoStatus', 'Photo tool could not open in this dev build. Rebuild the app if needed.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const counted = Number(state.count || 0);
  const hasEstimate = !!estimate.nearest;
  const hasOd = !!state.toothCount && Number(odForTeeth.odIn || 0) > 0;
  const displayOdForTeeth = hasOd ? unitValueLabel(odForTeeth.odIn, odForTeeth.odMm, state.diameterUnit) : 'Enter T';
  const displayExpected = hasEstimate ? unitValueLabel(estimate.expectedOdIn, estimate.expectedOdMm, state.diameterUnit) : 'Enter OD';
  const delta = state.diameterUnit === 'mm' ? estimate.deltaMm : estimate.deltaIn;
  const autoCount = Number(state.autoCount || 0);
  const autoConfidence = Number(state.autoConfidence || 0);
  const autoUsable = !!state.autoUsable || !!state.autoVerified || autoConfidence >= 72;
  const autoConfidenceText = autoCount
    ? state.autoVerified
      ? 'Verified by pitch + OD'
      : autoUsable
        ? 'Photo guide - verify'
        : 'Needs pitch + OD'
    : '';

  return (
    <ToolScaffold title="Gear Counter" subtitle="pitch helper + experimental photo count" onBack={() => goBack(props)}>
      <ToolCard compact style={styles.resultsCard}>
        <ToolSectionTitle right={selectedPitch.label}>Results</ToolSectionTitle>
        <View style={styles.resultsGrid}>
          <MiniResult
            label="Counted"
            value={`${counted}T`}
            note="active count"
          />
          <MiniResult
            label="Auto Photo"
            value={autoCount ? `${autoCount}T` : '—'}
            note={autoCount ? `${autoConfidence}% ${state.autoVerified ? 'verified' : 'photo'}` : 'take photo'}
            accent={!!autoCount}
          />
          <MiniResult
            label="From Size"
            value={hasEstimate ? `${estimate.nearest}T` : '—'}
            note={hasEstimate ? `${fmt(estimate.estimated, 2)} calc` : 'enter size'}
          />
        </View>
        <View style={styles.resultsGridTwo}>
          <MiniResult
            label="Expected OD"
            value={displayExpected}
            note={hasEstimate ? `Δ ${fmt(delta, state.diameterUnit === 'mm' ? 2 : 4)} ${state.diameterUnit}` : 'nearest tooth'}
          />
          <MiniResult
            label="OD From Tooth Count"
            value={displayOdForTeeth}
            note={hasOd ? `${odForTeeth.pitchLabel} selected` : 'optional'}
          />
        </View>
      </ToolCard>

      <ToolCard compact>
        <ToolSectionTitle>Measure / Calculate</ToolSectionTitle>
        <Segmented
          value={state.diameterUnit}
          onChange={setDiameterUnit}
          options={[
            { label: 'inch', value: 'in' },
            { label: 'mm', value: 'mm' },
          ]}
        />
        <View style={styles.row}>
          <View style={styles.col}>
            <ToolInput
              label="Outside Dia"
              value={state.outsideDiameter}
              onChangeText={setOutsideDiameterAndAutoCount}
              suffix={state.diameterUnit}
            />
          </View>
          <View style={styles.col}>
            <ToolInput
              label="Tooth Count"
              value={state.toothCount}
              onChangeText={setToothCountManual}
              suffix="T"
            />
          </View>
        </View>
      </ToolCard>


      <ToolCard compact>
        <ToolSectionTitle>Pitch</ToolSectionTitle>
        <Text style={styles.pitchGroupLabel}>Inch pitch</Text>
        <View style={styles.pitchGrid}>
          {DP_OPTIONS.map((option) => (
            <PitchChip
              key={option.value}
              option={option}
              selected={state.pitchType === option.value}
              onPress={() => setPitchTypeAndAutoCount(option.value)}
            />
          ))}
        </View>
        <Text style={styles.pitchGroupLabel}>Metric module</Text>
        <View style={styles.pitchGrid}>
          {MOD_OPTIONS.map((option) => (
            <PitchChip
              key={option.value}
              option={option}
              selected={state.pitchType === option.value}
              onPress={() => setPitchTypeAndAutoCount(option.value)}
            />
          ))}
          {CUSTOM_OPTIONS.map((option) => (
            <PitchChip
              key={option.value}
              option={option}
              selected={state.pitchType === option.value}
              onPress={() => setPitchTypeAndAutoCount(option.value)}
            />
          ))}
        </View>
        {state.pitchType === 'customMod' && (
          <ToolInput
            label="Custom Module"
            value={state.customPitch}
            onChangeText={setCustomPitchAndAutoCount}
            suffix="M"
            placeholder="0.75"
          />
        )}
      </ToolCard>

      <ToolCard compact>
        <ToolSectionTitle>Tap Counter</ToolSectionTitle>
        <View style={styles.counterRow}>
          <Text style={styles.counter}>{counted}</Text>
          <View style={styles.counterButtons}>
            <ToolButton label="+ Tooth" onPress={() => setField('count', counted + 1)} style={styles.plusButton} />
            <ToolButton label="-" secondary onPress={() => setField('count', Math.max(0, counted - 1))} style={styles.smallButton} />
            <ToolButton label="Clear" secondary onPress={() => setField('count', 0)} style={styles.smallButton} />
          </View>
        </View>
      </ToolCard>

      <ToolCard compact style={styles.experimentToggleCard}>
        <View style={styles.experimentHeaderRow}>
          <View style={styles.experimentTextWrap}>
            <Text style={styles.experimentTitle}>Experiment Auto Counter</Text>
            <Text style={styles.experimentSubText}>
              Photo tooth count is experimental. Use + / - to enlarge the preview while keeping the whole gear visible.
            </Text>
          </View>
          <ToolButton
            label={state.experimentAuto ? 'Hide' : 'Open'}
            secondary={!state.experimentAuto}
            onPress={() => setField('experimentAuto', !state.experimentAuto)}
            style={styles.experimentToggleButton}
          />
        </View>
      </ToolCard>

      {state.experimentAuto && (
      <ToolCard compact>
        <ToolSectionTitle right={autoBusy ? 'working…' : autoCount ? (state.autoVerified ? `${autoCount}T verified` : `${autoCount}T guide`) : ''}>Visible Teeth Auto Count</ToolSectionTitle>
        {!!state.photoUri && (
          <>
            <GearPhotoGuide
              uri={state.photoUri}
              overlay={displayAutoOverlay}
              zoom={state.photoZoom || 1}
              onZoomIn={() => setField('photoZoom', clamp((state.photoZoom || 1) + 0.25, 1, 3))}
              onZoomOut={() => setField('photoZoom', clamp((state.photoZoom || 1) - 0.25, 1, 3))}
            />
          </>
        )}
        {!!autoTopDisplay.length && (
          <View style={styles.autoCandidateRow}>
            {autoTopDisplay.map((candidate, index) => {
              const selected = selectedAutoTooth === candidate.teeth;
              return (
                <Pressable
                  key={`${candidate.teeth}-${index}`}
                  onPress={() => setState((prev) => ({
                    ...prev,
                    selectedAutoCandidate: candidate.teeth,
                    count: candidate.teeth,
                    toothCount: String(candidate.teeth),
                  }))}
                  style={({ pressed }) => [
                    styles.autoCandidateChip,
                    (selected || index === 0) && styles.autoCandidateChipPrimary,
                    selected && styles.autoCandidateChipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.autoCandidateTooth, (selected || index === 0) && styles.autoCandidateToothPrimary]}>{candidate.teeth}T</Text>
                  <Text style={[styles.autoCandidatePercent, (selected || index === 0) && styles.autoCandidatePercentPrimary]}>{candidate.percent}%</Text>
                  <Text style={styles.autoCandidateTap}>{selected ? 'showing lines' : 'tap to show'}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <View style={styles.photoButtons}>
          <ToolButton label={photoBusy ? 'Opening…' : 'Take Photo'} onPress={() => handlePickPhoto('camera')} style={styles.photoButton} disabled={photoBusy || autoBusy} />
          <ToolButton label="Pick Photo" secondary onPress={() => handlePickPhoto('library')} style={styles.photoButton} disabled={photoBusy || autoBusy} />
        </View>
        {!!state.photoUri && (
          <View style={styles.photoButtonsSecond}>
            <ToolButton
              label={autoBusy ? 'Counting…' : 'Auto Count'}
              onPress={() => runAutoCount()}
              style={styles.photoButton}
              disabled={autoBusy || photoBusy}
            />
            <ToolButton
              label="Clear"
              secondary
              onPress={() => {
                setPhotoBase64('');
                setState((prev) => ({
                  ...prev,
                  photoUri: '',
                  photoStatus: '',
                  autoCount: 0,
                  autoConfidence: 0,
                  autoMethod: '',
                  autoUsable: false,
                  autoVerified: false,
                  autoExpected: 0,
                  photoGuess: 0,
                  autoOverlay: null,
                  autoTopCandidates: [],
                  autoBrief: '',
                  selectedAutoCandidate: 0,
                  photoZoom: 1,
                }));
              }}
              style={styles.photoButton}
            />
          </View>
        )}
        {!!state.autoCount && (
          <View style={[styles.autoResultBar, !autoUsable && styles.autoResultBarWarn, state.autoVerified && styles.autoResultBarVerified]}>
            <Text style={styles.autoResultText} numberOfLines={1}>
              How it counted
            </Text>
            <Text style={styles.autoResultSubText} numberOfLines={3}>
              {state.autoBrief || 'It centered the gear, trimmed the background, then counted the visible outer tooth peaks.'}
            </Text>
          </View>
        )}
        {!!state.photoStatus && !state.autoCount && <Text style={styles.photoStatus}>{state.photoStatus}</Text>}
      </ToolCard>

      )}

      <ToolButton
        label="Reset"
        secondary
        onPress={() => {
          setPhotoBase64('');
          setState(DEFAULTS);
        }}
        style={styles.resetButton}
      />
    </ToolScaffold>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  resultsCard: {
    paddingBottom: 5,
  },
  resultsGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  resultsGridTwo: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  miniResult: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: TOOL_CARD_2,
    borderWidth: 1,
    borderColor: TOOL_LINE_SOFT,
    justifyContent: 'center',
  },
  miniResultAccent: {
    backgroundColor: 'rgba(38,217,109,0.12)',
    borderColor: TOOL_LINE,
  },
  miniLabel: {
    color: TOOL_MUTED,
    fontWeight: '900',
    fontSize: 8,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  miniValue: {
    color: TOOL_TEXT,
    fontWeight: '900',
    fontSize: 14,
  },
  miniValueAccent: {
    color: TOOL_GREEN,
    fontSize: 15,
  },
  miniNote: {
    color: TOOL_MUTED,
    fontWeight: '800',
    fontSize: 8,
    marginTop: 0,
  },
  photoWrap: {
    height: 170,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: TOOL_LINE_SOFT,
    overflow: 'hidden',
    marginBottom: 7,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoWrapZoom: {
    height: 218,
    backgroundColor: '#050906',
  },
  zoomRail: {
    position: 'absolute',
    right: 8,
    top: 10,
    gap: 6,
  },
  zoomButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(3,14,8,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(38,217,109,0.34)',
  },
  zoomButtonText: {
    color: TOOL_GREEN,
    fontWeight: '900',
    fontSize: 18,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: -1,
  },
  autoCandidateRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    marginBottom: 2,
  },
  autoCandidateChip: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TOOL_LINE,
    backgroundColor: TOOL_CARD_2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  autoCandidateChipPrimary: {
    borderColor: TOOL_GREEN,
    backgroundColor: 'rgba(46, 220, 115, 0.12)',
  },
  autoCandidateChipSelected: {
    backgroundColor: 'rgba(46, 220, 115, 0.18)',
    borderWidth: 1.4,
  },
  autoCandidateTooth: {
    color: TOOL_TEXT,
    fontWeight: '900',
    fontSize: 14,
    lineHeight: 16,
  },
  autoCandidateToothPrimary: {
    color: TOOL_GREEN,
  },
  autoCandidatePercent: {
    color: TOOL_MUTED,
    fontWeight: '800',
    fontSize: 10,
    lineHeight: 12,
    marginTop: 1,
  },
  autoCandidatePercentPrimary: {
    color: TOOL_TEXT,
  },
  autoCandidateTap: {
    color: TOOL_MUTED,
    fontWeight: '800',
    fontSize: 9,
    lineHeight: 11,
    marginTop: 1,
  },
  zoomBadge: {
    position: 'absolute',
    left: 8,
    top: 8,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(3,14,8,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(38,217,109,0.34)',
  },
  zoomBadgeText: {
    color: TOOL_GREEN,
    fontWeight: '900',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
  },
  photoButtonsSecond: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    marginTop: 7,
  },
  photoButton: {
    flex: 1,
    minHeight: 32,
  },
  photoSmallButton: {
    width: 62,
    minHeight: 34,
  },
  autoResultBar: {
    minHeight: 28,
    borderRadius: 9,
    paddingHorizontal: 8,
    marginTop: 7,
    justifyContent: 'center',
    backgroundColor: 'rgba(38,217,109,0.10)',
    borderWidth: 1,
    borderColor: TOOL_LINE,
  },
  autoResultText: {
    color: TOOL_GREEN,
    fontWeight: '900',
    fontSize: 12,
  },
  autoResultSubText: {
    color: TOOL_MUTED,
    fontWeight: '900',
    fontSize: 10,
    marginTop: 1,
  },
  autoResultBarWarn: {
    backgroundColor: 'rgba(255,214,102,0.09)',
    borderColor: 'rgba(255,214,102,0.38)',
  },
  autoResultBarVerified: {
    backgroundColor: 'rgba(38,217,109,0.12)',
    borderColor: TOOL_LINE,
  },
  photoStatus: {
    color: TOOL_GREEN,
    fontWeight: '900',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 5,
  },
  pitchGroupLabel: {
    color: TOOL_MUTED,
    fontWeight: '900',
    fontSize: 10,
    marginTop: 2,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },
  pitchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 4,
  },
  pitchChip: {
    minHeight: 26,
    minWidth: 50,
    flexGrow: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(244,255,248,0.10)',
  },
  pitchChipSelected: {
    backgroundColor: TOOL_GREEN,
    borderColor: TOOL_GREEN,
  },
  pitchChipText: {
    color: TOOL_MUTED,
    fontWeight: '900',
    fontSize: 11,
  },
  pitchChipTextSelected: {
    color: '#04110a',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  col: {
    flex: 1,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  counter: {
    width: 64,
    minHeight: 50,
    borderRadius: 10,
    overflow: 'hidden',
    color: TOOL_GREEN,
    backgroundColor: 'rgba(38,217,109,0.08)',
    borderWidth: 1,
    borderColor: TOOL_LINE,
    fontSize: 35,
    lineHeight: 48,
    fontWeight: '900',
    textAlign: 'center',
  },
  counterButtons: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  plusButton: {
    flexBasis: '100%',
    minHeight: 32,
  },
  smallButton: {
    flex: 1,
    minHeight: 30,
  },
  experimentToggleCard: {
    paddingBottom: 7,
  },
  experimentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  experimentTextWrap: {
    flex: 1,
  },
  experimentTitle: {
    color: TOOL_TEXT,
    fontWeight: '900',
    fontSize: 13,
  },
  experimentSubText: {
    color: TOOL_MUTED,
    fontWeight: '800',
    fontSize: 9,
    lineHeight: 12,
    marginTop: 2,
  },
  experimentToggleButton: {
    width: 82,
    minHeight: 32,
  },
  resetButton: {
    minHeight: 34,
    marginBottom: 2,
  },
});
