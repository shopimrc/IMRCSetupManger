import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RaceDayHeader from '../../features/raceday/components/RaceDayHeader';
import { getTracks, startRaceDayWithTrack } from '../../features/raceday/lib/raceDayStorage';
import { getTrackDisplayName, getTrackLiveRcUrl } from '../../features/raceday/lib/raceDayModel';
import { raceDayStyles } from '../../features/raceday/styles/raceDayStyles';

export default function RaceDaySelectTrackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tracks, setTracks] = useState([]);
  const [selectingTrackId, setSelectingTrackId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const nextTracks = await getTracks();
    setTracks(nextTracks);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleSelectTrack(trackId) {
    if (!trackId || selectingTrackId) return;
    setSelectingTrackId(trackId);
    try {
      await startRaceDayWithTrack(trackId);
      router.push('/raceday/select-vehicles');
    } finally {
      setSelectingTrackId(null);
    }
  }

  return (
    <View style={raceDayStyles.screen}>
      <View style={raceDayStyles.container}>
        <RaceDayHeader title="Select Track" subtitle="Tap a track to continue" onLeftPress={() => router.back()} />
        {loading ? (
          <View style={raceDayStyles.empty}><ActivityIndicator /></View>
        ) : (
          <ScrollView contentContainerStyle={[raceDayStyles.scrollContent, { paddingBottom: Math.max(insets.bottom + 28, 52) }]} showsVerticalScrollIndicator={false}>
            {tracks.length ? tracks.map((track) => {
              const id = track.id || track.trackId;
              const selecting = String(id) === String(selectingTrackId);
              return (
                <TouchableOpacity
                  key={String(id)}
                  style={[raceDayStyles.card, selecting && raceDayStyles.softSelectedCard]}
                  onPress={() => handleSelectTrack(id)}
                  activeOpacity={0.86}
                  disabled={!!selectingTrackId}
                >
                  <View style={raceDayStyles.cardAccent} />
                  <View style={raceDayStyles.rowBetween}>
                    <View style={raceDayStyles.flex1}>
                      <Text style={raceDayStyles.cardTitle}>{getTrackDisplayName(track)}</Text>
                      <Text style={raceDayStyles.cardSub}>
                        {[track.city, track.state, track.surface].filter(Boolean).join(' • ') || 'Race track'}
                      </Text>
                      <Text style={raceDayStyles.cardSub} numberOfLines={1}>
                        LiveRC: {getTrackLiveRcUrl(track) || 'Not saved yet'}
                      </Text>
                    </View>
                    <View style={selecting ? [raceDayStyles.pill, raceDayStyles.selectedPill] : raceDayStyles.pill}>
                      <Text style={selecting ? [raceDayStyles.pillText, raceDayStyles.selectedPillText] : raceDayStyles.pillText}>
                        {selecting ? 'Opening' : 'Start'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }) : (
              <View style={raceDayStyles.empty}>
                <Text style={raceDayStyles.emptyText}>No tracks are saved yet. Add a Track first, then start Race Day.</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
