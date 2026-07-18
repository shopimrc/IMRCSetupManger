// features/tracks/components/TrackImportSheet.js

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { findTrackImportMatch, getTracks, importTrack as saveImportedTrack } from '../storage/trackStorage';
import {
  fetchRemoteTrackList,
  filterRemoteTracks,
  getAvailableImportFilters,
  normalizeImportSurface,
  normalizeImportTrackStyle,
} from '../utils/trackRemoteImport';
import { trackStyles as styles, TRACK_BLUE } from '../styles/trackStyles';

function hasValue(value) {
  return Boolean(String(value || '').trim());
}

function getLocationLabel(track = {}) {
  const cityState = track.cityState || [track.city, track.state].filter(Boolean).join(', ');
  const zip = track.zipCode || track.zip;

  return [cityState, zip].filter(Boolean).join(' ');
}

const EMPTY_FILTERS = {
  style: '',
  surface: '',
};

export default function TrackImportSheet({
  visible,
  onCancel,
  onImported,
  onSubmitTrack,
}) {
  const [query, setQuery] = useState('');
  const [remoteTracks, setRemoteTracks] = useState([]);
  const [localTracks, setLocalTracks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [scrollVisibleHeight, setScrollVisibleHeight] = useState(0);
  const [scrollContentHeight, setScrollContentHeight] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;

  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const importSheetSafeOverlay = {
    paddingTop: Math.max(insets.top + 10, 22),
    paddingBottom: Math.max(insets.bottom + 10, 22),
  };

  const availableFilters = useMemo(
    () => getAvailableImportFilters(remoteTracks),
    [remoteTracks]
  );

  const filteredTracks = useMemo(
    () => filterRemoteTracks(remoteTracks, query, filters),
    [remoteTracks, query, filters]
  );

  const selectedRemoteTrack = useMemo(
    () => remoteTracks.find(item => item.id === selectedId) || null,
    [remoteTracks, selectedId]
  );

  const selectedExistingTrack = useMemo(
    () => selectedRemoteTrack?.track
      ? findTrackImportMatch(localTracks, selectedRemoteTrack.track)
      : null,
    [localTracks, selectedRemoteTrack]
  );

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters]
  );

  useEffect(() => {
    if (visible) {
      loadTracks();
    } else {
      setKeyboardHeight(0);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, event => {
      setKeyboardHeight(event?.endCoordinates?.height || 0);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  async function loadTracks() {
    try {
      setLoading(true);
      const [tracks, savedTracks] = await Promise.all([
        fetchRemoteTrackList(),
        getTracks(),
      ]);
      setRemoteTracks(tracks);
      setLocalTracks(savedTracks);
      setSelectedId(null);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      Alert.alert(
        'Import Failed',
        error.userMessage || 'Could not load online tracks.'
      );
    }
  }

  async function importSelected() {
    if (!selectedRemoteTrack?.track) return;

    try {
      setImporting(true);
      const savedTrack = await saveImportedTrack(selectedRemoteTrack.track);
      const wasUpdated = savedTrack.importAction === 'updated';
      const latestTracks = await getTracks();
      setLocalTracks(latestTracks);
      setImporting(false);

      Alert.alert(
        wasUpdated ? 'Track Updated' : 'Track Imported',
        wasUpdated
          ? `${savedTrack.trackName} was merged into your existing saved track. No duplicate was created.`
          : `${savedTrack.trackName} was added to your local track list.`,
        [
          {
            text: 'OK',
            onPress: () => onImported?.(savedTrack),
          },
        ]
      );
    } catch (error) {
      setImporting(false);
      Alert.alert(
        'Import Failed',
        error.userMessage || 'The selected track could not be imported.'
      );
    }
  }

  function handleSubmitTrack() {
    onSubmitTrack?.();
  }

  function setFilter(key, value) {
    setFilters(current => ({
      ...current,
      [key]: current[key] === value ? '' : value,
    }));
    setSelectedId(null);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setSelectedId(null);
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={[styles.importSheetOverlay, importSheetSafeOverlay]}>
        <Pressable style={styles.importSheetDimmer} onPress={onCancel} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 8) : 0}
          style={[
            styles.importKeyboardAvoidWrap,
            keyboardHeight > 0 && {
              marginBottom: Math.round(keyboardHeight * 0.5),
              maxHeight: Math.max(320, height - keyboardHeight - 32),
            },
          ]}
        >
          <View style={styles.importModalCard}>

            <View style={styles.importModalHeader}>
              <View style={styles.importModalTitleWrap}>
                <Text style={styles.importModalEyebrow}>TRACK IMPORT</Text>
                <Text style={styles.importModalTitle}>Import Track</Text>
                <Text style={styles.importModalDescription}>
                  Search online tracks from your GitHub folder and import them locally.
                </Text>
              </View>

              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [
                  styles.importCloseButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.importCloseText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.importSearchRow}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search tracks..."
                placeholderTextColor="#7F8DA4"
                style={styles.importSearchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Pressable
                onPress={() => setFiltersOpen(current => !current)}
                style={({ pressed }) => [
                  styles.importFilterButton,
                  activeFilterCount > 0 && styles.importFilterButtonActive,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text
                  style={[
                    styles.importFilterButtonText,
                    activeFilterCount > 0 && styles.importFilterButtonTextActive,
                  ]}
                >
                  Filter{activeFilterCount ? ` ${activeFilterCount}` : ''}
                </Text>
              </Pressable>
            </View>

            {filtersOpen ? (
              <View style={styles.importFilterPanel}>
                <View style={styles.importFilterHeader}>
                  <Text style={styles.importFilterTitle}>Filter Tracks</Text>

                  <Pressable
                    onPress={clearFilters}
                    style={({ pressed }) => [
                      styles.importClearFilterButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.importClearFilterText}>Clear</Text>
                  </Pressable>
                </View>

                <Text style={styles.importFilterLabel}>Track Style</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.importFilterChipsRow}
                >
                  {availableFilters.styles.map(style => {
                    const selected = filters.style === style;

                    return (
                      <Pressable
                        key={style}
                        onPress={() => setFilter('style', style)}
                        style={({ pressed }) => [
                          styles.importFilterChip,
                          selected && styles.importFilterChipSelected,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.importFilterChipText,
                            selected && styles.importFilterChipTextSelected,
                          ]}
                        >
                          {style}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={styles.importFilterLabel}>Surface</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.importFilterChipsRow}
                >
                  {availableFilters.surfaces.map(surface => {
                    const selected = filters.surface === surface;

                    return (
                      <Pressable
                        key={surface}
                        onPress={() => setFilter('surface', surface)}
                        style={({ pressed }) => [
                          styles.importFilterChip,
                          selected && styles.importFilterChipSelected,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.importFilterChipText,
                            selected && styles.importFilterChipTextSelected,
                          ]}
                        >
                          {surface}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {loading ? (
              <View style={styles.importLoadingWrap}>
                <ActivityIndicator color={TRACK_BLUE} />
                <Text style={styles.importLoadingText}>Loading online tracks...</Text>
              </View>
            ) : filteredTracks.length === 0 ? (
              <View style={styles.importEmptyWrap}>
                <Text style={styles.importEmptyTitle}>No tracks found</Text>
                <Text style={styles.importEmptyText}>
                  Try a different search, clear filters, or submit a track for the online list.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.importTracksScroll}
                contentContainerStyle={styles.importListContent}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
              >
                {filteredTracks.map(item => {
                  const selected = item.id === selectedId;
                  const track = item.track;
                  const location = getLocationLabel(track);
                  const trackStyle = normalizeImportTrackStyle(track.trackType) || 'Track';
                  const surface = normalizeImportSurface(track.surface) || 'Surface';
                  const existingTrack = findTrackImportMatch(localTracks, track);
                  const willUpdate = Boolean(existingTrack);

                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setSelectedId(item.id)}
                      style={({ pressed }) => [
                        styles.importVehicleCard,
                        selected && styles.importVehicleCardSelected,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <View style={styles.importCardBlueBar} />

                      <View style={styles.importCardLeft}>
                        <Text style={styles.importCardTitle} numberOfLines={1}>
                          {track.trackName || 'Unnamed Track'}
                        </Text>

                        <Text style={styles.importCardBottomLine} numberOfLines={1}>
                          {hasValue(location) ? location : 'Location not set'}
                        </Text>

                        {willUpdate ? (
                          <Text style={styles.importCardMergeLine} numberOfLines={1}>
                            Saved locally • will update
                          </Text>
                        ) : null}
                      </View>

                      <View
                        style={[
                          styles.importCardRightPill,
                          selected && styles.importCardRightPillSelected,
                        ]}
                      >
                        <Text style={styles.importCardRightStyle} numberOfLines={1}>
                          {trackStyle}
                        </Text>
                        <Text style={styles.importCardRightSurface} numberOfLines={1}>
                          {surface}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.importSubmitRow}>
              <Text style={styles.importSubmitText}>Don’t see your track?</Text>
              <Pressable
                onPress={handleSubmitTrack}
                style={({ pressed }) => [
                  styles.importSubmitButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.importSubmitButtonText}>Submit Track</Text>
              </Pressable>
            </View>

            <View style={styles.importFooterRow}>
              <Pressable
                onPress={loadTracks}
                disabled={loading || importing}
                style={({ pressed }) => [
                  styles.importRefreshButton,
                  (loading || importing) && styles.disabledButton,
                  pressed && !(loading || importing) && styles.buttonPressed,
                ]}
              >
                <Text style={styles.importRefreshText}>
                  {loading ? 'Loading...' : 'Refresh'}
                </Text>
              </Pressable>

              <Pressable
                onPress={importSelected}
                disabled={!selectedRemoteTrack || importing}
                style={({ pressed }) => [
                  styles.importSelectedButton,
                  (!selectedRemoteTrack || importing) && styles.importSelectedButtonDisabled,
                  pressed && selectedRemoteTrack && !importing && styles.buttonPressed,
                ]}
              >
                <Text
                  style={[
                    styles.importSelectedText,
                    (!selectedRemoteTrack || importing) && styles.importSelectedTextDisabled,
                  ]}
                >
                  {importing
                  ? (selectedExistingTrack ? 'Updating...' : 'Importing...')
                  : (selectedExistingTrack ? 'Update Existing' : 'Import Selected')}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
