import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { raceDayColors } from '../styles/raceDayStyles';

export default function RaceDayModeToggle({ mode = 'race', onChange }) {
  const activeMode = mode === 'practice' ? 'practice' : 'race';

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.button, activeMode === 'race' && styles.activeButton]}
        onPress={() => onChange?.('race')}
        activeOpacity={0.84}
      >
        <Text style={[styles.buttonText, activeMode === 'race' && styles.activeButtonText]}>Race</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, activeMode === 'practice' && styles.activeButton]}
        onPress={() => onChange?.('practice')}
        activeOpacity={0.84}
      >
        <Text style={[styles.buttonText, activeMode === 'practice' && styles.activeButtonText]}>Practice</Text>
      </TouchableOpacity>
    </View>
  );
}

export { RaceDayModeToggle };

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 4,
    padding: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    backgroundColor: raceDayColors.cardAlt,
    marginBottom: 8,
  },
  button: {
    flex: 1,
    minHeight: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeButton: {
    backgroundColor: raceDayColors.accentSoft,
    borderColor: raceDayColors.accent,
  },
  buttonText: {
    color: raceDayColors.muted,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.75,
  },
  activeButtonText: {
    color: raceDayColors.text,
  },
});
