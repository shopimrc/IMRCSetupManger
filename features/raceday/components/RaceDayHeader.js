import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { raceDayStyles } from '../styles/raceDayStyles';

export default function RaceDayHeader({
  title = 'RaceDay',
  subtitle,
  leftLabel = '‹ Back',
  rightLabel,
  onLeftPress,
  onRightPress,
  rightTone = 'accent',
  topOffset = true,
}) {
  const insets = useSafeAreaInsets();
  const rightStyle = rightTone === 'danger'
    ? [raceDayStyles.headerActionButton, raceDayStyles.headerDangerButton]
    : raceDayStyles.headerActionButton;
  const rightTextStyle = rightTone === 'danger'
    ? [raceDayStyles.headerActionButtonText, raceDayStyles.headerDangerButtonText]
    : raceDayStyles.headerActionButtonText;

  return (
    <View style={[raceDayStyles.header, topOffset && { paddingTop: Math.max(insets.top + 8, 12) }]}> 
      <View style={raceDayStyles.headerSide}>
        {onLeftPress ? (
          <TouchableOpacity style={raceDayStyles.smallButton} onPress={onLeftPress} activeOpacity={0.82}>
            <Text style={raceDayStyles.smallButtonText}>{leftLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={raceDayStyles.titleWrap}>
        <Text style={raceDayStyles.eyebrow}>IMRC Setup Manager</Text>
        <Text style={raceDayStyles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={raceDayStyles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>

      <View style={[raceDayStyles.headerSide, raceDayStyles.headerSideRight]}>
        {rightLabel && onRightPress ? (
          <TouchableOpacity style={rightStyle} onPress={onRightPress} activeOpacity={0.82}>
            <Text style={rightTextStyle}>{rightLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export { RaceDayHeader };
