// src/dashboard/components/RaceDayHistoryButton.js
import { Text, TouchableOpacity } from 'react-native';
import { dashboardStyles as styles } from '../dashboard.styles';

export default function RaceDayHistoryButton({ onPress, style }) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[
        styles.bottomButton,
        {
          minHeight: 38,
          marginTop: 6,
          borderTopColor: '#22C55E',
          borderTopWidth: 2,
        },
        style,
      ]}
    >
      <Text style={styles.bottomButtonText}>RaceDay History</Text>
    </TouchableOpacity>
  );
}
