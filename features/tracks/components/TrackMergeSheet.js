// features/tracks/components/TrackMergeSheet.js

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buildTrackLocation } from '../storage/trackStorage';
import { getTrackStyleAccent, trackStyles as styles, TRACK_BLUE } from '../styles/trackStyles';

function hasValue(value) {
  return Boolean(String(value || '').trim());
}

export default function TrackMergeSheet({
  visible,
  sourceTrack,
  tracks = [],
  merging = false,
  onCancel,
  onMerge,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const insets = useSafeAreaInsets();

  const mergeOptions = useMemo(
    () => tracks.filter(track => String(track.id) !== String(sourceTrack?.id)),
    [tracks, sourceTrack]
  );

  const selectedTrack = useMemo(
    () => mergeOptions.find(track => String(track.id) === String(selectedId)) || null,
    [mergeOptions, selectedId]
  );

  const safeOverlay = {
    paddingTop: Math.max(insets.top + 10, 22),
    paddingBottom: Math.max(insets.bottom + 10, 22),
  };

  function handleMerge() {
    if (!selectedTrack || merging) return;
    onMerge?.(selectedTrack);
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={[styles.mergeSheetOverlay, safeOverlay]}>
        <Pressable style={styles.mergeSheetDimmer} onPress={onCancel} />

        <View style={styles.mergeModalCard}>
          <View style={styles.mergeHeaderRow}>
            <View style={styles.mergeTitleWrap}>
              <Text style={styles.mergeEyebrow}>TRACK MERGE</Text>
              <Text style={styles.mergeTitle}>Merge Track</Text>
              <Text style={styles.mergeDescription}>
                Merge this track into another saved track. The selected track stays. This track is removed.
              </Text>
            </View>

            <Pressable
              onPress={onCancel}
              disabled={merging}
              style={({ pressed }) => [
                styles.importCloseButton,
                pressed && !merging && styles.buttonPressed,
              ]}
            >
              <Text style={styles.importCloseText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.mergeSourceBox}>
            <Text style={styles.mergeSourceLabel}>MERGING FROM</Text>
            <Text style={styles.mergeSourceTitle} numberOfLines={1}>
              {sourceTrack?.trackName || 'Selected Track'}
            </Text>
            <Text style={styles.mergeSourceText} numberOfLines={1}>
              All setups using this track will move to the selected track.
            </Text>
          </View>

          {mergeOptions.length === 0 ? (
            <View style={styles.mergeEmptyBox}>
              <Text style={styles.mergeEmptyTitle}>No other tracks found</Text>
              <Text style={styles.mergeEmptyText}>
                Add or import another track before using merge.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.mergeOptionsScroll}
              contentContainerStyle={styles.mergeOptionsContent}
              showsVerticalScrollIndicator
            >
              {mergeOptions.map(track => {
                const selected = String(track.id) === String(selectedId);
                const accent = getTrackStyleAccent(track.trackType, track.surface);
                const location = buildTrackLocation(track) || 'Location not set';
                const surface = hasValue(track.surface) ? track.surface : 'Surface not set';

                return (
                  <Pressable
                    key={track.id}
                    onPress={() => setSelectedId(track.id)}
                    disabled={merging}
                    style={({ pressed }) => [
                      styles.mergeTrackOption,
                      selected && styles.mergeTrackOptionSelected,
                      pressed && !merging && styles.buttonPressed,
                    ]}
                  >
                    <View style={[styles.mergeOptionBar, { backgroundColor: accent.bar }]} />

                    <View style={styles.mergeOptionTextWrap}>
                      <Text style={styles.mergeOptionTitle} numberOfLines={1}>
                        {track.trackName || 'Unnamed Track'}
                      </Text>

                      <View style={styles.cardStyleSurfaceRow}>
                        <View
                          style={[
                            styles.cardStyleChip,
                            {
                              borderColor: accent.border,
                              backgroundColor: accent.background,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.cardStyleChipText,
                              { color: accent.text },
                            ]}
                            numberOfLines={1}
                          >
                            {track.trackType || 'Track'}
                          </Text>
                        </View>

                        <Text style={styles.cardSurfaceBrightText} numberOfLines={1}>
                          {surface}
                        </Text>
                      </View>

                      <Text style={styles.mergeOptionLocation} numberOfLines={1}>
                        {location}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.mergeSelectPill,
                        selected && styles.mergeSelectPillSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.mergeSelectText,
                          selected && styles.mergeSelectTextSelected,
                        ]}
                      >
                        {selected ? '✓' : 'KEEP'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.mergeWarningBox}>
            <Text style={styles.mergeWarningText}>
              Same-vehicle setup groups will be combined under the kept track. Duplicate setup/history records are de-duped when possible.
            </Text>
          </View>

          <View style={styles.mergeFooterRow}>
            <Pressable
              onPress={onCancel}
              disabled={merging}
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && !merging && styles.buttonPressed,
              ]}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleMerge}
              disabled={!selectedTrack || merging}
              style={({ pressed }) => [
                styles.mergeConfirmButton,
                (!selectedTrack || merging) && styles.importSelectedButtonDisabled,
                pressed && selectedTrack && !merging && styles.buttonPressed,
              ]}
            >
              {merging ? (
                <ActivityIndicator color={TRACK_BLUE} />
              ) : (
                <Text
                  style={[
                    styles.mergeConfirmText,
                    !selectedTrack && styles.importSelectedTextDisabled,
                  ]}
                >
                  Merge Tracks
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
