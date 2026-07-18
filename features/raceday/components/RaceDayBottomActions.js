import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { raceDayStyles } from '../styles/raceDayStyles';

export default function RaceDayBottomActions({
  primaryLabel,
  secondaryLabel,
  tertiaryLabel,
  onPrimaryPress,
  onSecondaryPress,
  onTertiaryPress,
  primaryDisabled = false,
  secondaryDisabled = false,
  tertiaryDisabled = false,
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[raceDayStyles.bottomBar, { paddingBottom: Math.max(insets.bottom + 12, 18) }]}> 
      <View style={raceDayStyles.bottomRow}>
        {secondaryLabel ? (
          <TouchableOpacity
            style={[raceDayStyles.secondaryButton, raceDayStyles.flex1, secondaryDisabled && { opacity: 0.45 }]}
            onPress={secondaryDisabled ? undefined : onSecondaryPress}
            activeOpacity={0.82}
          >
            <Text style={raceDayStyles.secondaryButtonText} numberOfLines={1}>{secondaryLabel}</Text>
          </TouchableOpacity>
        ) : null}

        {tertiaryLabel ? (
          <TouchableOpacity
            style={[raceDayStyles.secondaryButton, raceDayStyles.flex1, tertiaryDisabled && { opacity: 0.45 }]}
            onPress={tertiaryDisabled ? undefined : onTertiaryPress}
            activeOpacity={0.82}
          >
            <Text style={raceDayStyles.secondaryButtonText} numberOfLines={1}>{tertiaryLabel}</Text>
          </TouchableOpacity>
        ) : null}

        {primaryLabel ? (
          <TouchableOpacity
            style={[raceDayStyles.primaryButton, raceDayStyles.flex1, primaryDisabled && { opacity: 0.45 }]}
            onPress={primaryDisabled ? undefined : onPrimaryPress}
            activeOpacity={0.82}
          >
            <Text style={raceDayStyles.primaryButtonText} numberOfLines={1}>{primaryLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export { RaceDayBottomActions };
