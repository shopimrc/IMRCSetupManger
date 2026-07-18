import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { setupStyles } from '../styles/setupStyles';

export default function SelectorCard({ title, subtitle, meta, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [setupStyles.card, setupStyles.cardList, pressed && setupStyles.cardPressed]}
    >
      <View style={setupStyles.cardAccent} />
      <View style={setupStyles.headerRow}>
        <View style={setupStyles.headerTextWrap}>
          <Text style={setupStyles.cardTitle}>{title}</Text>
          {subtitle ? <Text style={setupStyles.cardSubtitle}>{subtitle}</Text> : null}
        </View>
        {meta ? (
          <View style={setupStyles.badge}>
            <Text style={setupStyles.badgeText}>{meta}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
