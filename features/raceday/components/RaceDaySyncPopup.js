import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import RaceDayPopup from './RaceDayPopup';
import { findRecentEvents } from '../lib/liverc/liveRcEventFinder';
import { getEventsUrl, normalizeLiveRcEventUrl, normalizeLiveRcSiteUrl } from '../lib/liverc/liveRcUrls';
import { saveTrackLiveRcUrl } from '../lib/raceDayStorage';
import { getTrackLiveRcUrl } from '../lib/raceDayModel';
import { raceDayColors, raceDayStyles } from '../styles/raceDayStyles';

function getEventKey(event = {}) {
  return event.eventUrl || event.url || event.href || event.id || `${event.title || 'event'}-${event.dateLabel || ''}`;
}

function getSelectedEvent(events = [], selectedEventUrl = '') {
  const normalizedSelected = normalizeLiveRcEventUrl(selectedEventUrl, '');
  return events.find((event) => normalizeLiveRcEventUrl(event.eventUrl, '') === normalizedSelected) || null;
}

function getRaceDayEventTitle(raceDay = {}) {
  return (
    raceDay?.eventTitle ||
    raceDay?.eventName ||
    raceDay?.selectedEventTitle ||
    raceDay?.liveRcEventTitle ||
    raceDay?.event?.title ||
    raceDay?.selectedEvent?.title ||
    ''
  );
}

function getRaceDayEventDate(raceDay = {}) {
  return (
    raceDay?.eventDateLabel ||
    raceDay?.eventDate ||
    raceDay?.selectedEventDateLabel ||
    raceDay?.liveRcEventDateLabel ||
    raceDay?.event?.dateLabel ||
    raceDay?.selectedEvent?.dateLabel ||
    ''
  );
}

