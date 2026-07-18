import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RaceDayHeader from '../../features/raceday/components/RaceDayHeader';
import RaceDayVehicleCard from '../../features/raceday/components/RaceDayVehicleCard';
import RaceDayBottomActions from '../../features/raceday/components/RaceDayBottomActions';
import RaceDayPopup from '../../features/raceday/components/RaceDayPopup';
import RaceDayResultCard from '../../features/raceday/components/RaceDayResultCard';
import RaceDayTop5Popup from '../../features/raceday/components/RaceDayTop5Popup';
import RaceDaySyncPopup from '../../features/raceday/components/RaceDaySyncPopup';
import RaceDayNotesPopup from '../../features/raceday/components/RaceDayNotesPopup';
import RaceDayRecentChangesPopup from '../../features/raceday/components/RaceDayRecentChangesPopup';
import RaceDayModeToggle from '../../features/raceday/components/RaceDayModeToggle';
import RaceDayPracticeCard from '../../features/raceday/components/RaceDayPracticeCard';
import RaceDayPracticeSessionsPopup from '../../features/raceday/components/RaceDayPracticeSessionsPopup';
import RaceDayPracticeDayPickerPopup from '../../features/raceday/components/RaceDayPracticeDayPickerPopup';
import RaceDayPracticeTrackCard from '../../features/raceday/components/RaceDayPracticeTrackCard';
import RaceDaySyncStatusPopup, { mergeSyncProgress } from '../../features/raceday/components/RaceDaySyncStatusPopup';
import { hydrateActiveRaceDay, endRaceDay, saveRaceDayEvent } from '../../features/raceday/lib/raceDayStorage';
import { getRaceDayRuns, getLatestRunForVehicle, getRunsForVehicleFromList } from '../../features/raceday/lib/raceDayResultStorage';
import {
  getRaceDaySelectedPracticeDay,
  getPracticeDayKey,
  getPracticeSummariesForVehiclesByDay,
  saveRaceDaySelectedPracticeDay,
  formatPracticeDayLabel,
} from '../../features/raceday/lib/raceDayPracticeDay';
import { getCompareFields, saveCompareFields, toggleCompareField } from '../../features/raceday/lib/raceDayCompare';
import { getTrackDisplayName, getTrackLiveRcUrl, getVehicleDisplayName, normalizeId } from '../../features/raceday/lib/raceDayModel';
import { syncLiveRcRaceDay } from '../../features/raceday/lib/liverc/liveRcSyncRunner';
import { syncLiveRcPracticeDay } from '../../features/raceday/lib/liverc/liveRcPracticeSyncRunner';
import { findEventByUrl } from '../../features/raceday/lib/liverc/liveRcEventFinder';
import { raceDayColors, raceDayStyles } from '../../features/raceday/styles/raceDayStyles';

