// src/dashboard/components/ContinueRaceDayButton.js
import { Text, TouchableOpacity, View } from 'react-native';
import { dashboardStyles as styles } from '../dashboard.styles';

export default function ContinueRaceDayButton({ hasActiveRaceDay, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.continueButton}>
      <View style={styles.continueLeft}>
        <Text style={styles.continueIcon}>{hasActiveRaceDay ? '⏱️' : '🏁'}</Text>
        <Text style={styles.continueText}>{hasActiveRaceDay ? 'Cont. Race Day' : 'Start Race Day'}</Text>
      </View>
      <Text style={styles.continueArrow}>›</Text>
    </TouchableOpacity>
  );
}
