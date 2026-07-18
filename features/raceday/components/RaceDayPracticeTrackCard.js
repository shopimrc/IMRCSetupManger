import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { raceDayColors, raceDayStyles } from '../styles/raceDayStyles';

export default function RaceDayPracticeTrackCard({
  raceDay,
  trackName = '',
  vehicleCount = 0,
  practiceDayLabel = '',
  onSelectPracticeDay,
  onRefreshPractice,
  refreshing = false,
}) {
  const startedLabel = raceDay?.startedAt ? new Date(raceDay.startedAt).toLocaleDateString() : new Date().toLocaleDateString();
  const dayLabel = practiceDayLabel || 'Select Practice Date';

  return (
    <View style={raceDayStyles.card}>
      <View style={raceDayStyles.cardAccent} />
      <View style={raceDayStyles.raceDayTrackCardLayout}>
        <View style={raceDayStyles.flex1}>
          <Text style={raceDayStyles.cardTitle}>{trackName}</Text>
          <Text style={raceDayStyles.cardSub} numberOfLines={1}>
            {startedLabel} • {vehicleCount} vehicle{vehicleCount === 1 ? '' : 's'}
          </Text>
          <Text style={raceDayStyles.dashboardEventDate} numberOfLines={1}>
            {dayLabel}
          </Text>
        </View>

        <View style={raceDayStyles.raceDayTrackCardActions}>
          <TouchableOpacity
            style={raceDayStyles.changeEventButton}
            onPress={onSelectPracticeDay}
            activeOpacity={0.82}
          >
            <Text style={raceDayStyles.changeEventButtonText}>Change Date</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[raceDayStyles.pill, { borderColor: raceDayColors.accent }, refreshing && { opacity: 0.55 }]}
            onPress={onRefreshPractice}
            disabled={refreshing}
            activeOpacity={0.82}
          >
            {refreshing ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={[raceDayStyles.pillText, { color: raceDayColors.text }]}>Refresh</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export { RaceDayPracticeTrackCard };
