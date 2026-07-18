// src/dashboard/components/StatCard.js
import { Text, TouchableOpacity, View } from 'react-native';
import { dashboardStyles as styles } from '../dashboard.styles';

export default function StatCard({ label, count, icon, color, onPress, cardStyle, valueStyle, iconBubbleStyle }) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.statCard, { borderLeftColor: color, borderLeftWidth: 4, borderTopColor: color, borderTopWidth: 0 }, cardStyle]}
    >
      <View style={styles.statTextBlock}>
        <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
        <Text style={[styles.statValue, valueStyle]} numberOfLines={1}>{count}</Text>
      </View>

      <View style={[styles.statIconBubble, { backgroundColor: color }, iconBubbleStyle]}>
        <Text style={styles.statIcon}>{icon}</Text>
      </View>
    </TouchableOpacity>
  );
}
