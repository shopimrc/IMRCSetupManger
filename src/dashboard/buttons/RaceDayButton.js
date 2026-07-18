// src/dashboard/buttons/RaceDayButton.js
import { Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { dashboardStyles as styles } from '../dashboard.styles';

export default function RaceDayButton({ raceDayReady, onPress, style, gradientStyle, textStyle, iconStyle, arrowStyle }) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={[styles.raceDayButton, style]}>
      <LinearGradient colors={['#111827', '#121A26']} style={[styles.raceDayGradient, gradientStyle]}>
        <Text style={[styles.raceDayIcon, iconStyle]}>{raceDayReady ? '⏱️' : '🏁'}</Text>
        <Text style={[styles.raceDayText, textStyle]}>{raceDayReady ? 'Cont. Race Day' : 'Start Race Day'}</Text>
        <Text style={[styles.raceDayArrow, arrowStyle]}>›</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}
