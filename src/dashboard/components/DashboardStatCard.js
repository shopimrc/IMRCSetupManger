// src/dashboard/components/DashboardStatCard.js
import { Text, TouchableOpacity, View } from 'react-native';
import { dashboardStyles as styles } from '../dashboard.styles';

export default function DashboardStatCard({ label, value, icon, color, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[styles.statCard, { borderTopColor: color, borderTopWidth: 2 }]}
    >
      <View>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <View style={[styles.statIconBubble, { backgroundColor: color }]}>
        <Text style={styles.statIcon}>{icon}</Text>
      </View>
    </TouchableOpacity>
  );
}
