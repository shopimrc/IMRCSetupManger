import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import SelectorCard from '../../features/setups/components/SelectorCard';
import {
  ensureTrackForImportedSetup,
  ensureVehicleForImportedSetup,
  getLastViewedSetup,
  getSetups,
  getTracks,
  getVehicles,
  saveSetupCopyToTarget,
} from '../../features/setups/lib/setupStorage';
import {
  getEntityId,
  getTrackDisplayName,
  getVehicleDisplayName,
  makeSetupKey,
} from '../../features/setups/lib/setupModel';
import { setupColors, setupStyles } from '../../features/setups/styles/setupStyles';
import {
  consumePendingIncomingImrcImport,
  importPreparedSetupBundle,
  importPreparedSetupToTarget,
  pickSetupImportForReview,
  prepareSetupImportFromUri,
} from '../../features/setups/lib/setupFileTransfer';
import { migrateSetupsFromLegacyStorage } from '../../features/setups/lib/setupMigration';
import { markCloudDirty } from '../services/cloudSync';

function formatDate(value) {
  if (!value) return 'Not saved yet';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

const CREATE_NEW_VEHICLE_TARGET = '__create_new_vehicle_from_imrc__';
const CREATE_NEW_TRACK_TARGET = '__create_new_track_from_imrc__';

function setupImportVehicleName(preparedImport) {
  const setup = preparedImport?.setup || {};
  return preparedImport?.sourceVehicleName
    || setup.vehicleName
    || setup.carName
    || setup.vehicle
    || setup.name
    || 'Imported Vehicle';
}

function setupImportTrackName(preparedImport) {
  const setup = preparedImport?.setup || {};
  return preparedImport?.sourceTrackName
    || setup.trackName
    || setup.track
    || setup.trackTitle
    || 'Imported Track';
}

function setupImportVehicleMeta(preparedImport) {
  const setup = preparedImport?.setup || {};
  return preparedImport?.sourceChassisStyle
    || setup.vehicleChassisStyle
    || setup.chassisStyle
    || setup.chassisProfile?.label
    || 'Chassis Style';
}

function setupImportTrackMeta(preparedImport) {
  const setup = preparedImport?.setup || {};
  return preparedImport?.sourceTrackType
    || setup.trackType
    || setup.trackStyle
    || setup.trackCategory
    || setup.surface
    || 'Track Type';
}

function cleanTrackTypeValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (Array.isArray(value)) return value.map(cleanTrackTypeValue).filter(Boolean).join(' / ');
  if (typeof value === 'object') {
    return cleanTrackTypeValue(value.label || value.name || value.title || value.value);
  }
  return '';
}

function getTrackTypeDisplay(track) {
  if (!track) return 'Track Type';

  const candidates = [
    track.trackType,
    track.type,
    track.style,
    track.trackStyle,
    track.raceType,
    track.layout,
    track.category,
    track.trackCategory,
  ];

  const found = candidates.map(cleanTrackTypeValue).find(Boolean);
  return found || 'Track Type';
}