export default function RaceDaySyncPopup({
  visible,
  raceDay,
  track,
  onClose,
  onSyncSelected,
}) {
  const initialUrl = useMemo(() => raceDay?.siteUrl || getTrackLiveRcUrl(track || {}) || '', [raceDay, track]);
  const [siteUrl, setSiteUrl] = useState(initialUrl);
  const [events, setEvents] = useState([]);
  const [selectedEventUrl, setSelectedEventUrl] = useState(raceDay?.eventUrl || '');
  const [selectedEventMeta, setSelectedEventMeta] = useState({
    title: getRaceDayEventTitle(raceDay),
    dateLabel: getRaceDayEventDate(raceDay),
  });
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [startingSync, setStartingSync] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSiteUrl(initialUrl);
    setSelectedEventUrl(raceDay?.eventUrl || '');
    setSelectedEventMeta({
      title: getRaceDayEventTitle(raceDay),
      dateLabel: getRaceDayEventDate(raceDay),
    });
    setEvents([]);
    setMessage('');
    setStartingSync(false);
  }, [visible, initialUrl, raceDay?.eventUrl, raceDay?.eventTitle, raceDay?.eventDateLabel]);

  function handlePickEvent(event) {
    const eventUrl = normalizeLiveRcEventUrl(event.eventUrl, siteUrl);
    setSelectedEventUrl(eventUrl);
    setSelectedEventMeta({
      title: event.title || 'LiveRC Event',
      dateLabel: event.dateLabel || '',
    });
  }

  async function handleFindEvents() {
    const normalized = normalizeLiveRcSiteUrl(siteUrl);
    const eventsUrl = getEventsUrl(siteUrl);
    if (!normalized) {
      setMessage('Enter the LiveRC site URL first. Example: shopimrc.liverc.com');
      return;
    }

    setLoadingEvents(true);
    setMessage(`Checking ${eventsUrl}`);
    try {
      setSiteUrl(normalized);
      if (track?.id || track?.trackId) {
        await saveTrackLiveRcUrl(track.id || track.trackId, normalized);
      }
      const found = await findRecentEvents(normalized, { limit: 30 });
      setEvents(found);

      const current = getSelectedEvent(found, selectedEventUrl);
      if (current) {
        handlePickEvent(current);
      } else if (!selectedEventUrl && found[0]?.eventUrl) {
        handlePickEvent(found[0]);
      }

      setMessage(found.length ? '' : 'No LiveRC events were found at /events/. Check the LiveRC site URL and try again.');
    } catch (error) {
      setMessage(error.message || 'Could not connect to LiveRC.');
    } finally {
      setLoadingEvents(false);
    }
  }

  async function handleSyncSelectedEvent() {
    const normalizedSite = normalizeLiveRcSiteUrl(siteUrl);
    const normalizedEvent = normalizeLiveRcEventUrl(selectedEventUrl, normalizedSite);
    if (!normalizedEvent) {
      setMessage('Select a LiveRC event first.');
      return;
    }

    const selected = getSelectedEvent(events, normalizedEvent);
    const eventTitle = selected?.title || selectedEventMeta.title || getRaceDayEventTitle(raceDay) || '';
    const eventDateLabel = selected?.dateLabel || selectedEventMeta.dateLabel || getRaceDayEventDate(raceDay) || '';

    setStartingSync(true);
    setMessage('');
    onSyncSelected?.({
      eventUrl: normalizedEvent,
      siteUrl: normalizedSite,
      eventTitle,
      eventDateLabel,
    });
    setStartingSync(false);
  }

  const selectedEvent = getSelectedEvent(events, selectedEventUrl);
  const selectedTitle = selectedEvent?.title || selectedEventMeta.title || getRaceDayEventTitle(raceDay) || '';
  const selectedDate = selectedEvent?.dateLabel || selectedEventMeta.dateLabel || getRaceDayEventDate(raceDay) || '';

  return (
    <RaceDayPopup
      visible={visible}
      title="LiveRC Sync"
      subtitle="Find the event, then sync the selected RaceDay."
      onClose={onClose}
      centered
      keyboardAware
      bodyScroll={false}
      contentContainerStyle={raceDayStyles.syncPickerContent}
    >
      <View style={raceDayStyles.syncPickerStaticTop}>
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
        <Text style={raceDayStyles.eventPickerUrlHint} numberOfLines={1}>
          Events checked at: {getEventsUrl(siteUrl) || 'https://your-site.liverc.com/events/'}
        </Text>

        <TouchableOpacity style={raceDayStyles.eventFindButton} onPress={handleFindEvents} activeOpacity={0.82}>
          {loadingEvents ? <ActivityIndicator /> : <Text style={raceDayStyles.secondaryButtonText}>Find Events</Text>}
        </TouchableOpacity>

        <View style={[raceDayStyles.rowBetween, { marginTop: 10 }]}>
          <Text style={raceDayStyles.statLabel}>EVENTS FOUND</Text>
          <Text style={raceDayStyles.cardMetaRight}>{events.length} event{events.length === 1 ? '' : 's'}</Text>
        </View>
      </View>

      <ScrollView
        style={raceDayStyles.eventPickerOnlyScroll}
        contentContainerStyle={raceDayStyles.eventPickerOnlyScrollContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        {events.length ? events.map((event) => {
          const eventUrl = normalizeLiveRcEventUrl(event.eventUrl, siteUrl);
          const selected = normalizeLiveRcEventUrl(selectedEventUrl, siteUrl) === eventUrl;
          return (
            <TouchableOpacity
              key={getEventKey(event)}
              style={[raceDayStyles.eventCard, selected && raceDayStyles.selectedEventCard]}
              onPress={() => handlePickEvent(event)}
              activeOpacity={0.86}
            >
              <View style={raceDayStyles.cardAccent} />
              <Text style={raceDayStyles.eventTitle} numberOfLines={1}>{event.title}</Text>
              <Text style={raceDayStyles.eventDate} numberOfLines={1}>{event.dateLabel || 'Date not listed'}</Text>
            </TouchableOpacity>
          );
        }) : (
          <View style={raceDayStyles.eventPickerEmptyBox}>
            <Text style={raceDayStyles.emptyText}>Tap Find Events to load LiveRC events.</Text>
          </View>
        )}
      </ScrollView>

      <View style={raceDayStyles.syncPickerStaticBottom}>
        {selectedEventUrl ? (
          <View style={raceDayStyles.selectedEventSummaryCompact}>
            <Text style={raceDayStyles.statLabel}>SELECTED RACEDAY EVENT</Text>
            <Text style={raceDayStyles.cardTitle} numberOfLines={1}>{selectedTitle || 'LiveRC Event Selected'}</Text>
            <Text style={raceDayStyles.cardSub} numberOfLines={1}>{selectedDate || 'Ready to sync selected event'}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={raceDayStyles.primaryButton} onPress={handleSyncSelectedEvent} activeOpacity={0.82}>
          {startingSync ? <ActivityIndicator /> : <Text style={raceDayStyles.primaryButtonText}>Sync Selected RaceDay</Text>}
        </TouchableOpacity>

        {message ? <Text style={raceDayStyles.eventPickerMessage} numberOfLines={2}>{message}</Text> : null}
      </View>
    </RaceDayPopup>
  );
}

export { RaceDaySyncPopup };
