// features/tools/ToolsHomeScreen.js
// Tools dashboard styled to match the main IMRC app card/header style.

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TOOL_GREEN,
  TOOL_MUTED,
  TOOL_TEXT,
  goBack,
  navigateTo,
} from './ToolShared';
import { calculateRollout } from './lib/rolloutMath';

const ROLLOUT_KEYS = [
  '@imrcToolsRollout_v5_targetChart',
  '@imrcToolsRollout_v4_inchesDefault',
];

const SCALE_KEY = '@imrcToolsRaceScale_v1';
const OZ_TO_G = 28.349523125;

const TOOLS = [
  { title: 'Rollout', route: '/tools/rollout', icon: 'RO', desc: 'FDR, rollout, target pinion', statKey: 'rollout' },
  { title: 'Gear Counter', route: '/tools/gears', icon: 'GT', desc: 'Tap teeth or estimate count' },
  { title: 'Scale / Weights', route: '/tools/scale', icon: 'WT', desc: 'Total, cross, left/right, front/rear', statKey: 'scale' },
  { title: 'Camber Gauge', route: '/tools/camber', icon: 'CG', desc: 'Live phone camber gauge' },
  { title: 'Tuning Assistant', route: '/tools/tuning', icon: 'TA', desc: 'Source-backed turn solver' },
  { title: 'Track Near Me', route: '/tools/near-me', icon: 'TM', desc: 'IMRC Track Database + maps' },
];

