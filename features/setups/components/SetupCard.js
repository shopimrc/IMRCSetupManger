import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { setupStyles } from '../styles/setupStyles';

function formatDate(value) {
  if (!value) return 'Not saved yet';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function SetupCard({ setup, onPress, rightLabel }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [setupStyles.card, setupStyles.cardList, pressed && setupStyles.cardPressed]}
    >
      <View style={setupStyles.cardAccent} />
      <View style={setupStyles.headerRow}>
        <View style={setupStyles.headerTextWrap}>
          <Text style={setupStyles.cardTitle}>{setup?.vehicleName || 'Vehicle Setup'}</Text>
          <Text style={setupStyles.cardSubtitle}>{setup?.trackName || 'Track'} • Saved {formatDate(setup?.savedAt || setup?.updatedAt)}</Text>
        </View>
        {rightLabel ? (
          <View style={setupStyles.badge}>
            <Text style={setupStyles.badgeText}>{rightLabel}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