function setupTimeValue(setup) {
  const raw = setup?.savedAt || setup?.updatedAt || setup?.createdAt || setup?.id || '';
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getLatestSetupForVehicleTrack(setups, vehicleId, trackId) {
  const wantedKey = makeSetupKey(vehicleId, trackId);
  return setups
    .filter((setup) => makeSetupKey(setup.vehicleId, setup.trackId) === wantedKey)
    .sort((a, b) => setupTimeValue(b) - setupTimeValue(a))[0] || null;
}

function getSetupForVehicleTrack(setups, vehicleId, trackId) {
  return getLatestSetupForVehicleTrack(setups, vehicleId, trackId);
}

function normalizeCompare(value) {
  return String(value || '').trim().toLowerCase();
}

function findBestByIdOrName(items, wantedId, wantedName, displayGetter) {
  const id = String(wantedId || '');
  const name = normalizeCompare(wantedName);

  if (id) {
    const byId = items.find((item) => String(getEntityId(item)) === id);
    if (byId) return byId;
  }

  if (name) {
    return items.find((item) => normalizeCompare(displayGetter(item)) === name)
      || items.find((item) => normalizeCompare(displayGetter(item)).includes(name) || name.includes(normalizeCompare(displayGetter(item))));
  }

  return null;
}

function buildLastOpenedSetup({ lastViewedSetup, setups, tracks, vehicles }) {
  if (!lastViewedSetup?.vehicleId || !lastViewedSetup?.trackId) return null;

  const vehicleId = String(lastViewedSetup.vehicleId);
  const trackId = String(lastViewedSetup.trackId);
  const setup = getSetupForVehicleTrack(setups, vehicleId, trackId);
  const vehicle = vehicles.find((item) => getEntityId(item) === vehicleId);
  const track = tracks.find((item) => getEntityId(item) === trackId);

  return {
    vehicleId,
    trackId,
    setup,
    vehicleName: lastViewedSetup.vehicleName || setup?.vehicleName || getVehicleDisplayName(vehicle) || 'Last Vehicle',
    trackName: lastViewedSetup.trackName || setup?.trackName || getTrackDisplayName(track) || 'Last Track',
    savedAt: setup?.savedAt || setup?.updatedAt || lastViewedSetup.savedAt || lastViewedSetup.updatedAt,
  };
}

function ImportTargetPopup({
  visible,
  pendingImport,
  vehicles,
  tracks,
  selectedVehicleId,
  selectedTrackId,
  importStep,
  busy,
  onSelectVehicle,
  onSelectTrack,
  onSetImportStep,
  onCancel,
  onConfirm,
}) {
  const insets = useSafeAreaInsets();
  const selectedVehicle = vehicles.find((item) => String(getEntityId(item)) === String(selectedVehicleId));
  const selectedTrack = tracks.find((item) => String(getEntityId(item)) === String(selectedTrackId));
  const sourceVehicleName = setupImportVehicleName(pendingImport);
  const sourceTrackName = setupImportTrackName(pendingImport);
  const sourceVehicleMeta = setupImportVehicleMeta(pendingImport);
  const sourceTrackMeta = setupImportTrackMeta(pendingImport);
  const creatingVehicle = selectedVehicleId === CREATE_NEW_VEHICLE_TARGET;
  const creatingTrack = selectedTrackId === CREATE_NEW_TRACK_TARGET;
  const canImport = Boolean((selectedVehicle || creatingVehicle) && (selectedTrack || creatingTrack));
  const step = importStep === 'vehicle' ? 'vehicle' : 'track';
  const optionItems = step === 'track' ? tracks : vehicles;

  const stepTitle = step === 'track' ? 'Choose Track' : 'Choose Car';
  const stepMessage = step === 'track'
    ? 'First choose which track this setup belongs to. This helps avoid duplicate track records.'
    : 'Now choose the car this setup belongs to, or create the car from the file.';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={[
          setupStyles.confirmBackdrop,
          {
            paddingTop: Math.max(insets.top + 14, 22),
            paddingBottom: Math.max(insets.bottom + 14, 22),
          },
        ]}
      >
        <View style={[setupStyles.confirmCard, setupStyles.importReviewCard]}>
          <View style={setupStyles.confirmAccent} />
          <Text style={setupStyles.confirmEyebrow}>IMPORT .IMRC</Text>
          <Text style={setupStyles.confirmTitle}>{stepTitle}</Text>
          <Text style={setupStyles.confirmMessage}>{stepMessage}</Text>

          <View style={setupStyles.importSourceBoxCompact}>
            <Text style={setupStyles.importSourceLabel}>File says</Text>
            <View style={setupStyles.importSourcePairRow}>
              <View style={setupStyles.importSourcePair}>
                <Text style={setupStyles.importSourceSmallLabel}>Track</Text>
                <Text style={setupStyles.importSourceTitle}>{sourceTrackName}</Text>
                <Text style={setupStyles.importSourceMeta}>{sourceTrackMeta}</Text>
              </View>
              <View style={setupStyles.importSourcePair}>
                <Text style={setupStyles.importSourceSmallLabel}>Car</Text>
                <Text style={setupStyles.importSourceTitle}>{sourceVehicleName}</Text>
                <Text style={setupStyles.importSourceMeta}>{sourceVehicleMeta}</Text>
              </View>
            </View>
          </View>

          <View style={setupStyles.importWizardProgressRow}>
            <View style={[setupStyles.importWizardStepPill, setupStyles.importWizardStepPillActive]}>
              <Text style={setupStyles.importWizardStepText}>1 Track</Text>
            </View>
            <View style={[setupStyles.importWizardStepLine, step === 'vehicle' && setupStyles.importWizardStepLineActive]} />
            <View style={[setupStyles.importWizardStepPill, step === 'vehicle' && setupStyles.importWizardStepPillActive]}>
              <Text style={setupStyles.importWizardStepText}>2 Car</Text>
            </View>
          </View>

          {step === 'vehicle' ? (
            <View style={setupStyles.importSelectedTargetBox}>
              <Text style={setupStyles.importSourceSmallLabel}>Selected Track</Text>
              <Text style={setupStyles.importTargetValue}>{creatingTrack ? `+ New: ${sourceTrackName}` : selectedTrack ? getTrackDisplayName(selectedTrack) : 'No track selected'}</Text>
              <Pressable onPress={() => onSetImportStep('track')} style={({ pressed }) => [setupStyles.importChangeSmallButton, pressed && setupStyles.cardPressed]}>
                <Text style={setupStyles.importChangeSmallText}>Change Track</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={setupStyles.importSectionLabel}>{step === 'track' ? 'Select track to import into' : 'Select car to import into'}</Text>
          <ScrollView style={setupStyles.importOptionScrollLarge} contentContainerStyle={setupStyles.importOptionScrollContent}>
            <Pressable
              key={`${step}_create_new`}
              onPress={() => step === 'track' ? onSelectTrack(CREATE_NEW_TRACK_TARGET) : onSelectVehicle(CREATE_NEW_VEHICLE_TARGET)}
              style={({ pressed }) => [
                setupStyles.importOptionRow,
                (step === 'track' ? creatingTrack : creatingVehicle) && setupStyles.importOptionRowSelected,
                pressed && setupStyles.cardPressed,
              ]}
            >
              <View style={setupStyles.importOptionAccent} />
              <View style={setupStyles.headerTextWrap}>
                <Text style={setupStyles.importOptionTitle}>+ Create new {step === 'track' ? 'track' : 'car'} from file</Text>
                <Text style={setupStyles.importOptionMeta}>{step === 'track' ? `${sourceTrackName} • ${sourceTrackMeta}` : `${sourceVehicleName} • ${sourceVehicleMeta}`}</Text>
              </View>
              <Text style={setupStyles.importOptionCheck}>{(step === 'track' ? creatingTrack : creatingVehicle) ? 'Selected' : 'Choose'}</Text>
            </Pressable>

            {optionItems.map((item) => {
              const id = String(getEntityId(item));
              const selected = step === 'track' ? id === String(selectedTrackId) : id === String(selectedVehicleId);
              const title = step === 'track' ? getTrackDisplayName(item) : getVehicleDisplayName(item);
              const subtitle = step === 'track'
                ? getTrackTypeDisplay(item)
                : (item.chassisStyle || item.chassis || item.vehicleStyle || item.model || 'Car');

              return (
                <Pressable
                  key={`${step}_${id}`}
                  onPress={() => step === 'track' ? onSelectTrack(id) : onSelectVehicle(id)}
                  style={({ pressed }) => [
                    setupStyles.importOptionRow,
                    selected && setupStyles.importOptionRowSelected,
                    pressed && setupStyles.cardPressed,
                  ]}
                >
                  <View style={setupStyles.importOptionAccent} />
                  <View style={setupStyles.headerTextWrap}>
                    <Text style={setupStyles.importOptionTitle}>{title}</Text>
                    <Text style={setupStyles.importOptionMeta}>{subtitle}</Text>
                  </View>
                  <Text style={setupStyles.importOptionCheck}>{selected ? 'Selected' : 'Use Existing'}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={setupStyles.confirmActionStack}>
            {step === 'track' ? (
              <Pressable
                disabled={busy || !(selectedTrack || creatingTrack)}
                onPress={() => onSetImportStep('vehicle')}
                style={({ pressed }) => [setupStyles.confirmPrimaryButton, (busy || !(selectedTrack || creatingTrack)) && setupStyles.buttonDisabled, pressed && setupStyles.cardPressed]}
              >
                <Text style={setupStyles.confirmPrimaryText}>Next: Choose Car</Text>
              </Pressable>
            ) : (
              <Pressable
                disabled={busy || !canImport}
                onPress={onConfirm}
                style={({ pressed }) => [setupStyles.confirmPrimaryButton, (busy || !canImport) && setupStyles.buttonDisabled, pressed && setupStyles.cardPressed]}
              >
                <Text style={setupStyles.confirmPrimaryText}>{busy ? 'Importing...' : 'Import Setup'}</Text>
              </Pressable>
            )}
            <Pressable onPress={onCancel} style={({ pressed }) => [setupStyles.confirmSecondaryButton, pressed && setupStyles.cardPressed]}>
              <Text style={setupStyles.confirmSecondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CopySetupPopup({
  visible,
  copySource,
  tracks,
  selectedTrackId,
  busy,
  onSelectTrack,
  onCancel,
  onConfirm,
}) {
  const insets = useSafeAreaInsets();
  const sourceTrackId = String(copySource?.trackId || copySource?.setup?.trackId || '');
  const targetTracks = tracks.filter((track) => String(getEntityId(track)) !== sourceTrackId);
  const selectedTrack = tracks.find((item) => String(getEntityId(item)) === String(selectedTrackId));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={[
          setupStyles.confirmBackdrop,
          {
            paddingTop: Math.max(insets.top + 14, 22),
            paddingBottom: Math.max(insets.bottom + 14, 22),
          },
        ]}
      >
        <View style={[setupStyles.confirmCard, setupStyles.importReviewCard]}>
          <View style={setupStyles.confirmAccent} />
          <Text style={setupStyles.confirmEyebrow}>COPY SETUP</Text>
          <Text style={setupStyles.confirmTitle}>Copy to Track</Text>
          <Text style={setupStyles.confirmMessage}>
            Copy this car setup to another track. The original setup will stay where it is.
          </Text>

          <View style={setupStyles.importSourceBox}>
            <Text style={setupStyles.importSourceLabel}>Setup to copy</Text>
            <Text style={setupStyles.importSourceTitle}>{copySource?.setup?.vehicleName || copySource?.vehicleName || 'Car setup'}</Text>
            <Text style={setupStyles.importSourceMeta}>{copySource?.setup?.trackName || 'Current track'}</Text>
          </View>

          <ScrollView style={setupStyles.importOptionScroll} contentContainerStyle={setupStyles.importOptionScrollContent}>
            {targetTracks.map((track) => {
              const id = String(getEntityId(track));
              const selected = id === String(selectedTrackId);
              return (
                <Pressable
                  key={`copy_track_${id}`}
                  onPress={() => onSelectTrack(id)}
                  style={({ pressed }) => [
                    setupStyles.importOptionRow,
                    selected && setupStyles.importOptionRowSelected,
                    pressed && setupStyles.cardPressed,
                  ]}
                >
                  <View style={setupStyles.importOptionAccent} />
                  <View style={setupStyles.headerTextWrap}>
                    <Text style={setupStyles.importOptionTitle}>{getTrackDisplayName(track)}</Text>
                    <Text style={setupStyles.importOptionMeta}>{getTrackTypeDisplay(track)}</Text>
                  </View>
                  <Text style={setupStyles.importOptionCheck}>{selected ? 'Selected' : 'Choose'}</Text>
                </Pressable>
              );
            })}
            {!targetTracks.length ? (
              <Text style={setupStyles.emptyText}>Add another track before copying this setup.</Text>
            ) : null}
          </ScrollView>

          <View style={setupStyles.confirmActionStack}>
            <Pressable
              disabled={busy || !selectedTrack || !targetTracks.length}
              onPress={onConfirm}
              style={({ pressed }) => [setupStyles.confirmPrimaryButton, (busy || !selectedTrack || !targetTracks.length) && setupStyles.buttonDisabled, pressed && setupStyles.cardPressed]}
            >
              <Text style={setupStyles.confirmPrimaryText}>{busy ? 'Copying...' : 'Copy Setup'}</Text>
            </Pressable>
            <Pressable onPress={onCancel} style={({ pressed }) => [setupStyles.confirmSecondaryButton, pressed && setupStyles.cardPressed]}>
              <Text style={setupStyles.confirmSecondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function SetupsIndexScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const handledIncomingUrisRef = useRef(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [setups, setSetups] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [lastViewedSetup, setLastViewedSetupState] = useState(null);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [importVehicleId, setImportVehicleId] = useState('');
  const [importTrackId, setImportTrackId] = useState('');
  const [importStep, setImportStep] = useState('track');
  const [copySource, setCopySource] = useState(null);
  const [copyTargetTrackId, setCopyTargetTrackId] = useState('');

  const load = useCallback(async () => {
    try {
      const migration = await migrateSetupsFromLegacyStorage({ reason: 'setups-dashboard-load', markDirty: false });
      if (migration?.changed) {
        await markCloudDirty({
          reason: 'setups-dashboard-migration',
          keys: migration.changedKeys || ['@setups'],
          type: 'setup-migration',
          id: 'setups-2.0',
        });
      }
    } catch (error) {
      console.warn('Setups migration skipped', error?.message || String(error));
    }

    const [savedSetups, savedVehicles, savedTracks, lastViewed] = await Promise.all([
      getSetups(),
      getVehicles(),
      getTracks(),
      getLastViewedSetup(),
    ]);

    setSetups(savedSetups);
    setVehicles(savedVehicles);
    setTracks(savedTracks);
    setLastViewedSetupState(lastViewed);
    setLoading(false);

    return {
      setups: savedSetups,
      vehicles: savedVehicles,
      tracks: savedTracks,
      lastViewedSetup: lastViewed,
    };
  }, []);

  const openImportReview = useCallback(async (preparedImport, availableVehicles = vehicles, availableTracks = tracks) => {
    if (!preparedImport || preparedImport.canceled) return;

    if (!preparedImport.isSingleSetup || !preparedImport.setup) {
      Alert.alert(
        'Import Setup Backup?',
        `This file looks like a full setup backup with ${preparedImport.setupCount || 'multiple'} saved setup records. Import all records?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import All',
            onPress: async () => {
              setTransferBusy(true);
              try {
                const result = await importPreparedSetupBundle(preparedImport);
                await load();
                Alert.alert('Setups Imported', `Merged ${result.mergedSetupCount || 0} car/track setup${result.mergedSetupCount === 1 ? '' : 's'}.`);
              } catch (error) {
                console.warn('Bulk setup import failed', error);
                Alert.alert('Import Failed', error?.message || 'The selected file could not be imported.');
              } finally {
                setTransferBusy(false);
              }
            },
          },
        ]
      );
      return;
    }

    if (!availableVehicles.length || !availableTracks.length) {
      Alert.alert('Import Needs Car & Track', 'Add at least one car and one track before importing a setup.');
      return;
    }

    const defaultVehicle = findBestByIdOrName(
      availableVehicles,
      preparedImport.suggestedVehicleId || preparedImport.setup.vehicleId,
      preparedImport.suggestedVehicleName || preparedImport.setup.vehicleName,
      getVehicleDisplayName
    );

    const defaultTrack = findBestByIdOrName(
      availableTracks,
      preparedImport.suggestedTrackId || preparedImport.setup.trackId,
      preparedImport.suggestedTrackName || preparedImport.setup.trackName,
      getTrackDisplayName
    );

    setPendingImport(preparedImport);
    setImportVehicleId(defaultVehicle ? String(getEntityId(defaultVehicle)) : CREATE_NEW_VEHICLE_TARGET);
    setImportTrackId(defaultTrack ? String(getEntityId(defaultTrack)) : CREATE_NEW_TRACK_TARGET);
    setImportStep('track');
  }, [load, tracks, vehicles]);

  const handlePendingIncomingImport = useCallback(async (loadedData) => {
    const queued = await consumePendingIncomingImrcImport();
    if (!queued) return;

    const queuedKey = queued.uri || queued.preparedImport?.uri || queued.preparedImport?.fileName || queued.queuedAt || 'incoming-imrc';
    if (handledIncomingUrisRef.current.has(queuedKey)) return;
    handledIncomingUrisRef.current.add(queuedKey);

    try {
      if (queued.preparedImport) {
        await openImportReview(queued.preparedImport, loadedData?.vehicles || vehicles, loadedData?.tracks || tracks);
        return;
      }

      if (queued.unreadable) {
        // Old builds may have left an unreadable Android open-with attempt in
        // storage. Consume it silently so Setups does not keep showing the
        // import warning when the user is not importing.
        return;
      }

      if (!queued.uri) return;

      const prepared = await prepareSetupImportFromUri(queued.uri, 'opened-setup.imrc');
      await openImportReview(prepared, loadedData?.vehicles || vehicles, loadedData?.tracks || tracks);
    } catch (error) {
      console.warn('Incoming IMRC import failed', error);
      const message = String(error?.message || '');
      // When Android opens the app without passing a readable file URI, show this
      // only once because the queue is consumed before this error is displayed.
      if (!message.includes('Android did not pass a readable') && !message.includes('file provider blocks direct open-with access')) {
        Alert.alert('Import Failed', error?.message || 'The .imrc file could not be imported.');
      }
    }
  }, [openImportReview, tracks, vehicles]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const loadedData = await load();
        if (active) {
          await handlePendingIncomingImport(loadedData);
        }
      })();
      return () => {
        active = false;
      };
    }, [handlePendingIncomingImport, load])
  );


  useEffect(() => {
    if (!params?.imrcImport) return;
    let active = true;
    (async () => {
      const loadedData = await load();
      if (active) {
        await handlePendingIncomingImport(loadedData);
      }
    })();
    return () => {
      active = false;
    };
  }, [handlePendingIncomingImport, load, params?.imrcImport]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleImportSetups = useCallback(async () => {
    if (transferBusy) return;
    setTransferBusy(true);
    try {
      const prepared = await pickSetupImportForReview();
      if (!prepared?.canceled) {
        await openImportReview(prepared);
      }
    } catch (error) {
      console.warn('Setups import failed', error);
      Alert.alert('Import Failed', error?.message || 'The selected file could not be imported.');
    } finally {
      setTransferBusy(false);
    }
  }, [openImportReview, transferBusy]);

  const confirmImportSetup = useCallback(async () => {
    if (!pendingImport || transferBusy) return;

    setTransferBusy(true);
    try {
      const vehicle = importVehicleId === CREATE_NEW_VEHICLE_TARGET
        ? await ensureVehicleForImportedSetup(pendingImport.setup)
        : vehicles.find((item) => String(getEntityId(item)) === String(importVehicleId));

      const track = importTrackId === CREATE_NEW_TRACK_TARGET
        ? await ensureTrackForImportedSetup(pendingImport.setup)
        : tracks.find((item) => String(getEntityId(item)) === String(importTrackId));

      if (!vehicle || !track) {
        Alert.alert('Choose Car & Track', 'Select both a car and a track before importing this setup.');
        return;
      }

      const result = await importPreparedSetupToTarget(pendingImport, { vehicle, track });
      await load();
      setSelectedTrackId(String(getEntityId(track)));
      setPendingImport(null);
      setImportStep('track');
      Alert.alert('Setup Imported', `Imported ${result.fileName || '.imrc setup'} to ${getVehicleDisplayName(vehicle)} at ${getTrackDisplayName(track)}.`);
    } catch (error) {
      console.warn('Setup import failed', error);
      Alert.alert('Import Failed', error?.message || 'The setup could not be imported.');
    } finally {
      setTransferBusy(false);
    }
  }, [importTrackId, importVehicleId, load, pendingImport, tracks, transferBusy, vehicles]);

  const selectedTrack = useMemo(
    () => tracks.find((track) => getEntityId(track) === String(selectedTrackId)) || null,
    [selectedTrackId, tracks]
  );

  const lastOpened = useMemo(
    () => buildLastOpenedSetup({ lastViewedSetup, setups, tracks, vehicles }),
    [lastViewedSetup, setups, tracks, vehicles]
  );

  const tracksWithStats = useMemo(() => {
    return tracks.map((track) => {
      const trackId = getEntityId(track);
      const trackSetups = setups.filter((setup) => String(setup.trackId) === String(trackId));
      const vehicleIds = new Set(trackSetups.map((setup) => String(setup.vehicleId || '')));
      const latestSaved = trackSetups
        .map((setup) => setup.savedAt || setup.updatedAt)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

      return {
        track,
        trackId,
        setupCount: trackSetups.length,
        vehicleCount: vehicleIds.size,
        latestSaved,
      };
    });
  }, [setups, tracks]);

  const carRows = useMemo(() => {
    if (!selectedTrack) return [];
    const trackId = getEntityId(selectedTrack);
    const vehiclesById = new Map(vehicles.map((vehicle) => [String(getEntityId(vehicle)), vehicle]));
    const latestSetupByVehicle = new Map();

    setups.forEach((setup) => {
      if (String(setup.trackId) !== String(trackId) || !setup.vehicleId) return;

      const vehicleId = String(setup.vehicleId);
      const current = latestSetupByVehicle.get(vehicleId);
      if (!current || setupTimeValue(setup) > setupTimeValue(current)) {
        latestSetupByVehicle.set(vehicleId, setup);
      }
    });

    return Array.from(latestSetupByVehicle.entries())
      .map(([vehicleId, setup]) => ({
        vehicle: vehiclesById.get(vehicleId) || null,
        vehicleId,
        trackId,
        setup,
      }))
      .sort((a, b) => getVehicleDisplayName(a.vehicle || a.setup).localeCompare(getVehicleDisplayName(b.vehicle || b.setup)));
  }, [selectedTrack, setups, vehicles]);

  const openCopyPrompt = useCallback((row) => {
    const firstTargetTrack = tracks.find((track) => String(getEntityId(track)) !== String(row.trackId));
    setCopySource(row);
    setCopyTargetTrackId(firstTargetTrack ? String(getEntityId(firstTargetTrack)) : '');
  }, [tracks]);

  const confirmCopySetup = useCallback(async () => {
    if (!copySource || transferBusy) return;
    const targetTrack = tracks.find((track) => String(getEntityId(track)) === String(copyTargetTrackId));
    if (!targetTrack) {
      Alert.alert('Choose Track', 'Select the track you want to copy this setup to.');
      return;
    }

    setTransferBusy(true);
    try {
      await saveSetupCopyToTarget(copySource.setup, {
        vehicle: copySource.vehicle,
        vehicleId: copySource.vehicleId,
        track: targetTrack,
        trackId: copyTargetTrackId,
        source: 'track-copy',
      });
      await load();
      setSelectedTrackId(String(getEntityId(targetTrack)));
      setCopySource(null);
      Alert.alert('Setup Copied', `Copied ${getVehicleDisplayName(copySource.vehicle || copySource.setup)} to ${getTrackDisplayName(targetTrack)}.`);
    } catch (error) {
      console.warn('Setup copy failed', error);
      Alert.alert('Copy Failed', error?.message || 'The setup could not be copied.');
    } finally {
      setTransferBusy(false);
    }
  }, [copySource, copyTargetTrackId, load, tracks, transferBusy]);

  const canCreate = vehicles.length > 0 && tracks.length > 0;
  const savedLabel = `${setups.length} saved setup${setups.length === 1 ? '' : 's'}`;

  const handleSafeBack = useCallback(() => {
    if (typeof router.canGoBack === 'function' && router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={setupStyles.safe}>
      <View style={setupStyles.pageHeader}>
        <View style={setupStyles.headerRow}>
          <Pressable
            onPress={handleSafeBack}
            style={({ pressed }) => [
              setupStyles.button,
              setupStyles.buttonSecondary,
              setupStyles.topBackButton,
              pressed && setupStyles.cardPressed,
            ]}
          >
            <Text style={setupStyles.buttonSecondaryText}>‹ Back</Text>
          </Pressable>

          <View style={setupStyles.headerTextWrap}>
            <Text style={setupStyles.eyebrow}>IMRC SETUP MANAGER</Text>
            <Text style={setupStyles.title}>Setups</Text>
          </View>

          <View style={setupStyles.topButtonCluster}>
            <Pressable
              disabled={transferBusy}
              onPress={handleImportSetups}
              style={({ pressed }) => [
                setupStyles.button,
                setupStyles.buttonSecondary,
                setupStyles.topMiniActionButton,
                transferBusy && setupStyles.buttonDisabled,
                pressed && setupStyles.cardPressed,
              ]}
            >
              <Text style={setupStyles.buttonSecondaryText}>Import</Text>
            </Pressable>
            <Pressable
              disabled={!canCreate}
              onPress={() => router.push('/setups/select-vehicle')}
              style={({ pressed }) => [
                setupStyles.button,
                setupStyles.topActionButton,
                !canCreate && setupStyles.buttonDisabled,
                pressed && setupStyles.cardPressed,
              ]}
            >
              <Text style={setupStyles.buttonText}>+ Add</Text>
            </Pressable>
          </View>
        </View>

        <Text style={setupStyles.subtitle}>
          Pick a Track first, then pick the Car setup you want to create, edit, copy, or import for that track.
        </Text>

        <View style={setupStyles.countBadge}>
          <Text style={setupStyles.countBadgeText}>{savedLabel}</Text>
        </View>
      </View>

      <ScrollView
        style={setupStyles.scroll}
        contentContainerStyle={[setupStyles.scrollContent, { paddingBottom: Math.max(insets.bottom + 28, 52) }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={setupColors.purple} />}
      >
        {!canCreate ? (
          <View style={setupStyles.card}>
            <Text style={setupStyles.emptyText}>Add at least one vehicle and one track before creating or importing setup sheets.</Text>
          </View>
        ) : null}

        {lastOpened ? (
          <View style={[setupStyles.card, setupStyles.cardList]}>
            <View style={setupStyles.cardAccent} />
            <View style={setupStyles.headerRow}>
              <View style={setupStyles.headerTextWrap}>
                <Text style={setupStyles.eyebrow}>LAST OPENED SETUP</Text>
                <Text style={setupStyles.cardTitle}>{lastOpened.vehicleName}</Text>
                <Text style={setupStyles.cardSubtitle}>{lastOpened.trackName}</Text>
                <Text style={setupStyles.cardMeta}>Latest {formatDate(lastOpened.savedAt)}</Text>
              </View>
              <Pressable
                onPress={() => router.push(`/setups/editor/${lastOpened.trackId}/${lastOpened.vehicleId}`)}
                style={({ pressed }) => [setupStyles.button, setupStyles.topActionButton, pressed && setupStyles.cardPressed]}
              >
                <Text style={setupStyles.buttonText}>Open</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {!selectedTrack ? (
          <>
            <View style={setupStyles.listTitleRow}>
              <Text style={setupStyles.listTitle}>Tracks</Text>
              <Text style={setupStyles.listHint}>{loading ? 'Loading' : 'Pick track first'}</Text>
            </View>

            {!tracksWithStats.length ? (
              <View style={setupStyles.card}>
                <Text style={setupStyles.emptyText}>No tracks found yet. Add a track before creating setup sheets.</Text>
              </View>
            ) : (
              tracksWithStats.map(({ track, trackId, vehicleCount, setupCount, latestSaved }) => {
                const subtitleParts = [
                  vehicleCount ? plural(vehicleCount, 'car with setup', 'cars with setups') : 'No saved car setups yet',
                  setupCount ? `${plural(setupCount, 'version', 'versions')} saved` : null,
                  latestSaved ? `Latest ${formatDate(latestSaved)}` : null,
                ].filter(Boolean);

                return (
                  <SelectorCard
                    key={trackId}
                    title={getTrackDisplayName(track)}
                    subtitle={subtitleParts.join(' • ')}
                    meta={getTrackTypeDisplay(track)}
                    onPress={() => setSelectedTrackId(trackId)}
                  />
                );
              })
            )}
          </>
        ) : (
          <>
            <View style={setupStyles.listTitleRow}>
              <Text style={setupStyles.listTitle}>Cars</Text>
              <Text style={setupStyles.listHint}>{getTrackDisplayName(selectedTrack)}</Text>
            </View>

            <View style={[setupStyles.card, setupStyles.cardList]}>
              <View style={setupStyles.cardAccent} />
              <View style={setupStyles.headerRow}>
                <View style={setupStyles.headerTextWrap}>
                  <Text style={setupStyles.cardTitle}>{getTrackDisplayName(selectedTrack)}</Text>
                  <Text style={setupStyles.cardSubtitle}>Showing saved car setups for this track only.</Text>
                </View>
                <Pressable
                  onPress={() => setSelectedTrackId(null)}
                  style={({ pressed }) => [setupStyles.button, setupStyles.buttonSecondary, pressed && setupStyles.cardPressed]}
                >
                  <Text style={setupStyles.buttonSecondaryText}>Change</Text>
                </Pressable>
              </View>
            </View>

            {!carRows.length ? (
              <View style={setupStyles.card}>
                <Text style={setupStyles.emptyText}>No saved car setups for this track yet. Use + Add or Import to create the first one.</Text>
              </View>
            ) : (
              carRows.map((row) => {
                const { vehicle, vehicleId, trackId, setup } = row;
                const title = getVehicleDisplayName(vehicle || setup);
                const subtitle = `Latest saved ${formatDate(setup.savedAt || setup.updatedAt)}`;

                return (
                  <View key={`${trackId}_${vehicleId}`} style={[setupStyles.card, setupStyles.cardList, setupStyles.setupCarCard]}>
                    <View style={setupStyles.setupCarAccent} />
                    <View style={setupStyles.setupCarCompactRow}>
                      <Pressable
                        onPress={() => router.push(`/setups/editor/${trackId}/${vehicleId}`)}
                        style={({ pressed }) => [setupStyles.setupCarTextPress, pressed && setupStyles.cardPressed]}
                      >
                        <View style={setupStyles.setupCarHeaderLine}>
                          <Text style={setupStyles.setupCarKicker}>CAR SETUP</Text>
                          <Text style={setupStyles.setupCarDate}>{subtitle}</Text>
                        </View>
                        <Text style={setupStyles.cardTitle}>{title}</Text>
                      </Pressable>

                      <View style={setupStyles.setupCarInlineActions}>
                        <Pressable
                          onPress={() => openCopyPrompt(row)}
                          style={({ pressed }) => [setupStyles.button, setupStyles.buttonSecondary, setupStyles.setupCarMiniButton, pressed && setupStyles.cardPressed]}
                        >
                          <Text style={setupStyles.buttonSecondaryText}>Copy</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => router.push(`/setups/editor/${trackId}/${vehicleId}`)}
                          style={({ pressed }) => [setupStyles.button, setupStyles.topActionButton, setupStyles.setupCarMiniButton, pressed && setupStyles.cardPressed]}
                        >
                          <Text style={setupStyles.buttonText}>Edit</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <ImportTargetPopup
        visible={Boolean(pendingImport)}
        pendingImport={pendingImport}
        vehicles={vehicles}
        tracks={tracks}
        selectedVehicleId={importVehicleId}
        selectedTrackId={importTrackId}
        importStep={importStep}
        busy={transferBusy}
        onSelectVehicle={(id) => {
          setImportVehicleId(id);
        }}
        onSelectTrack={(id) => {
          setImportTrackId(id);
        }}
        onSetImportStep={setImportStep}
        onCancel={() => {
          if (transferBusy) return;
          setPendingImport(null);
          setImportStep('track');
        }}
        onConfirm={confirmImportSetup}
      />

      <CopySetupPopup
        visible={Boolean(copySource)}
        copySource={copySource}
        tracks={tracks}
        selectedTrackId={copyTargetTrackId}
        busy={transferBusy}
        onSelectTrack={setCopyTargetTrackId}
        onCancel={() => {
          if (transferBusy) return;
          setCopySource(null);
        }}
        onConfirm={confirmCopySetup}
      />
    </SafeAreaView>
  );
}
