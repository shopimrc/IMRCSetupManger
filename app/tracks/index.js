// app/tracks/index.js

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TrackCard from '../../features/tracks/components/TrackCard';
import TrackEditSheet from '../../features/tracks/components/TrackEditSheet';
import TrackImportSheet from '../../features/tracks/components/TrackImportSheet';
import TrackMergeSheet from '../../features/tracks/components/TrackMergeSheet';
import {
  deleteTrack,
  getTracks,
  mergeTracksWithSetups,
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

export default function TracksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [mergeVisible, setMergeVisible] = useState(false);
  const [editingTrack, setEditingTrack] = useState(null);
  const [saving, setSaving] = useState(false);
  const [merging, setMerging] = useState(false);

  const isLandscape = width > height;
  const isNew = !editingTrack?.id;

  const trackDashboardSafeContent = {
    paddingTop: Math.max(insets.top + 10, isLandscape ? 14 : 18),
    paddingBottom: Math.max(insets.bottom + 14, 24),
  };

  const trackLoadingSafeContent = {
    paddingTop: Math.max(insets.top, 0),
    paddingBottom: Math.max(insets.bottom, 0),
  };

  const loadTracks = useCallback(async () => {
    setLoading(true);
    const savedTracks = await getTracks();
    setTracks(savedTracks);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTracks();
    }, [loadTracks])
  );

  function openTrack(track) {
    setEditingTrack(track);
    setSheetVisible(true);
  }

  function addTrack() {
    setEditingTrack({ ...NEW_TRACK });
    setSheetVisible(true);
  }

  function closeSheet() {
    setSheetVisible(false);
    setEditingTrack(null);
    setSaving(false);
  }

  async function saveTrack(nextTrack) {
    try {
      setSaving(true);
      const savedTrack = await upsertTrack({
        ...editingTrack,
        ...nextTrack,
        id: editingTrack?.id || nextTrack.id,
      });

      await loadTracks();
      setSaving(false);
      setEditingTrack(savedTrack);
      setSheetVisible(false);
    } catch (error) {
      setSaving(false);

      if (error.validationErrors) {
        Alert.alert('Missing Required Info', 'Track Name and Track Type are required.');
        return;
      }

      Alert.alert('Save Failed', 'The track could not be saved. Please try again.');
    }
  }

  async function removeTrack() {
    if (!editingTrack?.id) return;

    try {
      await deleteTrack(editingTrack.id);
      await loadTracks();
      closeSheet();
    } catch (error) {
      Alert.alert('Delete Failed', 'The track could not be deleted. Please try again.');
    }
  }

  function viewSetups() {
    if (!editingTrack?.id) return;

    setSheetVisible(false);

    router.push({
      pathname: '/setups',
      params: {
        trackId: editingTrack.id,
        trackName: editingTrack.trackName,
        mode: 'track',
      },
    });
  }

  function openMergeSheet() {
    if (!editingTrack?.id) return;

    setSheetVisible(false);
    setMergeVisible(true);
  }

  function closeMergeSheet() {
    setMergeVisible(false);
    setMerging(false);

    if (editingTrack?.id) {
      setSheetVisible(true);
    }
  }

  async function handleMergeTrack(targetTrack) {
    if (!editingTrack?.id || !targetTrack?.id) return;

    try {
      setMerging(true);

      const mergeResult = await mergeTracksWithSetups({
        sourceTrackId: editingTrack.id,
        targetTrackId: targetTrack.id,
      });

      await loadTracks();

      setMerging(false);
      setMergeVisible(false);
      setEditingTrack(mergeResult.targetTrack);
      setSheetVisible(true);

      Alert.alert(
        'Tracks Merged',
        `${mergeResult.sourceTrack.trackName} was merged into ${mergeResult.targetTrack.trackName}.\n\nSetup storage updated: ${mergeResult.setupValuesUpdated || 0} setup reference${mergeResult.setupValuesUpdated === 1 ? '' : 's'}.`
      );
    } catch (error) {
      setMerging(false);
      Alert.alert(
        'Merge Failed',
        error.userMessage || 'The tracks could not be merged. Please try again.'
      );
    }
  }

  async function submitTrack(track) {
    try {
      await openTrackSubmissionEmail(track);
    } catch (error) {
      Alert.alert(
        'Email Not Opened',
        error.userMessage || 'The track submission email could not be opened.'
      );
    }
  }

  function openImportSheet() {
    setImportVisible(true);
  }

  function closeImportSheet() {
    setImportVisible(false);
  }

  async function handleImportedTrack(savedTrack) {
    setImportVisible(false);
    await loadTracks();

    // Open the newly imported track so the user can review it immediately.
    setEditingTrack(savedTrack);
    setSheetVisible(true);
  }

  function openSubmitTrackScreen() {
    setImportVisible(false);
    router.push('/tracks/submit');
  }

  function goBack() {
    router.back();
  }

  if (loading) {
    return (
      <View style={[styles.screen, trackLoadingSafeContent]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={TRACK_BLUE} />
          <Text style={styles.loadingText}>Loading tracks...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.screenContent,
          isLandscape && styles.screenContentLandscape,
          trackDashboardSafeContent,
        ]}
      >
        <View style={styles.vehicleLikeHeader}>
          <View style={styles.headerTopRow}>
            <Pressable
              onPress={goBack}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.headerButtonText}>‹ Back</Text>
            </Pressable>

            <View style={styles.headerTitleWrap}>
              <Text style={styles.appLabel}>IMRC SETUP MANAGER</Text>
              <Text style={styles.pageTitle}>Tracks</Text>
            </View>

            <Pressable
              onPress={addTrack}
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </Pressable>
          </View>

          <Text style={styles.pageSubtitle}>
            Saved tracks are the foundation for Setups and Race Day. Add the track name, type, surface, location, and LiveRC info.
          </Text>

          <View style={styles.headerToolsRow}>
            <View style={styles.savedCountPill}>
              <Text style={styles.savedCountText}>
                {tracks.length} saved {tracks.length === 1 ? 'track' : 'tracks'}
              </Text>
            </View>

            <Pressable
              onPress={openImportSheet}
              style={({ pressed }) => [
                styles.headerImportButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.headerImportButtonText}>⬇ Import</Text>
            </Pressable>

            <Pressable
              onPress={openSubmitTrackScreen}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.headerButtonText}>Submit</Text>
            </Pressable>
          </View>
        </View>

        {tracks.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <View style={styles.emptyPlusCircle}>
              <Text style={styles.emptyPlusText}>+</Text>
            </View>

            <Text style={styles.emptyStateTitle}>No saved tracks yet</Text>

            <Text style={styles.emptyStateText}>
              Add your first track so Setups and Race Day can use the correct track, surface, location, and LiveRC info.
            </Text>

            <Pressable
              onPress={addTrack}
              style={({ pressed }) => [
                styles.emptyAddButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.emptyAddButtonText}>Add Track</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={tracks}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TrackCard
                track={item}
                isLandscape={isLandscape}
                onPress={() => openTrack(item)}
              />
            )}
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              isLandscape && styles.listContentLandscape,
            ]}
            numColumns={1}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <TrackEditSheet
        visible={sheetVisible}
        initialTrack={editingTrack || NEW_TRACK}
        isNew={isNew}
        saving={saving}
        onCancel={closeSheet}
        onSave={saveTrack}
        onDelete={removeTrack}
        onViewSetups={viewSetups}
        onSubmitTrack={submitTrack}
        onMergeTrack={openMergeSheet}
      />

      <TrackImportSheet
        visible={importVisible}
        onCancel={closeImportSheet}
        onImported={handleImportedTrack}
        onSubmitTrack={openSubmitTrackScreen}
      />

      <TrackMergeSheet
        visible={mergeVisible}
        sourceTrack={editingTrack}
        tracks={tracks}
        merging={merging}
        onCancel={closeMergeSheet}
        onMerge={handleMergeTrack}
      />
    </View>
  );
}
