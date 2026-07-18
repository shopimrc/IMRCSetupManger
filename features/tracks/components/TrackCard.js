// features/tracks/components/TrackCard.js

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { buildTrackLocation } from '../storage/trackStorage';
import { getTrackStyleAccent, trackStyles as styles } from '../styles/trackStyles';

function hasValue(value) {
  return Boolean(String(value || '').trim());
}

export default function TrackCard({ track, onPress }) {
  const location = buildTrackLocation(track) || 'Location not set';
  const trackStyle = hasValue(track.trackType) ? track.trackType : 'Track Type not set';
  const surface = hasValue(track.surface) ? track.surface : 'Surface not set';
  const styleAccent = getTrackStyleAccent(track.trackType, track.surface);

  const rightTop = hasValue(track.zipCode) ? 'ZIP' : 'TYPE';
  const rightBottom = hasValue(track.zipCode)
    ? track.zipCode
    : (track.trackType || '—');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.trackCard,
        pressed && styles.trackCardPressed,
      ]}
    >
      <View style={[styles.cardBlueBar, { backgroundColor: styleAccent.bar }]} />

      <View style={styles.cardLeft}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {track.trackName || 'Unnamed Track'}
        </Text>

        <View style={styles.cardStyleSurfaceRow}>
          <View
            style={[
              styles.cardStyleChip,
              {
                borderColor: styleAccent.border,
                backgroundColor: styleAccent.background,
              },
            ]}
          >
            <Text
              style={[
                styles.cardStyleChipText,
                { color: styleAccent.text },
              ]}
              numberOfLines={1}
            >
              {trackStyle}
            </Text>
          </View>

          <Text style={styles.cardSurfaceBrightText} numberOfLines={1}>
            {surface}
          </Text>
        </View>

        <Text style={styles.cardBottomLine} numberOfLines={1}>
          {location}
        </Text>
      </View>

      <View style={styles.cardRightPill}>
        <Text style={styles.cardRightLabel}>{rightTop}</Text>
        <Text style={styles.cardRightValue} numberOfLines={1}>
          {rightBottom}
        </Text>
      </View>
    </Pressable>
  );
}
