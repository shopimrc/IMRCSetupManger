import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import RaceDayPopup from './RaceDayPopup';
import { getPracticeDayOptions, getTodayPracticeDayKey } from '../lib/raceDayPracticeDay';
import { getTrackLiveRcUrl } from '../lib/raceDayModel';
import { saveTrackLiveRcUrl } from '../lib/raceDayStorage';
import { findPracticeDays } from '../lib/liverc/liveRcPracticeDayFinder';
import { getPracticeMonthCalendarUrl, getPracticeUrl, normalizeLiveRcPracticeSiteUrl } from '../lib/liverc/liveRcPracticeUrls';
import { raceDayColors, raceDayStyles } from '../styles/raceDayStyles';

function getPracticeKey(day) {
  if (!day) return '';
  if (typeof day === 'string') return day;
  return day.key || day.dateKey || day.practiceUrl || day.dateLabel || day.label || day.id || '';
}

function normalizeSelectedDayInput(day) {
  if (!day) return null;
  if (typeof day === 'string') return { key: day, label: day, dateLabel: day, source: 'saved' };
  return day;
}

function getSelectedPracticeDay(days = [], selectedDayKey = '') {
  const selectedInput = normalizeSelectedDayInput(selectedDayKey);
  const key = getPracticeKey(selectedInput || selectedDayKey);
  if (!key) return null;
  return days.find((day) => getPracticeKey(day) === key) || selectedInput || null;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getLastSixPracticeMonths(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return Array.from({ length: 6 }).map((_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() - index, 1);
    const key = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    const label = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return { key, label };
  });
}

function PracticeDayRow({ day, selected, onPress }) {
  const hasPractice = (day.sessionCount || 0) > 0;
  return (
    <TouchableOpacity
      style={[styles.dayRow, selected && styles.dayRowSelected]}
      onPress={() => onPress?.(day)}
      activeOpacity={0.84}
    >
      <View style={styles.dayAccent} />
      <View style={raceDayStyles.flex1}>
        <Text style={styles.dayTitle} numberOfLines={1}>{day.label || day.dateLabel || 'Practice Date'}</Text>
        <Text style={styles.daySub} numberOfLines={1}>
          {day.source === 'local' ? 'Local Practice' : 'LiveRC Practice'}{hasPractice ? ` • ${day.sessionCount} run${day.sessionCount === 1 ? '' : 's'}` : ''}
        </Text>
      </View>
      <Text style={[styles.dayStatus, selected && styles.dayStatusSelected]}>{selected ? 'Selected' : hasPractice ? 'Open' : 'Select'}</Text>
    </TouchableOpacity>
  );
}

