// app/tracks/edit.js
// Compatibility route. The preferred Track edit flow is now the Vehicle-style bottom sheet in app/tracks/index.js.

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import TrackEditSheet from '../../features/tracks/components/TrackEditSheet';
import {
  deleteTrack,
  getTrackById,
  upsertTrack,
} from '../../features/tracks/storage/trackStorage';
import { openTrackSubmissionEmail } from '../../features/tracks/utils/trackSubmitEmail';
import { trackStyles as styles, TRACK_BLUE } from '../../features/tracks/styles/trackStyles';

const NEW_TRACK = {
  trackName: '',
  trackType: '',
  surface: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  phone: '',
  liveRcUrl: '',
  direction: '',
  tractionLevel: '',
  runLine: '',
  trackDimensions: '',
  notes: '',
};

export default function TrackEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const trackId = params?.trackId ? String(params.trackId) : null;

  const [track, setTrack] = useState(trackId ? null : NEW_TRACK);
  const [loading, setLoading] = useState(Boolean(trackId));
  const [saving, setSaving] = useState(false);

  const isNew = !trackId;

  const loadTrack = useCallback(async () => {
    if (!trackId) {
      setTrack(NEW_TRACK);
      setLoading(false);
      return;
    }

    setLoading(true);
    const savedTrack = await getTrackById(trackId);

    if (!savedTrack) {
      setLoading(false);
      Alert.alert('Track Not Found', 'This track could not be found in local storage.', [
        { text: 'OK', onPress: () => router.replace('/tracks') },
      ]);
      return;
    }

    setTrack(savedTrack);
    setLoading(false);
  }, [router, trackId]);

  useFocusEffect(
    useCallback(() => {
      loadTrack();
    }, [loadTrack])
  );

  async function handleSave(nextTrack) {
    try {
      setSaving(true);

      await upsertTrack({
        ...track,
        ...nextTrack,
        id: trackId || nextTrack.id,
      });

      setSaving(false);
      router.replace('/tracks');
    } catch (error) {
      setSaving(false);

      if (error.validationErrors) {
        Alert.alert('Missing Required Info', 'Track Name and Track Type are required.');
        return;
      }

      Alert.alert('Save Failed', 'The track could not be saved. Please try again.');
    }
  }

  async function handleDelete() {
    if (!trackId) return;

    try {
      await deleteTrack(trackId);
      router.replace('/tracks');
    } catch (error) {
      Alert.alert('Delete Failed', 'The track could not be deleted. Please try again.');
    }
  }

  function handleViewSetups() {
    if (!track) return;

    router.push({
      pathname: '/setups',
      params: {
        trackId: track.id,
        trackName: track.trackName,
        mode: 'track',
      },
    });
  }

  async function handleSubmitTrack(currentTrack) {
    try {
      await openTrackSubmissionEmail(currentTrack);
    } catch (error) {
      Alert.alert(
        'Email Not Opened',
        error.userMessage || 'The track submission email could not be opened.'
      );
    }
  }

  if (loading || !track) {
    return (
      <View style={styles.screen}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={TRACK_BLUE} />
          <Text style={styles.loadingText}>Loading track...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TrackEditSheet
        visible
        initialTrack={track}
        isNew={isNew}
        saving={saving}
        onCancel={() => router.replace('/tracks')}
        onSave={handleSave}
        onDelete={handleDelete}
        onViewSetups={handleViewSetups}
        onSubmitTrack={handleSubmitTrack}
      />
    </View>
  );
}
