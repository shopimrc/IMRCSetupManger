import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import RaceDayPopup from './RaceDayPopup';
import { getRaceDayNotesBundle, saveRaceDayNotes } from '../lib/raceDayNotesStorage';
import { raceDayColors, raceDayStyles } from '../styles/raceDayStyles';

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function RaceDayNotesPopup({ visible, raceDay, track, onClose }) {
  const raceDayId = raceDay?.id || raceDay?.raceDayId;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [savedAt, setSavedAt] = useState(null);

  const load = useCallback(async () => {
    if (!visible || !raceDayId) return;
    setLoading(true);
    try {
      const bundle = await getRaceDayNotesBundle(raceDayId);
      setNotes(bundle.notes?.notes || '');
      setSavedAt(bundle.notes?.updatedAt || null);
    } finally {
      setLoading(false);
    }
  }, [visible, raceDayId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!raceDayId) return;
    setSaving(true);
    try {
      const saved = await saveRaceDayNotes(raceDayId, notes, {
        trackId: raceDay?.trackId || track?.id || track?.trackId || '',
        trackName: track?.name || track?.trackName || '',
        startedAt: raceDay?.startedAt || '',
      });
      setSavedAt(saved.updatedAt);
    } finally {
      setSaving(false);
    }
  }

  return (
    <RaceDayPopup
      visible={visible}
      title="RaceDay Notes"
      subtitle="Session notes"
      onClose={onClose}
      centered
      keyboardAware
      bodyScroll={false}
      contentContainerStyle={localStyles.body}
    >
      {loading ? (
        <View style={raceDayStyles.empty}><ActivityIndicator /></View>
      ) : (
        <View style={localStyles.panel}>
          <View style={raceDayStyles.rowBetween}>
            <Text style={localStyles.label}>Driver / Race Notes</Text>
            {savedAt ? <Text style={raceDayStyles.cardMetaRight}>Saved {formatTime(savedAt)}</Text> : null}
          </View>

          <TextInput
            style={localStyles.input}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add RaceDay notes, setup ideas, track changes, tire notes, or anything you want to remember..."
            placeholderTextColor="#6F7D93"
            multiline
            textAlignVertical="top"
            returnKeyType="default"
          />

          <TouchableOpacity style={raceDayStyles.primaryButton} onPress={handleSave} disabled={saving} activeOpacity={0.82}>
            <Text style={raceDayStyles.primaryButtonText}>{saving ? 'Saving...' : 'Save Notes'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </RaceDayPopup>
  );
}

export { RaceDayNotesPopup };

const localStyles = StyleSheet.create({
  body: {
    paddingTop: 10,
    paddingBottom: 4,
  },
  panel: {
    backgroundColor: raceDayColors.cardAlt,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  label: {
    color: raceDayColors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  input: {
    minHeight: 112,
    maxHeight: 150,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    backgroundColor: raceDayColors.input,
    color: raceDayColors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
  },
});