export default function RaceDayPracticeDayPickerPopup({
  visible,
  raceDay,
  track,
  vehicles = [],
  selectedDayKey,
  onSelectDay,
  onClose,
}) {
  const initialUrl = useMemo(() => {
    const sourceUrl = raceDay?.practiceSiteUrl || raceDay?.siteUrl || getTrackLiveRcUrl(track || {}) || '';
    return getPracticeUrl(sourceUrl) || sourceUrl;
  }, [raceDay, track]);
  const [siteUrl, setSiteUrl] = useState(initialUrl);
  const selectedInput = useMemo(() => normalizeSelectedDayInput(selectedDayKey), [selectedDayKey]);
  const [days, setDays] = useState(selectedInput ? [selectedInput] : []);
  const [selectedKey, setSelectedKey] = useState(getPracticeKey(selectedInput || selectedDayKey) || '');
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const monthOptions = useMemo(() => getLastSixPracticeMonths(), []);
  const [selectedMonthKey, setSelectedMonthKey] = useState(monthOptions[0]?.key || '');
  const [monthOpen, setMonthOpen] = useState(false);
  const [message, setMessage] = useState('');

  const raceDayId = raceDay?.id || raceDay?.raceDayId;

  useEffect(() => {
    if (!visible) return;
    setSiteUrl(initialUrl);
    const nextSelected = normalizeSelectedDayInput(selectedDayKey);
    setSelectedKey(getPracticeKey(nextSelected || selectedDayKey) || '');
    setDays(nextSelected ? [nextSelected] : []);
    setMessage('');
    setSelecting(false);
    setMonthOpen(false);
    if (selectedInput?.key && /^20\d{2}-\d{2}-\d{2}$/.test(selectedInput.key)) {
      setSelectedMonthKey(selectedInput.key.slice(0, 7));
    } else if (monthOptions[0]?.key) {
      setSelectedMonthKey(monthOptions[0].key);
    }
  }, [visible, initialUrl, selectedDayKey, selectedInput, monthOptions]);

  async function loadLocalFallback() {
    if (!raceDayId) return [];
    try {
      const localDays = await getPracticeDayOptions(raceDayId, vehicles, raceDay);
      return (localDays || []).map((day) => ({ ...day, source: day.source || 'local' }));
    } catch (error) {
      console.warn('[RaceDayPracticeDayPickerPopup] Failed to load local practice days', error);
      const today = getTodayPracticeDayKey();
      return [{ key: today, label: today, isToday: true, sessionCount: 0, totalLaps: 0, source: 'local' }];
    }
  }

  function pickDay(day) {
    setSelectedKey(getPracticeKey(day));
  }

  async function handleFindPracticeDays() {
    const normalized = normalizeLiveRcPracticeSiteUrl(siteUrl);
    const practiceUrl = getPracticeMonthCalendarUrl(siteUrl, selectedMonthKey);
    if (!normalized) {
      setMessage('Enter the LiveRC site URL first. Example: shopimrc.liverc.com');
      return;
    }

    setLoading(true);
    setMessage(`Checking ${practiceUrl}`);
    try {
      setSiteUrl(getPracticeUrl(normalized) || normalized);
      if (track?.id || track?.trackId) {
        await saveTrackLiveRcUrl(track.id || track.trackId, normalized);
      }

      const found = await findPracticeDays(normalized, { limit: 30, monthKey: selectedMonthKey });
      const local = await loadLocalFallback();
      const merged = [...found, ...local.filter((localDay) => !found.some((day) => getPracticeKey(day) === getPracticeKey(localDay)))]
        .filter((day) => Boolean(day && getPracticeKey(day)));
      setDays(merged);

      const current = getSelectedPracticeDay(merged, selectedKey || selectedDayKey);
      if (current) {
        pickDay(current);
      } else if (!selectedKey && merged[0]) {
        pickDay(merged[0]);
      }

      setMessage(found.length ? '' : 'No LiveRC practice dates were found for that month. Local practice dates are shown if available.');
    } catch (error) {
      const local = await loadLocalFallback();
      setDays((local || []).filter((day) => Boolean(day && getPracticeKey(day))));
      if (local[0] && !selectedKey) pickDay(local[0]);
      setMessage(error?.message || 'Could not connect to LiveRC practice. Local practice dates are shown if available.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectPracticeDay() {
    const selected = getSelectedPracticeDay(days, selectedKey);
    const selectedMonth = monthOptions.find((month) => month.key === selectedMonthKey) || monthOptions[0];
    if (!selected) {
      setMessage('Select a practice date first.');
      return;
    }

    setSelecting(true);
    try {
      onSelectDay?.({
        ...selected,
        key: getPracticeKey(selected),
        siteUrl: normalizeLiveRcPracticeSiteUrl(siteUrl),
        monthKey: selectedMonth?.key || selectedMonthKey,
      });
    } finally {
      setSelecting(false);
    }
  }

  const selected = getSelectedPracticeDay(days, selectedKey);
  const selectedMonth = monthOptions.find((month) => month.key === selectedMonthKey) || monthOptions[0];

  return (
    <RaceDayPopup
      visible={visible}
      title="Practice Date"
      subtitle="Find the LiveRC practice date, then select it."
      onClose={onClose}
      centered
      keyboardAware
      bodyScroll={false}
      contentContainerStyle={styles.popupContent}
    >
      <View style={styles.staticTop}>
        <Text style={raceDayStyles.statLabel}>LIVERC SITE URL</Text>
        <TextInput
          value={siteUrl}
          onChangeText={setSiteUrl}
          placeholder="shopimrc.liverc.com"
          placeholderTextColor={raceDayColors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          style={[raceDayStyles.input, { marginTop: 6 }]}
        />
        <Text style={styles.urlHint} numberOfLines={1}>
          Practice checked at: {getPracticeMonthCalendarUrl(siteUrl, selectedMonthKey) || 'https://your-site.liverc.com/practice/?p=calendar&d=2026-06'}
        </Text>

        <View style={styles.monthWrap}>
          <Text style={raceDayStyles.statLabel}>MONTH</Text>
          <TouchableOpacity
            style={styles.monthButton}
            onPress={() => setMonthOpen((open) => !open)}
            activeOpacity={0.84}
          >
            <Text style={styles.monthButtonText} numberOfLines={1}>{selectedMonth?.label || 'Select Month'}</Text>
            <Text style={styles.monthChevron}>{monthOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {monthOpen ? (
            <View style={styles.monthMenu}>
              {monthOptions.map((month) => (
                <TouchableOpacity
                  key={month.key}
                  style={[styles.monthOption, selectedMonthKey === month.key && styles.monthOptionSelected]}
                  onPress={() => {
                    setSelectedMonthKey(month.key);
                    setMonthOpen(false);
                    setDays([]);
                    setSelectedKey('');
                    setMessage('');
                  }}
                  activeOpacity={0.82}
                >
                  <Text style={[styles.monthOptionText, selectedMonthKey === month.key && styles.monthOptionTextSelected]}>
                    {month.label}
                  </Text>
                  <Text style={styles.monthOptionUrl} numberOfLines={1}>practice/?p=calendar&amp;d={month.key}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

        <TouchableOpacity style={styles.findButton} onPress={handleFindPracticeDays} activeOpacity={0.82}>
          {loading ? <ActivityIndicator /> : <Text style={raceDayStyles.secondaryButtonText}>Find Practice</Text>}
        </TouchableOpacity>

        <View style={[raceDayStyles.rowBetween, { marginTop: 10 }]}> 
          <Text style={raceDayStyles.statLabel}>PRACTICE DATES</Text>
          <Text style={raceDayStyles.cardMetaRight}>{days.length} date{days.length === 1 ? '' : 's'}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.onlyScroll}
        contentContainerStyle={styles.onlyScrollContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        {days.length ? days.filter((day) => Boolean(day && getPracticeKey(day))).map((day) => (
          <PracticeDayRow
            key={getPracticeKey(day)}
            day={day}
            selected={selectedKey === getPracticeKey(day)}
            onPress={pickDay}
          />
        )) : (
          <View style={styles.emptyBox}>
            <Text style={raceDayStyles.emptyText}>Tap Find Practice to load LiveRC practice dates.</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.staticBottom}>
        {selected ? (
          <View style={styles.selectedSummary}>
            <Text style={raceDayStyles.statLabel}>SELECTED PRACTICE DATE</Text>
            <Text style={raceDayStyles.cardTitle} numberOfLines={1}>{selected.label || selected.dateLabel || 'Practice Date Selected'}</Text>
            <Text style={raceDayStyles.cardSub} numberOfLines={1}>{selected.practiceUrl || 'Ready to view practice'}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={raceDayStyles.primaryButton} onPress={handleSelectPracticeDay} activeOpacity={0.82}>
          {selecting ? <ActivityIndicator /> : <Text style={raceDayStyles.primaryButtonText}>Select Practice Date</Text>}
        </TouchableOpacity>

        {message ? <Text style={styles.message} numberOfLines={2}>{message}</Text> : null}
      </View>
    </RaceDayPopup>
  );
}

export { RaceDayPracticeDayPickerPopup };

const styles = StyleSheet.create({
  popupContent: {
    width: '100%',
  },
  staticTop: {
    flexShrink: 0,
  },
  staticBottom: {
    flexShrink: 0,
    paddingTop: 10,
  },
  urlHint: {
    color: raceDayColors.muted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 5,
  },
  findButton: {
    marginTop: 9,
    minHeight: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: raceDayColors.accent,
    backgroundColor: raceDayColors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlyScroll: {
    flexGrow: 0,
    maxHeight: 280,
    marginTop: 8,
  },
  onlyScrollContent: {
    gap: 7,
    paddingBottom: 3,
  },
  emptyBox: {
    minHeight: 110,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    backgroundColor: raceDayColors.card,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  dayRow: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    backgroundColor: raceDayColors.card,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  dayRowSelected: {
    borderColor: raceDayColors.accent,
    backgroundColor: raceDayColors.accentSoft,
  },
  dayAccent: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 999,
    backgroundColor: raceDayColors.accent,
  },
  dayTitle: {
    color: raceDayColors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  daySub: {
    color: raceDayColors.muted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
  },
  dayStatus: {
    color: raceDayColors.accent,
    fontSize: 10,
    fontWeight: '900',
  },
  dayStatusSelected: {
    color: raceDayColors.text,
  },
  selectedSummary: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    backgroundColor: raceDayColors.cardAlt,
    padding: 10,
    marginBottom: 9,
  },

  monthWrap: {
    marginTop: 9,
  },
  monthButton: {
    minHeight: 36,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    backgroundColor: raceDayColors.cardAlt,
    paddingHorizontal: 11,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  monthButtonText: {
    color: raceDayColors.text,
    fontSize: 12,
    fontWeight: '900',
    flex: 1,
  },
  monthChevron: {
    color: raceDayColors.accent,
    fontSize: 10,
    fontWeight: '900',
  },
  monthMenu: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    backgroundColor: raceDayColors.card,
    marginTop: 6,
    overflow: 'hidden',
  },
  monthOption: {
    minHeight: 34,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: raceDayColors.border,
  },
  monthOptionSelected: {
    backgroundColor: raceDayColors.accentSoft,
  },
  monthOptionText: {
    color: raceDayColors.text,
    fontSize: 11,
    fontWeight: '900',
  },
  monthOptionTextSelected: {
    color: raceDayColors.accent,
  },
  monthOptionUrl: {
    color: raceDayColors.muted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  message: {
    color: raceDayColors.muted,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 7,
  },
});