function getStoredEventTitle(raceDay = {}) {
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

function getStoredEventDateLabel(raceDay = {}) {
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

function getEventIdLabel(eventUrl = '') {
  const id = String(eventUrl || '').match(/[?&]id=(\d+)/i)?.[1];
  return id ? `LiveRC Event #${id}` : '';
}

export default function RaceDayDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [track, setTrack] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [runs, setRuns] = useState([]);
  const [compareFields, setCompareFields] = useState([]);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [top5Open, setTop5Open] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [dashboardMode, setDashboardMode] = useState('race');
  const [practiceSummaries, setPracticeSummaries] = useState({});
  const [practiceSessionsOpen, setPracticeSessionsOpen] = useState(false);
  const [practiceDayPickerOpen, setPracticeDayPickerOpen] = useState(false);
  const [selectedPracticeDay, setSelectedPracticeDay] = useState(null);
  const [selectedPracticeDayLabel, setSelectedPracticeDayLabel] = useState('');
  const [practiceRefreshing, setPracticeRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatusOpen, setSyncStatusOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState([]);
  const [syncSummary, setSyncSummary] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedPracticeVehicle, setSelectedPracticeVehicle] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [lineupRefreshNonce, setLineupRefreshNonce] = useState(0);

  const trackName = getTrackDisplayName(track || {});
  const hasLiveRcEvent = Boolean(active?.eventUrl);
  const eventDateLabel = getStoredEventDateLabel(active);

  const latestRunsByVehicle = useMemo(() => {
    const map = new Map();
    vehicles.forEach((vehicle) => {
      const id = normalizeId(vehicle.id || vehicle.vehicleId);
      map.set(id, getLatestRunForVehicle(runs, id));
    });
    return map;
  }, [vehicles, runs]);

  const runsByVehicle = useMemo(() => {
    const map = new Map();
    vehicles.forEach((vehicle) => {
      const id = normalizeId(vehicle.id || vehicle.vehicleId);
      map.set(id, getRunsForVehicleFromList(runs, id));
    });
    return map;
  }, [vehicles, runs]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ active: raceDayRaw, track: nextTrack, vehicles: nextVehicles }, nextFields] = await Promise.all([
      hydrateActiveRaceDay(),
      getCompareFields(),
    ]);

    let raceDay = raceDayRaw;

    // Repair older active RaceDay sessions that only stored eventUrl/siteUrl before
    // the event title/date fields were added. This keeps the dashboard from showing
    // a blank event line after updating the RaceDay files.
    if (raceDay?.eventUrl && (!getStoredEventTitle(raceDay) || !getStoredEventDateLabel(raceDay))) {
      try {
        const foundEvent = await findEventByUrl(
          raceDay.siteUrl || getTrackLiveRcUrl(nextTrack || {}) || raceDay.eventUrl,
          raceDay.eventUrl,
        );
        if (foundEvent?.title || foundEvent?.dateLabel) {
          raceDay = await saveRaceDayEvent({
            eventUrl: raceDay.eventUrl,
            siteUrl: raceDay.siteUrl || getTrackLiveRcUrl(nextTrack || {}),
            eventTitle: foundEvent.title || getStoredEventTitle(raceDay),
            eventDateLabel: foundEvent.dateLabel || getStoredEventDateLabel(raceDay),
          });
        }
      } catch (error) {
        // Do not block RaceDay load if LiveRC cannot be reached.
        console.warn('[RaceDay] Could not repair stored LiveRC event title', error);
      }
    }

    setActive(raceDay);
    setTrack(nextTrack);
    setVehicles(nextVehicles);
    setCompareFields(nextFields);
    const raceDayId = raceDay?.id || raceDay?.raceDayId;
    if (raceDayId) {
      const storedPracticeDay = await getRaceDaySelectedPracticeDay(raceDayId);
      const [nextRuns, nextPracticeSummaries] = await Promise.all([
        getRaceDayRuns(raceDayId),
        storedPracticeDay ? getPracticeSummariesForVehiclesByDay(raceDayId, nextVehicles, storedPracticeDay) : Promise.resolve({}),
      ]);
      setRuns(nextRuns);
      setSelectedPracticeDay(storedPracticeDay);
      setSelectedPracticeDayLabel(storedPracticeDay ? formatPracticeDayLabel(storedPracticeDay) : '');
      setPracticeSummaries(nextPracticeSummaries);
    } else {
      setRuns([]);
      setSelectedPracticeDay(null);
      setSelectedPracticeDayLabel('');
      setPracticeSummaries({});
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openResults(vehicle, run) {
    const fallbackRun = latestRunsByVehicle.get(normalizeId(vehicle.id || vehicle.vehicleId));
    setSelectedVehicle(vehicle);
    setSelectedRun(run || fallbackRun);
    setResultsOpen(true);
  }

  function openTop5(run) {
    setSelectedRun(run);
    setTop5Open(true);
  }

  async function handleToggleCompareField(key) {
    const next = toggleCompareField(compareFields, key);
    setCompareFields(next);
    await saveCompareFields(next);
  }

  function openPracticeSessions(vehicle) {
    setSelectedPracticeVehicle(vehicle);
    setPracticeSessionsOpen(true);
  }

  function handleDashboardModeChange(nextMode) {
    if (nextMode === 'practice') {
      if (selectedPracticeDay) {
        setDashboardMode('practice');
        return;
      }
      setPracticeDayPickerOpen(true);
      return;
    }
    setDashboardMode('race');
  }

  async function loadPracticeForDay(day, { sync = false } = {}) {
    const raceDayId = active?.id || active?.raceDayId;
    const dayKey = getPracticeDayKey(day);
    if (!raceDayId || !dayKey) return;

    setPracticeRefreshing(true);
    try {
      if (sync) {
        await syncLiveRcPracticeDay({
          raceDay: active,
          track,
          vehicles,
          practiceDay: day,
        });
      }
      const nextSummaries = await getPracticeSummariesForVehiclesByDay(raceDayId, vehicles, day);
      setPracticeSummaries(nextSummaries);
    } catch (error) {
      Alert.alert('Practice Refresh', error?.message || 'Practice refresh failed.');
      const nextSummaries = await getPracticeSummariesForVehiclesByDay(raceDayId, vehicles, day);
      setPracticeSummaries(nextSummaries);
    } finally {
      setPracticeRefreshing(false);
    }
  }

  async function refreshPracticeSummaries() {
    if (!selectedPracticeDay) {
      setPracticeDayPickerOpen(true);
      return;
    }
    await loadPracticeForDay(selectedPracticeDay, { sync: true });
  }

  async function handlePracticeDaySelected(day) {
    const raceDayId = active?.id || active?.raceDayId;
    const dayKey = getPracticeDayKey(day);
    if (!raceDayId || !dayKey) return;

    const savedDay = await saveRaceDaySelectedPracticeDay(raceDayId, day);
    setSelectedPracticeDay(savedDay);
    setSelectedPracticeDayLabel(formatPracticeDayLabel(savedDay));
    setDashboardMode('practice');
    setPracticeDayPickerOpen(false);
    await loadPracticeForDay(savedDay, { sync: true });
  }

  function openSetup(vehicle) {
    const trackId = active?.trackId || track?.id || track?.trackId;
    const vehicleId = vehicle?.id || vehicle?.vehicleId;
    if (!trackId || !vehicleId) return;
    router.push(`/setups/editor/${trackId}/${vehicleId}`);
  }

  function confirmEndRaceDay() {
    Alert.alert('End Race Day?', 'This clears the active RaceDay session keys and returns to Dashboard. Saved runs stay local.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Race Day',
        style: 'destructive',
        onPress: async () => {
          await endRaceDay();
          router.replace('/');
        },
      },
    ]);
  }

  async function handleSynced(result) {
    await load();
    if (result?.progress?.length) setSyncProgress(result.progress);
  }

  function handleSyncProgress(update) {
    setSyncStatusOpen(true);
    setSyncProgress((previous) => mergeSyncProgress(previous, update));
  }

  async function runLiveRcSync({ eventUrl, siteUrl, eventTitle, eventDateLabel, saveEvent = false } = {}) {
    if (syncing) return;

    const nextEventUrl = eventUrl || active?.eventUrl;
    const nextSiteUrl = siteUrl || active?.siteUrl || getTrackLiveRcUrl(track || {});
    if (!nextEventUrl) {
      setSyncOpen(true);
      return;
    }

    setSyncOpen(false);
    setSyncing(true);
    setSyncStatusOpen(true);
    setSyncProgress([]);
    setSyncSummary('');

    try {
      let raceDayForSync = {
        ...active,
        eventUrl: nextEventUrl,
        siteUrl: nextSiteUrl,
        eventTitle: eventTitle || getStoredEventTitle(active),
        eventDateLabel: eventDateLabel || getStoredEventDateLabel(active),
      };

      if (saveEvent) {
        raceDayForSync = await saveRaceDayEvent({
          eventUrl: nextEventUrl,
          siteUrl: nextSiteUrl,
          eventTitle: raceDayForSync.eventTitle,
          eventDateLabel: raceDayForSync.eventDateLabel,
        });
        setActive(raceDayForSync);
      }

      const result = await syncLiveRcRaceDay({
        raceDay: raceDayForSync,
        track,
        vehicles,
        eventUrl: nextEventUrl,
        siteUrl: nextSiteUrl,
        onProgress: handleSyncProgress,
      });

      await load();
      setLineupRefreshNonce((value) => value + 1);
      if (result?.progress?.length) setSyncProgress(result.progress);
      setSyncSummary('Complete.');
    } catch (error) {
      setSyncSummary(error?.message || 'LiveRC sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  function handleSyncPress() {
    if (!hasLiveRcEvent) {
      setSyncOpen(true);
      return;
    }
    runLiveRcSync();
  }

  function handleSyncSelectedEvent(eventPayload) {
    runLiveRcSync({ ...eventPayload, saveEvent: true });
  }

  if (loading) {
    return (
      <View style={raceDayStyles.screen}>
        <View style={raceDayStyles.container}>
          <RaceDayHeader title="RaceDay" subtitle="Loading" onLeftPress={() => router.replace('/')} leftLabel="Home" />
          <View style={raceDayStyles.empty}><ActivityIndicator /></View>
        </View>
      </View>
    );
  }

  if (!active?.trackId) {
    return (
      <View style={raceDayStyles.screen}>
        <View style={raceDayStyles.container}>
          <RaceDayHeader title="RaceDay" subtitle="No active session" onLeftPress={() => router.replace('/')} leftLabel="Home" />
          <View style={raceDayStyles.empty}>
            <Text style={raceDayStyles.emptyText}>No active Race Day was found. Start Race Day from the Dashboard.</Text>
          </View>
        </View>
        <RaceDayBottomActions primaryLabel="Select Track" onPrimaryPress={() => router.replace('/raceday/select-track')} />
      </View>
    );
  }

  return (
    <View style={raceDayStyles.screen}>
      <View style={raceDayStyles.container}>
        <RaceDayHeader
          title="RaceDay"
          subtitle={trackName}
          leftLabel="Home"
          onLeftPress={() => router.replace('/')}
          rightLabel="End"
          rightTone="danger"
          onRightPress={confirmEndRaceDay}
        />

        <ScrollView contentContainerStyle={[raceDayStyles.scrollContent, { paddingBottom: Math.max(insets.bottom + 28, 52) }]} showsVerticalScrollIndicator={false}>
          <RaceDayModeToggle mode={dashboardMode} onChange={handleDashboardModeChange} />

          {dashboardMode === 'practice' ? (
            <RaceDayPracticeTrackCard
              raceDay={active}
              trackName={trackName}
              vehicleCount={vehicles.length}
              practiceDayLabel={selectedPracticeDayLabel}
              onSelectPracticeDay={() => setPracticeDayPickerOpen(true)}
              onRefreshPractice={refreshPracticeSummaries}
              refreshing={practiceRefreshing}
            />
          ) : (
            <View style={raceDayStyles.card}>
              <View style={raceDayStyles.cardAccent} />
              <View style={raceDayStyles.raceDayTrackCardLayout}>
                <View style={raceDayStyles.flex1}>
                  <Text style={raceDayStyles.cardTitle}>{trackName}</Text>
                  <Text style={raceDayStyles.cardSub}>
                    {new Date(active.startedAt || Date.now()).toLocaleDateString()} • {vehicles.length} vehicle{vehicles.length === 1 ? '' : 's'}
                  </Text>
                  {hasLiveRcEvent && eventDateLabel ? (
                    <Text style={raceDayStyles.dashboardEventDate} numberOfLines={1}>{eventDateLabel}</Text>
                  ) : null}
                </View>

                <View style={raceDayStyles.raceDayTrackCardActions}>
                  <TouchableOpacity style={raceDayStyles.changeEventButton} onPress={() => setSyncOpen(true)} activeOpacity={0.82}>
                    <Text style={raceDayStyles.changeEventButtonText}>{hasLiveRcEvent ? 'Change Event' : 'Choose Event'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[raceDayStyles.pill, { borderColor: raceDayColors.blue }, syncing && { opacity: 0.55 }]}
                    onPress={handleSyncPress}
                    disabled={syncing}
                    activeOpacity={0.82}
                  >
                    {syncing ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <Text style={[raceDayStyles.pillText, { color: raceDayColors.text }]}>{hasLiveRcEvent ? 'Re-Sync' : 'Sync'}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {vehicles.length ? (dashboardMode === 'race' ? vehicles.map((vehicle) => {
            const id = normalizeId(vehicle.id || vehicle.vehicleId);
            return (
              <RaceDayVehicleCard
                key={id}
                vehicle={vehicle}
                latestRun={latestRunsByVehicle.get(id)}
                runsForVehicle={runsByVehicle.get(id)}
                compareFields={compareFields}
                lineupRefreshKey={lineupRefreshNonce}
                onOpenResults={(run) => openResults(vehicle, run)}
                onOpenSetup={() => openSetup(vehicle)}
              />
            );
          }) : vehicles.map((vehicle) => {
            const id = normalizeId(vehicle.id || vehicle.vehicleId);
            return (
              <RaceDayPracticeCard
                key={id}
                vehicle={vehicle}
                summary={practiceSummaries[id]}
                onOpenSessions={() => openPracticeSessions(vehicle)}
                onOpenSetup={() => openSetup(vehicle)}
              />
            );
          })) : (
            <View style={raceDayStyles.empty}>
              <Text style={raceDayStyles.emptyText}>No vehicles selected yet. Add vehicles to continue Race Day.</Text>
            </View>
          )}
        </ScrollView>
      </View>

      <RaceDayBottomActions
        secondaryLabel="Notes"
        onSecondaryPress={() => setNotesOpen(true)}
        tertiaryLabel="Changes"
        onTertiaryPress={() => setChangesOpen(true)}
        primaryLabel="Add Vehicles"
        onPrimaryPress={() => router.push('/raceday/select-vehicles?add=1')}
      />

      <RaceDayPopup
        visible={resultsOpen}
        title="Race Results"
        subtitle={selectedVehicle ? `${getVehicleDisplayName(selectedVehicle)} • tap stats to choose dashboard blocks` : 'Tap stats to choose dashboard blocks'}
        onClose={() => setResultsOpen(false)}
      >
        <RaceDayResultCard
          run={selectedRun}
          compareFields={compareFields}
          onToggleCompareField={handleToggleCompareField}
          onOpenTop5={openTop5}
        />
      </RaceDayPopup>

      <RaceDayTop5Popup visible={top5Open} run={selectedRun} onClose={() => setTop5Open(false)} />

      <RaceDayNotesPopup
        visible={notesOpen}
        raceDay={active}
        track={track}
        onClose={() => setNotesOpen(false)}
      />

      <RaceDayRecentChangesPopup
        visible={changesOpen}
        raceDay={active}
        vehicles={vehicles}
        onClose={() => setChangesOpen(false)}
      />

      <RaceDayPracticeSessionsPopup
        visible={practiceSessionsOpen}
        raceDay={active}
        vehicle={selectedPracticeVehicle}
        practiceDayKey={getPracticeDayKey(selectedPracticeDay)}
        practiceDayLabel={selectedPracticeDayLabel}
        onClose={() => setPracticeSessionsOpen(false)}
      />

      <RaceDayPracticeDayPickerPopup
        visible={practiceDayPickerOpen}
        raceDay={active}
        track={track}
        vehicles={vehicles}
        selectedDayKey={selectedPracticeDay}
        onSelectDay={handlePracticeDaySelected}
        onClose={() => setPracticeDayPickerOpen(false)}
      />

      <RaceDaySyncPopup
        visible={syncOpen}
        raceDay={active}
        track={track}
        onClose={() => setSyncOpen(false)}
        onSyncSelected={handleSyncSelectedEvent}
      />

      <RaceDaySyncStatusPopup
        visible={syncStatusOpen}
        syncing={syncing}
        progress={syncProgress}
        summary={syncSummary}
        onClose={() => setSyncStatusOpen(false)}
      />
    </View>
  );
}
