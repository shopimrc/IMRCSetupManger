// src/dashboard/buttons/SupportButton.js
import { Text, TouchableOpacity } from 'react-native';
import { AppColors } from '../../theme/colors';
import { dashboardStyles as styles } from '../dashboard.styles';
export default function SupportButton({ onPress }) {
  return <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={[styles.bottomButton, { borderTopColor: AppColors.raceDay, borderTopWidth: 2 }]}><Text style={styles.bottomButtonText}>Support</Text></TouchableOpacity>;
}
