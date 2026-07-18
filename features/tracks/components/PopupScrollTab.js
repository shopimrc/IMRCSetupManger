// features/tracks/components/PopupScrollTab.js

import React, { useMemo } from 'react';
import { Animated, View } from 'react-native';

import { trackStyles as styles } from '../styles/trackStyles';

export default function PopupScrollTab({
  scrollY,
  visibleHeight,
  contentHeight,
  style,
}) {
  const shouldShow = contentHeight > visibleHeight + 12;

  const metrics = useMemo(() => {
    const trackHeight = Math.max(44, visibleHeight || 0);
    const scrollableHeight = Math.max(1, contentHeight - visibleHeight);
    const thumbHeight = Math.max(
      28,
      Math.min(trackHeight, (visibleHeight / Math.max(contentHeight, 1)) * trackHeight)
    );
    const maxTranslate = Math.max(0, trackHeight - thumbHeight);

    return {
      trackHeight,
      scrollableHeight,
      thumbHeight,
      maxTranslate,
    };
  }, [visibleHeight, contentHeight]);

  if (!shouldShow) return null;

  const translateY = scrollY.interpolate({
    inputRange: [0, metrics.scrollableHeight],
    outputRange: [0, metrics.maxTranslate],
    extrapolate: 'clamp',
  });

  return (
    <View pointerEvents="none" style={[styles.movingScrollTabTrack, style, { height: metrics.trackHeight }]}>
      <Animated.View
        style={[
          styles.movingScrollTabThumb,
          {
            height: metrics.thumbHeight,
            transform: [{ translateY }],
          },
        ]}
      />
    </View>
  );
}
