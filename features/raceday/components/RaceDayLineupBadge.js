import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function RaceDayLineupBadge({ lineup, style }) {
  const raceNumber = lineup?.raceNumber || lineup?.raceNo || lineup?.race;
  if (!raceNumber) return null;

  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.label}>RACE</Text>
      <Text style={styles.number}>{raceNumber}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 42,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: '#facc15',
    borderWidth: 1,
    borderColor: '#fde68a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#facc15',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    color: '#422006',
    letterSpacing: 0.4,
  },
  number: {
    marginTop: -1,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '900',
    color: '#111827',
  },
});
