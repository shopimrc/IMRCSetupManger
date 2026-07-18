// features/tracks/components/TrackSubmitForm.js

import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TrackTypeDropdown from './TrackTypeDropdown';
import { TRACK_SUBMISSION_EMAIL } from '../constants/trackSubmit';
import { validateTrack } from '../storage/trackStorage';
import { openTrackSubmissionEmail } from '../utils/trackSubmitEmail';
import { trackStyles as styles } from '../styles/trackStyles';

const EMPTY_SUBMISSION = {
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

export default function TrackSubmitForm({ initialTrack, onCancel }) {
  const [track, setTrack] = useState(() => ({
    ...EMPTY_SUBMISSION,
    ...(initialTrack || {}),
  }));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;

  const submitSafeContent = {
    paddingTop: Math.max(insets.top + 10, isLandscape ? 14 : 18),
    paddingBottom: Math.max(insets.bottom + 96, 112),
  };

  const halfFieldStyle = useMemo(
    () => (isLandscape ? styles.formFieldHalf : styles.formFieldFull),
    [isLandscape]
  );

  const thirdFieldStyle = useMemo(
    () => (isLandscape ? styles.formFieldThird : styles.formFieldFull),
    [isLandscape]
  );

  function updateField(key, value) {
    const nextValue = key === 'state' ? String(value || '').toUpperCase() : value;

    setTrack(current => ({ ...current, [key]: nextValue }));

    if (errors[key]) {
      setErrors(current => ({ ...current, [key]: undefined }));
    }
  }

  async function handleSubmit() {
    const result = validateTrack(track);

    if (!result.isValid) {
      setErrors(result.errors);
      return;
    }

    try {
      setSubmitting(true);
      await openTrackSubmissionEmail(track);
      setSubmitting(false);
    } catch (error) {
      setSubmitting(false);
      Alert.alert(
        'Email Not Opened',
        error.userMessage || 'The track submission email could not be opened.'
      );
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.formShell}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 8) : 0}
    >
      <ScrollView
        style={styles.formScroll}
        contentContainerStyle={[
          styles.formContent,
          isLandscape && styles.formContentLandscape,
          submitSafeContent,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.editHeader}>
          <View style={styles.submitTopHeaderRow}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.headerButtonText}>‹ Back</Text>
            </Pressable>

            <View style={styles.submitTopTitleWrap}>
              <Text style={styles.appLabel}>IMRC SETUP MANAGER</Text>
              <Text style={styles.editTitle}>Submit Track</Text>
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={({ pressed }) => [
                styles.addButton,
                submitting && styles.disabledButton,
                pressed && !submitting && styles.buttonPressed,
              ]}
            >
              <Text style={styles.addButtonText}>
                {submitting ? 'Opening...' : 'Submit'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.editSubtitle}>
            Opens an email draft to {TRACK_SUBMISSION_EMAIL}.
          </Text>
        </View>

        <View style={styles.formGrid}>
          <View style={halfFieldStyle}>
            <Text style={styles.inputLabel}>Track Name *</Text>
            <TextInput
              value={track.trackName}
              onChangeText={value => updateField('trackName', value)}
              placeholder="Track name"
              placeholderTextColor="#64748B"
              style={[styles.textInput, errors.trackName && styles.inputError]}
              autoCapitalize="words"
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

          <View style={halfFieldStyle}>
            <Text style={styles.inputLabel}>Surface</Text>
            <TextInput
              value={track.surface}
              onChangeText={value => updateField('surface', value)}
              placeholder="CRC Gray"
              placeholderTextColor="#64748B"
              style={styles.textInput}
              autoCapitalize="words"
            />
          </View>

          <View style={halfFieldStyle}>
            <Text style={styles.inputLabel}>LiveRC URL</Text>
            <TextInput
              value={track.liveRcUrl}
              onChangeText={value => updateField('liveRcUrl', value)}
              placeholder="https://thestable.liverc.com/"
              placeholderTextColor="#64748B"
              style={styles.textInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          <View style={styles.compactSection}>
            <Text style={styles.compactSectionTitle}>Location</Text>

            <View style={styles.formGridNested}>
              <View style={styles.formFieldFull}>
                <Text style={styles.inputLabel}>Street Address</Text>
                <TextInput
                  value={track.address}
                  onChangeText={value => updateField('address', value)}
                  placeholder="112 Main Street"
                  placeholderTextColor="#64748B"
                  style={styles.textInput}
                  autoCapitalize="words"
                />
              </View>

              <View style={thirdFieldStyle}>
                <Text style={styles.inputLabel}>City</Text>
                <TextInput
                  value={track.city}
                  onChangeText={value => updateField('city', value)}
                  placeholder="East Randolph"
                  placeholderTextColor="#64748B"
                  style={styles.textInput}
                  autoCapitalize="words"
                />
              </View>

              <View style={thirdFieldStyle}>
                <Text style={styles.inputLabel}>State</Text>
                <TextInput
                  value={track.state}
                  onChangeText={value => updateField('state', value)}
                  placeholder="NY"
                  placeholderTextColor="#64748B"
                  style={styles.textInput}
                  autoCapitalize="characters"
                  maxLength={2}
                />
              </View>

              <View style={thirdFieldStyle}>
                <Text style={styles.inputLabel}>Zip Code</Text>
                <TextInput
                  value={track.zipCode}
                  onChangeText={value => updateField('zipCode', value)}
                  placeholder="14730"
                  placeholderTextColor="#64748B"
                  style={styles.textInput}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </View>

          <View style={halfFieldStyle}>
            <Text style={styles.inputLabel}>Phone</Text>
            <TextInput
              value={track.phone}
              onChangeText={value => updateField('phone', value)}
              placeholder="Phone number"
              placeholderTextColor="#64748B"
              style={styles.textInput}
              keyboardType="phone-pad"
            />
          </View>

          <View style={halfFieldStyle}>
            <Text style={styles.inputLabel}>Direction</Text>
            <TextInput
              value={track.direction}
              onChangeText={value => updateField('direction', value)}
              placeholder="Counter-Clockwise"
              placeholderTextColor="#64748B"
              style={styles.textInput}
              autoCapitalize="words"
            />
          </View>

          <View style={thirdFieldStyle}>
            <Text style={styles.inputLabel}>Traction Level</Text>
            <TextInput
              value={track.tractionLevel}
              onChangeText={value => updateField('tractionLevel', value)}
              placeholder="Medium"
              placeholderTextColor="#64748B"
              style={styles.textInput}
              autoCapitalize="words"
            />
          </View>

          <View style={thirdFieldStyle}>
            <Text style={styles.inputLabel}>Run Line</Text>
            <TextInput
              value={track.runLine}
              onChangeText={value => updateField('runLine', value)}
              placeholder="103"
              placeholderTextColor="#64748B"
              style={styles.textInput}
            />
          </View>

          <View style={thirdFieldStyle}>
            <Text style={styles.inputLabel}>Track Dimensions</Text>
            <TextInput
              value={track.trackDimensions}
              onChangeText={value => updateField('trackDimensions', value)}
              placeholder={"24' x 60'"}
              placeholderTextColor="#64748B"
              style={styles.textInput}
            />
          </View>

          <View style={styles.formFieldFull}>
            <Text style={styles.inputLabel}>Notes</Text>
            <TextInput
              value={track.notes}
              onChangeText={value => updateField('notes', value)}
              placeholder="Anything we should know about this track?"
              placeholderTextColor="#64748B"
              style={[styles.textInput, styles.notesInput]}
              multiline
              textAlignVertical="top"
            />
          </View>
        </View>

        <View style={[styles.actionRow, isLandscape && styles.actionRowLandscape]}>
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.primaryButton,
              submitting && styles.disabledButton,
              pressed && !submitting && styles.buttonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {submitting ? 'Opening Email...' : 'Submit by Email'}
            </Text>
          </Pressable>

          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.headerButtonText}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