function num(value) {
  const n = Number(String(value ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function readFirstJson(keys) {
  for (const key of keys) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      return JSON.parse(raw);
    } catch (error) {
      // Keep trying older keys.
    }
  }
  return null;
}

function gramsFromStateValue(value, unit) {
  const n = num(value);
  if (!n) return 0;
  return unit === 'oz' ? n * OZ_TO_G : n;
}

function scaleWeightGrams(state, key) {
  const gramsKey = `${key}G`;
  if (state?.[gramsKey]) return num(state[gramsKey]);
  return gramsFromStateValue(state?.[key], state?.unit || 'g');
}

function buildScaleStat(state) {
  const lf = scaleWeightGrams(state, 'lf');
  const rf = scaleWeightGrams(state, 'rf');
  const lr = scaleWeightGrams(state, 'lr');
  const rr = scaleWeightGrams(state, 'rr');
  const total = lf + rf + lr + rr;

  if (total <= 0) return 'Cross —';

  const cross = rf + lr;
  return `Cross ${((cross / total) * 100).toFixed(1)}%`;
}

function buildRolloutStat(state) {
  if (!state) return 'Rollout —';

  const tireUnit = state.tireUnit === 'mm' ? 'mm' : 'in';
  const result = calculateRollout({
    tireDiameter: state.tireDiameter,
    tireUnit,
    pinion: state.pinion,
    spur: state.spur,
    internalRatio: state.internalRatio,
  });

  if (!result?.rolloutMm || Number(result.rolloutMm) <= 0) return 'Rollout —';

  return tireUnit === 'mm'
    ? `Rollout ${result.rolloutMm} mm`
    : `Rollout ${result.rolloutIn} in`;
}

export default function ToolsHomeScreen(props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const isShort = height < 720;

  const [stats, setStats] = useState({
    rollout: 'Rollout —',
    scale: 'Cross —',
  });

  const loadStats = useCallback(async () => {
    const [rolloutState, scaleRaw] = await Promise.all([
      readFirstJson(ROLLOUT_KEYS),
      AsyncStorage.getItem(SCALE_KEY).catch(() => null),
    ]);

    let scaleState = null;
    try {
      scaleState = scaleRaw ? JSON.parse(scaleRaw) : null;
    } catch (error) {
      scaleState = null;
    }

    setStats({
      rollout: buildRolloutStat(rolloutState),
      scale: buildScaleStat(scaleState),
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      await loadStats();
    };

    run();

    let unsubscribe = null;
    if (props?.navigation?.addListener) {
      unsubscribe = props.navigation.addListener('focus', run);
    }

    return () => {
      mounted = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [loadStats, props?.navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={styles.safe.backgroundColor} />

      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            onPress={() => goBack(props)}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <View style={styles.titleBlock}>
            <Text style={styles.kicker}>TOOLS</Text>
            <Text style={styles.title}>Tools</Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>Race day calculators, gauges, and helpers.</Text>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{TOOLS.length} tools</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            isLandscape && styles.gridLandscape,
            { paddingBottom: Math.max(insets.bottom + 12, 24) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {TOOLS.map((tool) => {
            const stat = tool.statKey ? stats[tool.statKey] : null;

            return (
              <Pressable
                key={tool.route}
                onPress={() => navigateTo(props, tool.route)}
                style={({ pressed }) => [
                  styles.card,
                  isShort && styles.cardShort,
                  isLandscape && styles.cardLandscape,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.leftAccent} />

                <View style={styles.cardBody}>
                  <View style={styles.mainText}>
                    <View style={styles.titleRow}>
                      <Text style={styles.toolTitle} numberOfLines={1}>{tool.title}</Text>
                      {!!stat && (
                        <View style={styles.statPill}>
                          <Text style={styles.statText} numberOfLines={1}>{stat}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.desc} numberOfLines={1}>{tool.desc}</Text>
                  </View>

                  <View style={styles.rightBadge}>
                    <Text style={styles.badgeTop}>{tool.icon}</Text>
                    <Text style={styles.badgeArrow}>›</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const CARD_BG = '#111823';
const CARD_BORDER = '#263245';
const TOOL_GREEN_SOFT = 'rgba(38,217,109,0.16)';
const TOOL_GREEN_LINE = 'rgba(38,217,109,0.72)';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#05070b',
  },
  screen: {
    flex: 1,
    backgroundColor: '#05070b',
    paddingHorizontal: 23,
  },

  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    minWidth: 72,
    minHeight: 36,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101722',
    borderWidth: 1,
    borderColor: '#263245',
  },
  backText: {
    color: TOOL_TEXT,
    fontSize: 13,
    fontWeight: '900',
  },
  titleBlock: {
    flex: 1,
    justifyContent: 'center',
  },
  kicker: {
    color: TOOL_GREEN,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  title: {
    color: TOOL_TEXT,
    fontSize: 22,
    lineHeight: 25,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  headerSpacer: {
    width: 72,
  },

  summaryRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 8,
  },
  summaryText: {
    flex: 1,
    color: '#b8c1d2',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  countPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(38,217,109,0.08)',
    borderWidth: 1,
    borderColor: TOOL_GREEN_LINE,
  },
  countText: {
    color: TOOL_TEXT,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 8,
    paddingTop: 2,
  },
  gridLandscape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  card: {
    minHeight: 68,
    borderRadius: 13,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
  },
  cardShort: {
    minHeight: 62,
  },
  cardLandscape: {
    width: '49%',
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  leftAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: TOOL_GREEN,
  },
  cardBody: {
    flex: 1,
    minHeight: 68,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mainText: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 2,
  },
  toolTitle: {
    color: TOOL_TEXT,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    letterSpacing: -0.25,
  },
  statPill: {
    maxWidth: 128,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(38,217,109,0.09)',
    borderWidth: 1,
    borderColor: TOOL_GREEN_LINE,
  },
  statText: {
    color: TOOL_TEXT,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
  },
  desc: {
    color: TOOL_MUTED,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '800',
  },

  rightBadge: {
    minWidth: 62,
    minHeight: 42,
    borderRadius: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOOL_GREEN_SOFT,
    borderWidth: 1,
    borderColor: TOOL_GREEN_LINE,
  },
  badgeTop: {
    color: '#9fb0c4',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  badgeArrow: {
    color: TOOL_TEXT,
    fontSize: 17,
    lineHeight: 18,
    fontWeight: '900',
    marginTop: -1,
  },
});
