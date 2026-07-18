// src/dashboard/components/DashboardLogo.js
import { Text, View } from 'react-native';
import { dashboardStyles as styles } from '../dashboard.styles';

export default function DashboardLogo({ userName = 'Josh', synced = true }) {
  return (
    <View style={styles.logoWrap}>
      <View style={styles.userPill}>
        <Text style={styles.userPillText}>{userName}</Text>
      </View>
      <View style={[styles.syncDot, synced ? null : { backgroundColor: '#EF4444' }]} />
      <Text style={styles.logoText}>IMRC</Text>
      <Text style={styles.logoSubText}>SETUP MANAGER</Text>
    </View>
  );
}
