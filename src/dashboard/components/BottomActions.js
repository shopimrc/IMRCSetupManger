// src/dashboard/components/BottomActions.js
import { Text, TouchableOpacity, View } from 'react-native';
import { dashboardStyles as styles } from '../dashboard.styles';

export default function BottomActions({ router, style, buttonStyle }) {
  return (
    <View style={[styles.bottomActions, style]}>
      <TouchableOpacity style={[styles.bottomButton, styles.toolsButton, buttonStyle]} onPress={() => router.push('/tools')} activeOpacity={0.9}>
        <Text style={styles.bottomButtonText}>Tools</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.bottomButton, styles.supportButton, buttonStyle]} onPress={() => router.push('/support')} activeOpacity={0.9}>
        <Text style={styles.bottomButtonText}>Support</Text>
      </TouchableOpacity>
    </View>
  );
}
