// src/dashboard/buttons/ToolsButton.js
import { Text, TouchableOpacity } from 'react-native';
import { AppColors } from '../../theme/colors';
import { dashboardStyles as styles } from '../dashboard.styles';
export default function ToolsButton({ onPress }) {
  return <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={[styles.bottomButton, { borderTopColor: AppColors.track, borderTopWidth: 2 }]}><Text style={styles.bottomButtonText}>Tools</Text></TouchableOpacity>;
}
