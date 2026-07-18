import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { setupStyles } from '../styles/setupStyles';

const TAB_META = {
  Gearing: { label: 'Gearing', code: 'G' },
  Tires: { label: 'Tires', code: 'T' },
  Suspension: { label: 'Suspension', code: 'S' },
  Geometry: { label: 'Geometry', code: 'Geo' },
  'Corner Weights': { label: 'Weights', code: 'W' },
  Results: { label: 'Results', code: 'R' },
  History: { label: 'History', code: 'H' },
};

export default function SetupTabBar({ tabs, activeTab, onChange }) {
  const scrollRef = useRef(null);
  const activeIndex = Math.max(0, tabs.indexOf(activeTab));
  const activeLabel = TAB_META[activeTab]?.label || activeTab;

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: Math.max(0, activeIndex * 88 - 18), animated: true });
  }, [activeIndex]);

  const renderedTabs = useMemo(() => tabs.map((tab) => TAB_META[tab] || { label: tab, code: tab.slice(0, 1) }), [tabs]);

  return (
    <View style={setupStyles.modernTabShell}>
      <View style={setupStyles.modernTabTopRow}>
        <Text style={setupStyles.modernTabCaption}>SETUP SECTIONS</Text>
        <Text numberOfLines={1} style={setupStyles.modernTabCurrent}>{activeLabel}</Text>
      </View>

      <View style={setupStyles.modernTabFrame}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={setupStyles.modernTabScrollContent}
        >
          {tabs.map((tab, index) => {
            const active = tab === activeTab;
            const meta = renderedTabs[index];

            return (
              <Pressable
                key={tab}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onChange(tab)}
                style={({ pressed }) => [
                  setupStyles.modernTabPill,
                  active && setupStyles.modernTabPillActive,
                  pressed && setupStyles.modernTabPillPressed,
                ]}
              >
                <View style={[setupStyles.modernTabCodeWrap, active && setupStyles.modernTabCodeWrapActive]}>
                  <Text style={[setupStyles.modernTabCode, active && setupStyles.modernTabCodeActive]}>{meta.code}</Text>
                </View>

                <Text numberOfLines={1} style={[setupStyles.modernTabText, active && setupStyles.modernTabTextActive]}>
                  {meta.label}
                </Text>

                {active ? <View style={setupStyles.modernTabGlowDot} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
