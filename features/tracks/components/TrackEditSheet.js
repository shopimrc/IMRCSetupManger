// features/tracks/components/TrackEditSheet.js

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  Modal,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import PopupScrollTab from './PopupScrollTab';
import TrackTypeDropdown from './TrackTypeDropdown';
import { trackStyles as styles } from '../styles/trackStyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { validateTrack } from '../storage/trackStorage';

const EMPTY_TRACK = {
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

export default function TrackEditSheet({
  visible,
  initialTrack,
  isNew = false,
  saving = false,
  onCancel,
  onSave,
  onDelete,
  onViewSetups,
  onSubmitTrack,
  onMergeTrack,
}) {
  const [track, setTrack] = useState(() => ({
    ...EMPTY_TRACK,
    ...(initialTrack || {}),
  }));
  const [errors, setErrors] = useState({});
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [scrollVisibleHeight, setScrollVisibleHeight] = useState(0);
  const [scrollContentHeight, setScrollContentHeight] = useState(0);

  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const fieldPositionsRef = useRef({});
  const focusedFieldRef = useRef(null);

  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;

  const halfFieldStyle = useMemo(() => styles.sheetFieldHalf, []);
  const thirdFieldStyle = useMemo(() => styles.sheetFieldThird, []);
  const twoThirdFieldStyle = useMemo(() => styles.sheetFieldTwoThird, []);

  const keyboardFooterBottom = keyboardHeight > 0
    ? keyboardHeight + Math.max(insets.bottom, 8)
    : Math.max(insets.bottom + 18, Math.round(height * 0.43));

  const trackSheetSafeOverlay = {
    paddingTop: Math.max(insets.top + 10, 22),
    paddingBottom: Math.max(insets.bottom + 10, 22),
  };

  useEffect(() => {
    if (visible) {
      setTrack({
        ...EMPTY_TRACK,
        ...(initialTrack || {}),
      });
      setErrors({});
    } else {
      setKeyboardOpen(false);
      setKeyboardHeight(0);
      focusedFieldRef.current = null;
      fieldPositionsRef.current = {};
    }
  }, [visible, initialTrack]);

  useEffect(() => {
    if (!visible) return undefined;

    const showSub = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardOpen(true);
      setKeyboardHeight(event?.endCoordinates?.height || 0);

      setTimeout(() => {
        scrollFocusedFieldIntoView();
      }, 80);
    });

    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardOpen(false);
      setKeyboardHeight(0);
      focusedFieldRef.current = null;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  function updateField(key, value) {
    const nextValue = key === 'state' ? String(value || '').toUpperCase() : value;

    setTrack(current => ({
      ...current,
      [key]: nextValue,
    }));

    if (errors[key]) {
      setErrors(current => ({
        ...current,
        [key]: undefined,
      }));
    }
  }

  function handleSave() {
    const result = validateTrack(track);

    if (!result.isValid) {
      setErrors(result.errors);
      return;
    }

    onSave?.(track);
  }

  function handleSubmitTrack() {
    const result = validateTrack(track);

    if (!result.isValid) {
      setErrors(result.errors);
      return;
    }

    onSubmitTrack?.(track);
  }

  function confirmDelete() {
    if (!onDelete || isNew) return;

    Alert.alert(
      'Delete Track?',
      'This removes the track from local storage.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: onDelete,
        },
      ]
    );
  }

  function rememberFieldLayout(key, event) {
    fieldPositionsRef.current[key] = event.nativeEvent.layout.y;
  }

  function scrollFocusedFieldIntoView() {
    const key = focusedFieldRef.current;
    const y = fieldPositionsRef.current[key];

    if (typeof y !== 'number') return;

    const topBuffer = 18;
    const targetY = Math.max(0, y - topBuffer);

    scrollRef.current?.scrollTo({
      y: targetY,
      animated: true,
    });
  }

  function getInputFocusProps(key) {
    return {
      onFocus: () => {
        focusedFieldRef.current = key;
        setKeyboardOpen(true);

        setTimeout(() => {
          scrollFocusedFieldIntoView();
        }, 120);
      },
      onBlur: () => {
        setTimeout(() => {
          if (keyboardHeight <= 0) {
            setKeyboardOpen(false);
          }
        }, 160);
      },
    };
  }

  function renderActionButtons(isFloating = false) {
    return (
      <View style={[styles.sheetActionsBlock, isFloating && styles.sheetActionsBlockFloating]}>
        {!isNew && onMergeTrack ? (
          <Pressable
            onPress={onMergeTrack}
            style={({ pressed }) => [
              styles.stationaryMergeButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.stationaryMergeButtonText}>Merge Track</Text>
          </Pressable>
        ) : null}

        <View style={styles.sheetStationaryActions}>
          <Pressable
            onPress={handleSubmitTrack}
            style={({ pressed }) => [
              styles.stationarySubmitButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.stationarySubmitButtonText}>Submit Track</Text>
          </Pressable>

          {!isNew ? (
            <Pressable
              onPress={confirmDelete}
              style={({ pressed }) => [
                styles.stationaryDeleteButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.stationaryDeleteButtonText}>Delete Track</Text>
            </Pressable>
          ) : (
            <View style={styles.stationaryActionSpacer} />
          )}
        </View>

        <View style={styles.sheetFooterRow}>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              saving && styles.disabledButton,
              pressed && !saving && styles.buttonPressed,
            ]}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : 'Save Track'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={[styles.sheetOverlay, trackSheetSafeOverlay]}>
        <Pressable style={styles.sheetDimmer} onPress={onCancel} />

        <View
          style={[
            styles.bottomSheet,
            isLandscape && styles.bottomSheetLandscape,
          ]}
        >
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeaderRow}>
            <View style={styles.sheetHeaderTextWrap}>
              <Text style={styles.sheetEyebrow}>TRACK</Text>
              <Text style={styles.sheetTitle}>
                {isNew ? 'Add Track' : 'Edit Track'}
              </Text>
            </View>

            {!isNew ? (
              <Pressable
                onPress={onViewSetups}
                style={({ pressed }) => [
                  styles.sheetSmallButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.sheetSmallButtonText}>View Setups</Text>
              </Pressable>
            ) : null}
          </View>

          <PopupScrollTab
            scrollY={scrollY}
            visibleHeight={scrollVisibleHeight}
            contentHeight={scrollContentHeight}
            style={styles.popupScrollTab}
          />

          <Animated.ScrollView
            ref={scrollRef}
            style={styles.sheetScroll}
            contentContainerStyle={[
              styles.sheetContent,
              keyboardOpen && styles.sheetContentKeyboardOpen,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onLayout={event => setScrollVisibleHeight(event.nativeEvent.layout.height)}
            onContentSizeChange={(_, contentHeight) => setScrollContentHeight(contentHeight)}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true }
            )}
          >
            <View style={styles.sheetGrid}>
              <View style={styles.sheetFieldFull} onLayout={event => rememberFieldLayout('trackName', event)}>
                <Text style={styles.inputLabel}>Track Name *</Text>
                <TextInput
                  {...getInputFocusProps('trackName')}
                  value={track.trackName}
                  onChangeText={value => updateField('trackName', value)}
                  placeholder="Phoenix RC Racing Club"
                  placeholderTextColor="#8B96AA"
                  style={[styles.textInput, errors.trackName && styles.inputError]}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
                {errors.trackName ? <Text style={styles.errorText}>{errors.trackName}</Text> : null}
              </View>

              <View style={halfFieldStyle}>
                <Text style={styles.inputLabel}>Track Type *</Text>
                <TrackTypeDropdown
                  value={track.trackType}
                  error={errors.trackType}
                  onChange={value => updateField('trackType', value)}
                />
                {errors.trackType ? <Text style={styles.errorText}>{errors.trackType}</Text> : null}
              </View>

              <View style={halfFieldStyle} onLayout={event => rememberFieldLayout('surface', event)}>
                <Text style={styles.inputLabel}>Surface</Text>
                <TextInput
                  {...getInputFocusProps('surface')}
                  value={track.surface}
                  onChangeText={value => updateField('surface', value)}
                  placeholder="CRC Gray"
                  placeholderTextColor="#8B96AA"
                  style={styles.textInput}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.sheetFieldFull} onLayout={event => rememberFieldLayout('liveRcUrl', event)}>
                <Text style={styles.inputLabel}>LiveRC URL</Text>
                <TextInput
                  {...getInputFocusProps('liveRcUrl')}
                  value={track.liveRcUrl}
                  onChangeText={value => updateField('liveRcUrl', value)}
                  placeholder="https://thestable.liverc.com/"
                  placeholderTextColor="#8B96AA"
                  style={styles.textInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionTitle}>Location</Text>

                <View style={styles.sheetGridNested}>
                  <View style={styles.sheetFieldFull} onLayout={event => rememberFieldLayout('address', event)}>
                    <Text style={styles.inputLabel}>Street Address</Text>
                    <TextInput
                      {...getInputFocusProps('address')}
                      value={track.address}
                      onChangeText={value => updateField('address', value)}
                      placeholder="112 Main Street"
                      placeholderTextColor="#8B96AA"
                      style={styles.textInput}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                  </View>

                  <View style={twoThirdFieldStyle} onLayout={event => rememberFieldLayout('city', event)}>
                    <Text style={styles.inputLabel}>City</Text>
                    <TextInput
                      {...getInputFocusProps('city')}
                      value={track.city}
                      onChangeText={value => updateField('city', value)}
                      placeholder="East Randolph"
                      placeholderTextColor="#8B96AA"
                      style={styles.textInput}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                  </View>

                  <View style={thirdFieldStyle} onLayout={event => rememberFieldLayout('state', event)}>
                    <Text style={styles.inputLabel}>State</Text>
                    <TextInput
                      {...getInputFocusProps('state')}
                      value={track.state}
                      onChangeText={value => updateField('state', value)}
                      placeholder="NY"
                      placeholderTextColor="#8B96AA"
                      style={styles.textInput}
                      autoCapitalize="characters"
                      maxLength={2}
                      returnKeyType="next"
                    />
                  </View>

                  <View style={styles.sheetFieldFull} onLayout={event => rememberFieldLayout('zipCode', event)}>
                    <Text style={styles.inputLabel}>Zip Code</Text>
                    <TextInput
                      {...getInputFocusProps('zipCode')}
                      value={track.zipCode}
                      onChangeText={value => updateField('zipCode', value)}
                      placeholder="14730"
                      placeholderTextColor="#8B96AA"
                      style={styles.textInput}
                      keyboardType="number-pad"
                      returnKeyType="next"
                    />
                  </View>
                </View>
              </View>

              <View style={halfFieldStyle} onLayout={event => rememberFieldLayout('phone', event)}>
                <Text style={styles.inputLabel}>Phone</Text>
                <TextInput
                  {...getInputFocusProps('phone')}
                  value={track.phone}
                  onChangeText={value => updateField('phone', value)}
                  placeholder="Phone number"
                  placeholderTextColor="#8B96AA"
                  style={styles.textInput}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                />
              </View>

              <View style={halfFieldStyle} onLayout={event => rememberFieldLayout('direction', event)}>
                <Text style={styles.inputLabel}>Direction</Text>
                <TextInput
                  {...getInputFocusProps('direction')}
                  value={track.direction}
                  onChangeText={value => updateField('direction', value)}
                  placeholder="Counter-Clockwise"
                  placeholderTextColor="#8B96AA"
                  style={styles.textInput}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>

              <View style={thirdFieldStyle} onLayout={event => rememberFieldLayout('tractionLevel', event)}>
                <Text style={styles.inputLabel}>Traction</Text>
                <TextInput
                  {...getInputFocusProps('tractionLevel')}
                  value={track.tractionLevel}
                  onChangeText={value => updateField('tractionLevel', value)}
                  placeholder="Medium"
                  placeholderTextColor="#8B96AA"
                  style={styles.textInput}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>

              <View style={thirdFieldStyle} onLayout={event => rememberFieldLayout('runLine', event)}>
                <Text style={styles.inputLabel}>Run Line</Text>
                <TextInput
                  {...getInputFocusProps('runLine')}
                  value={track.runLine}
                  onChangeText={value => updateField('runLine', value)}
                  placeholder="103"
                  placeholderTextColor="#8B96AA"
                  style={styles.textInput}
                  returnKeyType="next"
                />
              </View>

              <View style={thirdFieldStyle} onLayout={event => rememberFieldLayout('trackDimensions', event)}>
                <Text style={styles.inputLabel}>Size</Text>
                <TextInput
                  {...getInputFocusProps('trackDimensions')}
                  value={track.trackDimensions}
                  onChangeText={value => updateField('trackDimensions', value)}
                  placeholder={"24' x 60'"}
                  placeholderTextColor="#8B96AA"
                  style={styles.textInput}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.sheetFieldFull} onLayout={event => rememberFieldLayout('notes', event)}>
                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput
                  {...getInputFocusProps('notes')}
                  value={track.notes}
                  onChangeText={value => updateField('notes', value)}
                  placeholder="Optional track notes..."
                  placeholderTextColor="#8B96AA"
                  style={[styles.textInput, styles.notesInputCompact]}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </View>
          </Animated.ScrollView>

          {!keyboardOpen ? renderActionButtons(false) : null}
        </View>

        {keyboardOpen ? (
          <View
            style={[
              styles.keyboardFloatingActions,
              { bottom: keyboardFooterBottom },
            ]}
          >
            {renderActionButtons(true)}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
