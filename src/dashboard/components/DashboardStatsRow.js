// src/dashboard/components/DashboardStatsRow.js
import { View } from 'react-native';
import { AppColors } from '../../theme/colors';
import { dashboardStyles as styles } from '../dashboard.styles';
import VehicleButton from '../buttons/VehicleButton';
import TrackButton from '../buttons/TrackButton';
import SetupsButton from '../buttons/SetupsButton';

export default function DashboardStatsRow({ counts, router }) {
  return (
    <View style={styles.statsRow}>
      <VehicleButton count={counts.vehicles} onPress={() => router.push('/vehicles')} />
      <TrackButton count={counts.tracks} onPress={() => router.push('/tracks')} />
      <SetupsButton count={counts.setups} onPress={() => router.push('/setups')} />
    </View>
  );
}
