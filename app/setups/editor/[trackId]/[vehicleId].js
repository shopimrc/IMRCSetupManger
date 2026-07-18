import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SetupField from '../../../../features/setups/components/SetupField';
import SetupSection from '../../../../features/setups/components/SetupSection';
import { applySetupCalculations, getByPath, setByPath } from '../../../../features/setups/lib/setupCalc';
import {
  makeGearMatrix,
  mmToUnit,
  toNumber as toRolloutNumber,
  valueToMm,
} from '../../../../features/tools/lib/rolloutMath';
import { CORNERS, FRONT_CORNERS, SETUP_ROUNDS, getSetupChassisProfile } from '../../../../features/setups/lib/setupModel';
import {
  deleteSetupVersion,
  getSetupHistory,
  loadSetupForEditor,
  saveDraftSetup,
  saveSetupVersion,
  setLastViewedSetup,
} from '../../../../features/setups/lib/setupStorage';
import { setupStyles } from '../../../../features/setups/styles/setupStyles';
import { shareSetupPdf, shareSetupVersionImrc } from '../../../../features/setups/lib/setupFileTransfer';
import { upsertVehicle } from '../../../../features/vehicles/logic/vehicleStorage';

const PANEL_META = {
  gearing: { title: 'Gearing / Transmission', eyebrow: 'DRIVE RATIO' },
  LF: { title: 'LF Corner', eyebrow: 'LEFT FRONT' },
  RF: { title: 'RF Corner', eyebrow: 'RIGHT FRONT' },
  LR: { title: 'LR Corner', eyebrow: 'LEFT REAR' },
  RR: { title: 'RR Corner', eyebrow: 'RIGHT REAR' },
  center: { title: 'Center / Chassis', eyebrow: 'CENTER SECTION' },
  electronics: { title: 'Power / Electronics', eyebrow: 'POWER' },
  front: { title: 'Front', eyebrow: 'FRONT SECTION' },
  rear: { title: 'Rear', eyebrow: 'REAR SECTION' },
  rearPod: { title: 'Center / Rear Pod', eyebrow: 'CENTER / REAR POD' },
  weights: { title: 'Corner Weights', eyebrow: 'RF + LR CROSS' },
  results: { title: 'Results', eyebrow: 'RUN DATA' },
  notes: { title: 'Setup Notes', eyebrow: 'ALL NOTES' },
  history: { title: 'History', eyebrow: 'SAVED VERSIONS' },
};


function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getEditorLayoutMetrics({ height, width, topInset = 0, bottomInset = 0, readOnly = false }) {
  const screenHeight = Number(height || 0) || 800;
  const screenWidth = Number(width || 0) || 390;
  const safeHeight = Math.max(500, screenHeight - Number(topInset || 0) - Number(bottomInset || 0));
  const narrow = screenWidth < 390;

  // The edit screen does not scroll, so the chassis map must fit in the real
  // space left after the header, Run Line/Rollout row, and bottom actions.
  // This is intentionally more aggressive than a simple full-screen scale so
  // LR/RR never sit underneath the Results/Notes/History bar on taller Android
  // phones with large status/nav bars.
  const reservedForFixedAreas = (readOnly ? 350 : 320);
  const availableMapHeight = Math.max(340, safeHeight - reservedForFixedAreas);
  const mapScale = clampNumber(availableMapHeight / 700, 0.58, 0.92);
  const headerScale = clampNumber(safeHeight / 850, 0.76, 1);
  const widthScale = clampNumber(screenWidth / 410, 0.80, 1);

  const v = (value, minValue = 0) => Math.max(minValue, Math.round(value * mapScale));
  const hv = (value, minValue = 0) => Math.max(minValue, Math.round(value * headerScale));
  const w = (value, minValue = 0) => Math.max(minValue, Math.round(value * widthScale));
  const font = (value, minValue = 8) => Math.max(minValue, Math.round(value * clampNumber(mapScale + 0.12, 0.76, 1)));
  const headerFont = (value, minValue = 8) => Math.max(minValue, Math.round(value * clampNumber(headerScale, 0.78, 1)));

  const frameHeight = Math.max(310, availableMapHeight - 30);
  const rowGap = clampNumber(Math.round(frameHeight * 0.026), 8, 14);
  const rowGapSmall = clampNumber(Math.round(rowGap * 0.75), 6, 11);

  const sideButtonWidth = w(narrow ? 88 : 100, 76);
  const cornerWidth = w(narrow ? 108 : 124, 92);
  const centerButtonWidth = w(narrow ? 118 : 138, 100);
  const gearButtonWidth = w(narrow ? 126 : 146, 106);
  const crossWeightWidth = w(narrow ? 120 : 136, 98);

  const sideHeight = clampNumber(Math.round(frameHeight * 0.15), 56, 86);
  const gearHeight = clampNumber(Math.round(frameHeight * 0.13), 50, 74);
  const frontRearHeight = clampNumber(Math.round(frameHeight * 0.12), 46, 66);
  const availableForCorners = frameHeight - sideHeight - gearHeight - (rowGap * 3) - 4;
  const cornerHeight = clampNumber(Math.floor(availableForCorners / 2), 112, narrow ? 152 : 166);
  const actualRowsHeight = (cornerHeight * 2) + sideHeight + gearHeight + (rowGap * 3);
  const framePadVertical = Math.max(0, Math.floor((frameHeight - actualRowsHeight) / 2));
  return {
    scale: mapScale,
    editorHeader: {
      paddingTop: hv(7, 3),
      paddingBottom: hv(5, 2),
    },
    editorNoScrollContent: {
      paddingTop: v(3, 0),
      paddingHorizontal: narrow ? 8 : 12,
      paddingBottom: 0,
    },
    editorTitle: {
      fontSize: headerFont(narrow ? 21 : 24, 18),
      lineHeight: headerFont(narrow ? 24 : 27, 21),
    },
    editorSubtitle: {
      fontSize: headerFont(10, 9),
      lineHeight: headerFont(13, 11),
    },
    quickPanel: {
      marginTop: v(3, 0),
      marginBottom: 0,
    },
    referenceTileWide: {
      minHeight: v(50, 38),
      maxHeight: v(56, 42),
      paddingVertical: v(7, 4),
    },
    rolloutTile: {
      width: w(narrow ? 92 : 106, 84),
      minHeight: v(50, 38),
      maxHeight: v(56, 42),
      paddingVertical: v(7, 4),
    },
    rolloutValue: {
      fontSize: font(19, 14),
      lineHeight: font(23, 17),
    },
    chassisShell: {
      marginTop: v(6, 1),
      minHeight: availableMapHeight,
      maxHeight: availableMapHeight,
    },
    chassisFrame: {
      height: frameHeight,
      minHeight: frameHeight,
      maxHeight: frameHeight,
      paddingTop: framePadVertical,
      paddingBottom: framePadVertical,
      justifyContent: 'flex-start',
      gap: rowGap,
    },
    axleRow: {
      gap: w(narrow ? 10 : 14, 8),
      minHeight: cornerHeight,
      maxHeight: cornerHeight,
    },
    middleRow: {
      flex: 0,
      height: sideHeight,
      minHeight: sideHeight,
      maxHeight: sideHeight,
      paddingVertical: 0,
      gap: w(narrow ? 8 : 12, 6),
    },
    cornerHotspot: {
      width: cornerWidth,
      minHeight: cornerHeight,
      maxHeight: cornerHeight,
      paddingVertical: v(9, 5),
      paddingLeft: w(12, 8),
      paddingRight: w(8, 6),
    },
    tireShape: {
      width: w(62, 48),
      height: v(31, 23),
      marginBottom: v(11, 5),
    },
    sideButton: {
      width: sideButtonWidth,
      minHeight: sideHeight,
      maxHeight: sideHeight,
      paddingVertical: v(7, 4),
      paddingLeft: w(13, 9),
    },
    sideSpacer: {
      width: sideButtonWidth,
      minHeight: sideHeight,
      maxHeight: sideHeight,
    },
    crossWeightCenter: {
      width: crossWeightWidth,
      minHeight: clampNumber(sideHeight - 8, 46, 70),
      maxHeight: clampNumber(sideHeight - 2, 50, 76),
      paddingVertical: v(7, 4),
      paddingLeft: w(13, 9),
      paddingRight: w(11, 8),
    },
    crossWeightValue: {
      fontSize: font(17, 13),
      lineHeight: font(20, 16),
    },
    frontRearBulkhead: {
      minHeight: frontRearHeight,
      maxHeight: frontRearHeight,
      paddingVertical: v(7, 4),
    },
    rearAreaWrap: {
      gap: rowGap,
      marginTop: 0,
      marginBottom: 0,
    },
    rearGearStack: {
      gap: rowGapSmall,
      marginTop: 0,
      marginBottom: 0,
    },
    gearBulkhead: {
      width: gearButtonWidth,
      minHeight: gearHeight,
      maxHeight: gearHeight,
      paddingVertical: v(8, 4),
      paddingLeft: w(16, 11),
      paddingRight: w(11, 8),
    },
    rearPodBetweenWheels: {
      minHeight: frontRearHeight,
      maxHeight: frontRearHeight,
      maxWidth: centerButtonWidth,
    },
    chassisPartLabel: {
      fontSize: font(12, 10),
      lineHeight: font(15, 12),
    },
    chassisPartValue: {
      fontSize: font(10, 8),
      marginTop: v(3, 1),
    },
    chassisPartSubValue: {
      fontSize: font(9, 8),
      marginTop: v(1, 0),
    },
    cornerTitle: {
      fontSize: font(15, 12),
      lineHeight: font(18, 14),
    },
    cornerLine: {
      fontSize: font(13, 10),
      marginTop: v(1, 0),
    },
    cornerSub: {
      fontSize: font(11, 9),
      marginTop: v(2, 0),
    },
    bottomBar: {
      paddingTop: v(5, 2),
      paddingBottom: Math.max(12, Number(bottomInset || 0) + (mapScale < 0.78 ? 6 : 10)),
    },
    mapActionButton: {
      minHeight: v(56, 42),
      paddingVertical: v(7, 4),
    },
    mapActionValue: {
      fontSize: font(15, 12),
      marginTop: v(2, 1),
    },
  };
}

function getPanelMeta(panel, chassisProfile) {
  if (panel === 'center') {
    return {
      title: chassisProfile?.centerPanelTitle || PANEL_META.center.title,
      eyebrow: chassisProfile?.driveType === '4wd' ? 'CENTER DIFF' : 'DRIVETRAIN',
    };
  }

  if (panel === 'rear' && chassisProfile?.hasRearDiff) {
    return {
      title: 'Rear',
      eyebrow: 'REAR SECTION',
    };
  }

  return PANEL_META[panel] || { title: 'Setup', eyebrow: 'ADJUST' };
}


function normalizeSetupForDirtyCompare(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeSetupForDirtyCompare);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .filter((key) => !['updatedAt', 'savedAt', 'readOnly'].includes(key))
      .sort()
      .reduce((next, key) => {
        next[key] = normalizeSetupForDirtyCompare(value[key]);
        return next;
      }, {});
  }

  return value ?? '';
}

function setupsAreSame(beforeSetup, afterSetup) {
  try {
    return JSON.stringify(normalizeSetupForDirtyCompare(beforeSetup || {})) === JSON.stringify(normalizeSetupForDirtyCompare(afterSetup || {}));
  } catch {
    return false;
  }
}

function cloneSetupSnapshot(value) {
  try {
    return value ? JSON.parse(JSON.stringify(value)) : null;
  } catch {
    return value || null;
  }
}

export default function SetupEditorScreen() {
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  const router = useRouter();
  const handleSafeBack = useCallback(() => {
    if (typeof router.canGoBack === 'function' && router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/setups');
  }, [router]);
  const params = useLocalSearchParams();
  const trackId = String(params.trackId || '');
  const vehicleId = String(params.vehicleId || '');
  const setupId = params.setupId ? String(params.setupId) : null;
  const readOnly = String(params.readonly || '') === '1' || String(params.readOnly || '') === '1';
  const layoutMetrics = useMemo(
    () => getEditorLayoutMetrics({
      height: dimensions.height,
      width: dimensions.width,
      topInset: insets.top,
      bottomInset: insets.bottom,
      readOnly,
    }),
    [dimensions.height, dimensions.width, insets.top, insets.bottom, readOnly]
  );

  const [setup, setSetup] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [activePanel, setActivePanel] = useState(null);
  const [leavePromptVisible, setLeavePromptVisible] = useState(false);
  const [exportPromptVisible, setExportPromptVisible] = useState(false);

  const scrollRef = useRef(null);
  const vehicleRef = useRef(null);
  const fieldPositions = useRef({});
  const originalSetupRef = useRef(null);
  const pendingLeaveActionRef = useRef(null);

  const editable = Boolean(setup && !setup.readOnly && !readOnly);
  const hasUnsavedChanges = useMemo(
    () => Boolean(editable && initialized && setup && !setupsAreSame(originalSetupRef.current, setup)),
    [editable, initialized, setup]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const loaded = await loadSetupForEditor({ vehicleId, trackId, setupId, readOnly });
    const vehicleTx = String(
      loaded.vehicle?.transponder ||
        loaded.vehicle?.tx ||
        loaded.vehicle?.transponderNumber ||
        loaded.setup?.vehicleTransponder ||
        loaded.setup?.transponder ||
        ''
    ).trim();
    const hydratedSetup = vehicleTx
      ? { ...loaded.setup, vehicleTransponder: vehicleTx, transponder: vehicleTx }
      : loaded.setup;
    vehicleRef.current = loaded.vehicle || null;
    setVehicle(loaded.vehicle || null);
    originalSetupRef.current = cloneSetupSnapshot(hydratedSetup);
    setSetup(hydratedSetup);
    setHistory(loaded.history);
    setLoading(false);
    setTimeout(() => setInitialized(true), 150);

    await setLastViewedSetup({
      setupId: loaded.setup.id,
      vehicleId,
      trackId,
      vehicleName: loaded.setup.vehicleName,
      trackName: loaded.setup.trackName,
      savedAt: loaded.setup.savedAt || loaded.setup.updatedAt,
    });
  }, [vehicleId, trackId, setupId, readOnly]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!initialized || !setup || !editable) return undefined;

    const timer = setTimeout(() => {
      saveDraftSetup(vehicleId, trackId, setup).catch((error) => console.warn('Setup draft save failed', error));
    }, 650);

    return () => clearTimeout(timer);
  }, [initialized, setup, editable, vehicleId, trackId]);

  const updateField = useCallback((path, value) => {
    if (!editable) return;
    setSetup((prev) => {
      const changed = setByPath(prev, path, value);
      return applySetupCalculations({ ...changed, updatedAt: new Date().toISOString() });
    });
  }, [editable]);

  const updateVehicleTransponder = useCallback((value) => {
    if (!editable) return;
    const txValue = String(value || '').trim();
    const now = new Date().toISOString();

    setSetup((prev) => {
      if (!prev) return prev;
      return applySetupCalculations({
        ...prev,
        vehicleTransponder: txValue,
        transponder: txValue,
        updatedAt: now,
      });
    });

    const baseVehicle = vehicleRef.current;
    if (!baseVehicle) return;

    const nextVehicle = {
      ...baseVehicle,
      id: baseVehicle.id || vehicleId,
      transponder: txValue,
      updatedAt: now,
    };
    vehicleRef.current = nextVehicle;
    setVehicle(nextVehicle);
    upsertVehicle(nextVehicle).catch((error) => console.warn('Vehicle TX update from setup failed', error));
  }, [editable, vehicleId]);

  const onFieldLayout = useCallback((key, y) => {
    fieldPositions.current[key] = y;
  }, []);

  const onFieldFocus = useCallback((key) => {
    const y = fieldPositions.current[key] || 0;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 70), animated: true });
    }, 120);
  }, []);

  const fieldProps = useCallback(
    (path, extra = {}) => ({
      value: getByPath(setup, path),
      onChangeText: (value) => updateField(path, value),
      editable,
      fieldKey: path,
      onFieldLayout,
      onFieldFocus,
      ...extra,
    }),
    [setup, updateField, editable, onFieldLayout, onFieldFocus]
  );

  const modalFieldProps = useCallback(
    (path, extra = {}) => ({
      value: getByPath(setup, path),
      onChangeText: (value) => updateField(path, value),
      editable,
      fieldKey: path,
      onFieldLayout,
      onFieldFocus,
      ...extra,
    }),
    [setup, updateField, editable, onFieldLayout, onFieldFocus]
  );

  const vehicleTransponderProps = useMemo(() => ({
    value: vehicle?.transponder || setup?.vehicleTransponder || setup?.transponder || '',
    onChangeText: updateVehicleTransponder,
    editable,
    fieldKey: 'vehicle.transponder',
    onFieldLayout,
    onFieldFocus,
    keyboardType: Platform.OS === 'ios' ? 'number-pad' : 'numeric',
    placeholder: 'Example: 3358118',
  }), [vehicle?.transponder, setup?.vehicleTransponder, setup?.transponder, updateVehicleTransponder, editable, onFieldLayout, onFieldFocus]);

  const saveNow = useCallback(async ({ silent = false } = {}) => {
    if (!setup || !editable || saving) return null;
    setSaving(true);
    try {
      const saved = await saveSetupVersion(setup, {
        beforeSetup: originalSetupRef.current,
      });
      const nextHistory = await getSetupHistory(vehicleId, trackId);
      originalSetupRef.current = cloneSetupSnapshot(saved);
      setSetup(saved);
      setHistory(nextHistory);
      if (!silent) {
        Alert.alert('Setup Saved', 'A new saved setup version was added to History.');
      }
      return saved;
    } catch (error) {
      console.warn('Setup save failed', error);
      Alert.alert('Save Failed', 'The setup could not be saved. Please try again.');
      return null;
    } finally {
      setSaving(false);
    }
  }, [setup, editable, saving, vehicleId, trackId]);

  const runPendingLeaveAction = useCallback(() => {
    const action = pendingLeaveActionRef.current;
    pendingLeaveActionRef.current = null;
    setLeavePromptVisible(false);

    if (typeof action === 'function') {
      action();
    } else {
      handleSafeBack();
    }
  }, [handleSafeBack]);

  const closeLeavePrompt = useCallback(() => {
    pendingLeaveActionRef.current = null;
    setLeavePromptVisible(false);
  }, []);

  const requestLeaveEditor = useCallback((afterLeave) => {
    const leave = () => {
      if (typeof afterLeave === 'function') {
        afterLeave();
      } else {
        handleSafeBack();
      }
    };

    if (saving) return;

    if (!hasUnsavedChanges) {
      leave();
      return;
    }

    pendingLeaveActionRef.current = leave;
    setLeavePromptVisible(true);
  }, [handleSafeBack, hasUnsavedChanges, saving]);

  const saveAndLeaveEditor = useCallback(async () => {
    const saved = await saveNow({ silent: true });
    if (saved) {
      runPendingLeaveAction();
    }
  }, [runPendingLeaveAction, saveNow]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (exportPromptVisible) {
        setExportPromptVisible(false);
        return true;
      }

      if (leavePromptVisible) {
        closeLeavePrompt();
        return true;
      }

      if (activePanel) {
        setActivePanel(null);
        return true;
      }

      requestLeaveEditor();
      return true;
    });

    return () => subscription.remove();
  }, [activePanel, closeLeavePrompt, exportPromptVisible, leavePromptVisible, requestLeaveEditor]);


  const closeExportPrompt = useCallback(() => setExportPromptVisible(false), []);

  const exportCurrentPdf = useCallback(async () => {
    if (!setup) return;
    closeExportPrompt();
    try {
      await shareSetupPdf(setup);
    } catch (error) {
      console.warn('Setup PDF export failed', error);
      Alert.alert('PDF Export Failed', error?.message || 'The printable PDF could not be created.');
    }
  }, [closeExportPrompt, setup]);

  const exportCurrentImrc = useCallback(async () => {
    if (!setup) return;
    closeExportPrompt();
    try {
      await shareSetupVersionImrc(setup);
    } catch (error) {
      console.warn('Setup .imrc export failed', error);
      Alert.alert('IMRC Export Failed', error?.message || 'The .imrc setup file could not be created.');
    }
  }, [closeExportPrompt, setup]);

  const deleteVersion = useCallback((versionId) => {
    Alert.alert('Delete Setup Version?', 'This deletes only this saved version for this Vehicle + Track.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const nextHistory = await deleteSetupVersion(vehicleId, trackId, versionId);
          setHistory(nextHistory);
        },
      },
    ]);
  }, [vehicleId, trackId]);

  const title = setup ? `${setup.vehicleName}` : 'Setup Editor';
  const subtitle = setup ? `${setup.trackName}` : 'Loading setup';
  const chassisProfile = useMemo(() => getSetupChassisProfile(setup || {}), [setup]);
  const panelMeta = activePanel ? getPanelMeta(activePanel, chassisProfile) : null;

  const modalContent = useMemo(() => {
    if (!setup || !activePanel) return null;

    if (CORNERS.includes(activePanel)) {
      return <CornerPanel corner={activePanel} fieldProps={modalFieldProps} profile={chassisProfile} />;
    }

    switch (activePanel) {
      case 'gearing':
        return <GearingPanel setup={setup} fieldProps={modalFieldProps} />;
      case 'center':
        return <CenterPanel fieldProps={modalFieldProps} profile={chassisProfile} />;
      case 'electronics':
        return <PowerElectronicsPanel fieldProps={modalFieldProps} vehicleTransponderProps={vehicleTransponderProps} />;
      case 'front':
      case 'frontToe':
        return <FrontPanel setup={setup} fieldProps={modalFieldProps} profile={chassisProfile} />;
      case 'rear':
      case 'rearToe':
        return <RearPanel setup={setup} fieldProps={modalFieldProps} profile={chassisProfile} />;
      case 'rearPod':
        return <RearPodPanel fieldProps={modalFieldProps} />;
      case 'weights':
        return <CornerWeightsPanel setup={setup} fieldProps={modalFieldProps} updateField={updateField} editable={editable} />;
      case 'results':
        return <ResultsPanel setup={setup} fieldProps={modalFieldProps} updateField={updateField} editable={editable} />;
      case 'notes':
        return <NotesPanel fieldProps={modalFieldProps} />;
      case 'history':
        return <HistoryPanel history={history} trackId={trackId} vehicleId={vehicleId} onDelete={deleteVersion} onOpenVersion={(versionId) => requestLeaveEditor(() => router.push(`/setups/editor/${trackId}/${vehicleId}?setupId=${versionId}&readonly=1`))} />;
      default:
        return null;
    }
  }, [setup, activePanel, modalFieldProps, vehicleTransponderProps, updateField, editable, history, trackId, vehicleId, deleteVersion, chassisProfile, requestLeaveEditor, router]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={setupStyles.safe}>
      <KeyboardAvoidingView
        style={setupStyles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <View style={setupStyles.editorMainArea}>
          <View style={[setupStyles.editorPageHeader, layoutMetrics.editorHeader]}>
            <View style={setupStyles.headerRow}>
              <Pressable
                onPress={() => requestLeaveEditor()}
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
                <Text numberOfLines={1} style={[setupStyles.editorScreenTitle, layoutMetrics.editorTitle]}>{title}</Text>
                <Text numberOfLines={1} style={[setupStyles.editorScreenSubtitle, layoutMetrics.editorSubtitle]}>{subtitle}</Text>
              </View>

              <View style={setupStyles.headerActionRow}>
                <Pressable
                  disabled={!setup}
                  onPress={() => setExportPromptVisible(true)}
                  style={({ pressed }) => [
                    setupStyles.button,
                    setupStyles.buttonSecondary,
                    setupStyles.topActionButton,
                    !setup && setupStyles.buttonDisabled,
                    pressed && setupStyles.cardPressed,
                  ]}
                >
                  <Text style={setupStyles.buttonSecondaryText}>Export</Text>
                </Pressable>

                <Pressable
                  disabled={!editable || saving}
                  onPress={saveNow}
                  style={({ pressed }) => [
                    setupStyles.button,
                    setupStyles.topActionButton,
                    (!editable || saving) && setupStyles.buttonDisabled,
                    pressed && setupStyles.cardPressed,
                  ]}
                >
                  <Text style={setupStyles.buttonText}>{saving ? 'Saving' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {readOnly ? (
            <View style={setupStyles.readOnlyBanner}>
              <Text style={setupStyles.readOnlyBannerText}>Read-only saved version. Use Back to return to the editable setup.</Text>
            </View>
          ) : null}

          <View style={[setupStyles.editorNoScrollContent, layoutMetrics.editorNoScrollContent]}>
            {loading || !setup ? (
              <View style={setupStyles.card}>
                <Text style={setupStyles.emptyText}>Loading setup...</Text>
              </View>
            ) : (
              <>
                <QuickUsePanel setup={setup} layoutMetrics={layoutMetrics} />
                <ChassisMap setup={setup} onOpenPanel={setActivePanel} profile={chassisProfile} layoutMetrics={layoutMetrics} />
              </>
            )}
          </View>
        </View>

        {setup && !loading ? (
          <FixedBottomActions setup={setup} historyCount={history.length} onOpenPanel={setActivePanel} bottomInset={insets.bottom} layoutMetrics={layoutMetrics} />
        ) : null}

        <SetupPanelModal
          visible={Boolean(activePanel)}
          title={panelMeta?.title || 'Setup'}
          eyebrow={panelMeta?.eyebrow || 'ADJUST'}
          onClose={() => setActivePanel(null)}
          scrollRef={scrollRef}
        >
          {modalContent}
        </SetupPanelModal>

        <UnsavedChangesModal
          visible={leavePromptVisible}
          saving={saving}
          onCancel={closeLeavePrompt}
          onLeave={runPendingLeaveAction}
          onSaveLeave={saveAndLeaveEditor}
        />

        <ExportSetupModal
          visible={exportPromptVisible}
          onCancel={closeExportPrompt}
          onExportImrc={exportCurrentImrc}
          onExportPdf={exportCurrentPdf}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function QuickUsePanel({ setup, layoutMetrics }) {
  const runLine = setup.runLine || '--';
  const rollout = setup.gearing?.rollout || '--';

  return (
    <View style={[setupStyles.quickPanel, layoutMetrics?.quickPanel]}>
      <View style={setupStyles.quickGrid}>
        <View style={[setupStyles.referenceTileWide, layoutMetrics?.referenceTileWide]}>
          <View style={setupStyles.chassisItemAccent} />
          <Text style={setupStyles.rolloutTileLabel}>Run Line</Text>
          <Text numberOfLines={2} style={setupStyles.referenceTileValue}>{runLine}</Text>
        </View>
        <View style={[setupStyles.rolloutTile, layoutMetrics?.rolloutTile]}>
          <View style={setupStyles.chassisItemAccent} />
          <Text style={setupStyles.rolloutTileLabel}>Rollout</Text>
          <Text style={[setupStyles.rolloutTileValue, layoutMetrics?.rolloutValue]}>{rollout}</Text>
        </View>
      </View>
    </View>
  );
}

function ChassisMap({ setup, onOpenPanel, profile, layoutMetrics }) {
  const chassisProfile = profile || getSetupChassisProfile(setup || {});
  const isPanCarLayout = chassisProfile.layoutFamily === 'panCar' || chassisProfile.hasRearToe === false;
  const centerPanelKey = isPanCarLayout ? 'rearPod' : 'center';
  const showCenterDiffSideButton = !isPanCarLayout && chassisProfile.hasCenterDiff === true;
  const centerButtonLabel = isPanCarLayout ? 'CENTER / REAR POD' : (chassisProfile.centerButtonLabel || 'CENTER DIFF');
  const centerButtonSub = isPanCarLayout ? 'Rear steer • Center shock' : (chassisProfile.centerButtonSub || 'Center oil • Slipper');
  const rearPanelKey = 'rear';
  const rearDiffSetting = setup.drivetrain?.rearDiffSetting || setup.drivetrain?.rearDiffFluid || '--';
  const frontDiffText = chassisProfile.hasFrontDiff
    ? `Front diff ${setup.drivetrain?.frontDiffSetting || setup.drivetrain?.frontDiffFluid || '--'}`
    : `Ackerman ${setup.geometry?.ackermanAngle || '--'}`;
  const rearButtonLabel = chassisProfile.driveType === '2wd' ? 'REAR' : (chassisProfile.rearButtonLabel || 'REAR');
  const rearValue = chassisProfile.hasRearToe === false
    ? `Rear steer ${setup.geometry?.rearSteer || '--'}`
    : `Toe ${setup.geometry?.rearToe || '--'}`;
  const rearSubValue = chassisProfile.hasRearDiff
    ? `Diff ${rearDiffSetting}`
    : (chassisProfile.hasRearToe === false ? 'No rear toe' : 'Rear section');

  return (
    <View style={[setupStyles.chassisShell, layoutMetrics?.chassisShell]}>
      <View style={setupStyles.listTitleRow}>
        <Text style={setupStyles.listTitle}>Setup Areas</Text>
        <Text numberOfLines={1} style={setupStyles.listHint}>{chassisProfile.label}</Text>
      </View>

      <View style={[setupStyles.chassisFrame, layoutMetrics?.chassisFrame]}>
        <View style={[setupStyles.chassisAxleRow, layoutMetrics?.axleRow]}>
          <CornerHotspot corner="LF" setup={setup} profile={chassisProfile} onPress={() => onOpenPanel('LF')} layoutMetrics={layoutMetrics} />
          <Pressable onPress={() => onOpenPanel('front')} style={({ pressed }) => [setupStyles.frontBulkhead, layoutMetrics?.frontRearBulkhead, pressed && setupStyles.cardPressed]}>
            <View style={setupStyles.chassisItemAccent} />
            <Text style={[setupStyles.chassisPartLabel, layoutMetrics?.chassisPartLabel]}>{chassisProfile.frontButtonLabel || 'FRONT'}</Text>
            <Text style={[setupStyles.chassisPartValue, layoutMetrics?.chassisPartValue]}>Toe {setup.geometry?.frontToe || '--'}</Text>
            <Text style={[setupStyles.chassisPartSubValue, layoutMetrics?.chassisPartSubValue]}>{frontDiffText}</Text>
          </Pressable>
          <CornerHotspot corner="RF" setup={setup} profile={chassisProfile} onPress={() => onOpenPanel('RF')} layoutMetrics={layoutMetrics} />
        </View>

        <View style={[setupStyles.chassisMiddleRow, layoutMetrics?.middleRow]}>
          <Pressable
            onPress={() => onOpenPanel('electronics')}
            style={({ pressed }) => [setupStyles.electronicsSideButton, layoutMetrics?.sideButton, pressed && setupStyles.cardPressed]}
          >
            <View style={setupStyles.chassisItemAccent} />
            <Text style={[setupStyles.chassisPartLabel, layoutMetrics?.chassisPartLabel]}>POWER / ELEC</Text>
            <Text style={[setupStyles.chassisPartValue, layoutMetrics?.chassisPartValue]}>Battery • ESC • Servo</Text>
          </Pressable>
          <CrossWeightCenter setup={setup} onPress={() => onOpenPanel('weights')} layoutMetrics={layoutMetrics} />
          {showCenterDiffSideButton ? (
            <Pressable
              onPress={() => onOpenPanel(centerPanelKey)}
              style={({ pressed }) => [setupStyles.centerDiffSideButton, layoutMetrics?.sideButton, pressed && setupStyles.cardPressed]}
            >
              <View style={setupStyles.chassisItemAccent} />
              <Text style={[setupStyles.chassisPartLabel, layoutMetrics?.chassisPartLabel]}>{centerButtonLabel}</Text>
              <Text style={[setupStyles.chassisPartValue, layoutMetrics?.chassisPartValue]}>{centerButtonSub}</Text>
            </Pressable>
          ) : (
            <View style={[setupStyles.electronicsSideSpacer, layoutMetrics?.sideSpacer]} />
          )}
        </View>

        <View style={[setupStyles.rearAreaWrap, layoutMetrics?.rearAreaWrap]}>
          <View style={[setupStyles.rearGearStack, layoutMetrics?.rearGearStack]}>
            <Pressable onPress={() => onOpenPanel('gearing')} style={({ pressed }) => [setupStyles.gearBulkhead, layoutMetrics?.gearBulkhead, pressed && setupStyles.cardPressed]}>
              <View style={setupStyles.chassisItemAccent} />
              <Text style={[setupStyles.chassisPartLabel, layoutMetrics?.chassisPartLabel]}>GEARING / TRANS</Text>
              <Text style={[setupStyles.chassisPartValue, layoutMetrics?.chassisPartValue]}>Spur {setup.gearing?.spur || '--'}  Pinion {setup.gearing?.pinion || '--'}</Text>
              <Text style={[setupStyles.chassisPartSubValue, layoutMetrics?.chassisPartSubValue]}>Trans {setup.gearing?.transmissionRatio || '--'}</Text>
            </Pressable>
          </View>

          <View style={[setupStyles.chassisAxleRow, setupStyles.rearAxleRow, layoutMetrics?.axleRow]}>
            <CornerHotspot corner="LR" setup={setup} profile={chassisProfile} onPress={() => onOpenPanel('LR')} layoutMetrics={layoutMetrics} />
            {isPanCarLayout ? (
              <Pressable onPress={() => onOpenPanel('rearPod')} style={({ pressed }) => [setupStyles.rearBulkhead, setupStyles.rearPodBetweenWheels, layoutMetrics?.frontRearBulkhead, layoutMetrics?.rearPodBetweenWheels, pressed && setupStyles.cardPressed]}>
                <View style={setupStyles.chassisItemAccent} />
                <Text style={[setupStyles.chassisPartLabel, layoutMetrics?.chassisPartLabel]}>CENTER / REAR POD</Text>
                <Text style={[setupStyles.chassisPartValue, layoutMetrics?.chassisPartValue]}>Rear steer {setup.geometry?.rearSteer || '--'}</Text>
                <Text style={[setupStyles.chassisPartSubValue, layoutMetrics?.chassisPartSubValue]}>Shock length {setup.suspension?.centerShockLength || '--'}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => onOpenPanel(rearPanelKey)} style={({ pressed }) => [setupStyles.rearBulkhead, layoutMetrics?.frontRearBulkhead, pressed && setupStyles.cardPressed]}>
                <View style={setupStyles.chassisItemAccent} />
                <Text style={[setupStyles.chassisPartLabel, layoutMetrics?.chassisPartLabel]}>{rearButtonLabel}</Text>
                <Text style={[setupStyles.chassisPartValue, layoutMetrics?.chassisPartValue]}>{rearValue}</Text>
                <Text style={[setupStyles.chassisPartSubValue, layoutMetrics?.chassisPartSubValue]}>{rearSubValue}</Text>
              </Pressable>
            )}
            <CornerHotspot corner="RR" setup={setup} profile={chassisProfile} onPress={() => onOpenPanel('RR')} layoutMetrics={layoutMetrics} />
          </View>
        </View>
      </View>
    </View>
  );
}

function CrossWeightCenter({ setup, onPress, layoutMetrics }) {
  const crossWeight = setup.cornerWeights?.crossWeight || '--';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [setupStyles.crossWeightCenter, layoutMetrics?.crossWeightCenter, pressed && setupStyles.cardPressed]}>
      <View style={setupStyles.chassisItemAccent} />
      <Text style={setupStyles.crossWeightLabel}>Cross Weight</Text>
      <Text style={[setupStyles.crossWeightValue, layoutMetrics?.crossWeightValue]}>{crossWeight}</Text>
      <Text style={setupStyles.crossWeightSub}>RF + LR</Text>
    </Pressable>
  );
}

function CornerHotspot({ corner, setup, profile, onPress, layoutMetrics }) {
  const isPanCar = isPanCarProfile(profile || setup?.chassisProfile);
  const tire = setup.tires?.[corner] || '--';
  const compound = setup.tires?.compound?.[corner] || tire || '--';
  const tireSize = setup.tires?.size?.[corner] || '--';
  const camber = setup.geometry?.camber?.[corner] || '--';
  const weight = setup.cornerWeights?.[corner] || '--';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [setupStyles.cornerHotspot, layoutMetrics?.cornerHotspot, pressed && setupStyles.cardPressed]}>
      <View style={setupStyles.chassisItemAccent} />
      <View style={[setupStyles.tireShape, layoutMetrics?.tireShape]}>
        <Text style={[setupStyles.cornerHotspotTitle, layoutMetrics?.cornerTitle]}>{corner}</Text>
      </View>
      <View style={setupStyles.cornerHotspotCopy}>
        <Text numberOfLines={1} style={[setupStyles.cornerHotspotLine, layoutMetrics?.cornerLine]}>Wheel</Text>
        <Text numberOfLines={1} style={[setupStyles.cornerHotspotSub, layoutMetrics?.cornerSub]}>{isPanCar ? `Comp ${compound}` : `Tire ${tire}`}</Text>
        <Text numberOfLines={1} style={[setupStyles.cornerHotspotSub, layoutMetrics?.cornerSub]}>{isPanCar ? `Size ${tireSize}` : `Camber ${camber}`}</Text>
        <Text numberOfLines={1} style={[setupStyles.cornerHotspotSub, layoutMetrics?.cornerSub]}>Wt {weight}</Text>
      </View>
    </Pressable>
  );
}

function FixedBottomActions({ setup, historyCount, onOpenPanel, bottomInset = 0, layoutMetrics }) {
  return (
    <View style={[setupStyles.editorBottomBar, layoutMetrics?.bottomBar || { paddingBottom: Math.max(24, bottomInset + 16) }]}>
      <View style={setupStyles.editorBottomActionRow}>
        <MapAction label="Results" value={setup.results?.round || 'Practice'} onPress={() => onOpenPanel('results')} layoutMetrics={layoutMetrics} />
        <MapAction label="Notes" value="Setup notes" onPress={() => onOpenPanel('notes')} layoutMetrics={layoutMetrics} />
        <MapAction label="History" value={`${historyCount}/10`} onPress={() => onOpenPanel('history')} layoutMetrics={layoutMetrics} />
      </View>
    </View>
  );
}

function MapAction({ label, value, onPress, layoutMetrics }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [setupStyles.mapActionButton, layoutMetrics?.mapActionButton, pressed && setupStyles.cardPressed]}>
      <Text style={setupStyles.mapActionLabel}>{label}</Text>
      <Text numberOfLines={1} style={[setupStyles.mapActionValue, layoutMetrics?.mapActionValue]}>{value}</Text>
    </Pressable>
  );
}

function SetupPanelModal({ visible, title, eyebrow, onClose, children, scrollRef }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const horizontalInset = width < 390 ? 6 : 10;
  const topPadding = Math.max(6, insets.top + 4);
  const bottomPadding = Math.max(6, insets.bottom + 4);
  const modalWidth = Math.max(280, width - (horizontalInset * 2));
  const modalMaxHeight = Math.max(360, height - topPadding - bottomPadding);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[
          setupStyles.modalBackdrop,
          {
            paddingTop: topPadding,
            paddingBottom: bottomPadding,
            paddingHorizontal: horizontalInset,
          },
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            setupStyles.modalCard,
            {
              width: modalWidth,
              maxWidth: modalWidth,
              maxHeight: modalMaxHeight,
              minHeight: Math.min(modalMaxHeight, Math.max(420, Math.round(modalMaxHeight * 0.92))),
            },
          ]}
        >
          <View style={setupStyles.modalHandle} />
          <View style={setupStyles.modalHeaderRow}>
            <View style={setupStyles.headerTextWrap}>
              <Text style={setupStyles.modalEyebrow}>{eyebrow}</Text>
              <Text numberOfLines={1} style={setupStyles.modalTitle}>{title}</Text>
            </View>
            <Pressable onPress={onClose} style={[setupStyles.button, setupStyles.buttonSecondary, setupStyles.modalCloseButton]}>
              <Text style={setupStyles.buttonSecondaryText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView
            ref={scrollRef}
            style={[setupStyles.modalScroll, { flex: 1 }]}
            contentContainerStyle={[
              setupStyles.modalScrollContent,
              {
                paddingBottom: Math.max(120, insets.bottom + 96),
              },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function UnsavedChangesModal({ visible, saving, onCancel, onLeave, onSaveLeave }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={[setupStyles.confirmBackdrop, { paddingTop: Math.max(18, insets.top + 10), paddingBottom: Math.max(18, insets.bottom + 10) }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={setupStyles.confirmCard}>
          <View style={setupStyles.confirmAccent} />
          <Text style={setupStyles.confirmEyebrow}>UNSAVED SETUP CHANGES</Text>
          <Text style={setupStyles.confirmTitle}>Save before leaving?</Text>
          <Text style={setupStyles.confirmMessage}>
            This setup has changes. Saving now creates a saved version and lets RaceDay record what changed.
          </Text>

          <View style={setupStyles.confirmActionStack}>
            <Pressable
              disabled={saving}
              onPress={onSaveLeave}
              style={({ pressed }) => [setupStyles.confirmPrimaryButton, saving && setupStyles.buttonDisabled, pressed && setupStyles.cardPressed]}
            >
              <Text style={setupStyles.confirmPrimaryText}>{saving ? 'Saving...' : 'Save & Leave'}</Text>
            </Pressable>

            <View style={setupStyles.confirmSecondaryRow}>
              <Pressable
                disabled={saving}
                onPress={onCancel}
                style={({ pressed }) => [setupStyles.confirmSecondaryButton, saving && setupStyles.buttonDisabled, pressed && setupStyles.cardPressed]}
              >
                <Text style={setupStyles.confirmSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={onLeave}
                style={({ pressed }) => [setupStyles.confirmDangerButton, saving && setupStyles.buttonDisabled, pressed && setupStyles.cardPressed]}
              >
                <Text style={setupStyles.confirmDangerText}>Leave No Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}


function ExportSetupModal({ visible, onCancel, onExportImrc, onExportPdf }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={[
          setupStyles.exportBackdrop,
          {
            paddingTop: Math.max(18, insets.top + 10),
            paddingBottom: Math.max(18, insets.bottom + 10),
          },
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={setupStyles.exportBackdropScroll}
          contentContainerStyle={setupStyles.exportBackdropScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={setupStyles.exportPromptCard}>
            <View style={setupStyles.confirmAccent} />
            <Text style={setupStyles.confirmEyebrow}>EXPORT SETUP</Text>
            <Text style={[setupStyles.confirmTitle, setupStyles.exportTitle]}>Choose export type</Text>
            <Text style={[setupStyles.confirmMessage, setupStyles.exportMessage]}>
              Export a reusable .imrc setup file, or create a printable setup sheet PDF.
            </Text>

            <View style={setupStyles.exportChoiceStack}>
              <Pressable onPress={onExportImrc} style={({ pressed }) => [setupStyles.exportChoiceButton, pressed && setupStyles.cardPressed]}>
                <View style={setupStyles.exportChoiceAccent} />
                <View style={setupStyles.headerTextWrap}>
                  <Text style={setupStyles.exportChoiceTitle}>Export .imrc</Text>
                  <Text style={setupStyles.exportChoiceSub}>Best for importing back into IMRC later.</Text>
                </View>
              </Pressable>

              <Pressable onPress={onExportPdf} style={({ pressed }) => [setupStyles.exportChoiceButton, pressed && setupStyles.cardPressed]}>
                <View style={setupStyles.exportChoiceAccent} />
                <View style={setupStyles.headerTextWrap}>
                  <Text style={setupStyles.exportChoiceTitle}>Export PDF</Text>
                  <Text style={setupStyles.exportChoiceSub}>Printable version like the v1 setup sheet.</Text>
                </View>
              </Pressable>
            </View>

            <Pressable onPress={onCancel} style={({ pressed }) => [setupStyles.confirmSecondaryButton, setupStyles.exportCancelButton, pressed && setupStyles.cardPressed]}>
              <Text style={setupStyles.confirmSecondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TwoColumnFields({ fields, fieldProps }) {
  return (
    <View style={setupStyles.grid2}>
      {fields.map((field) => (
        <SetupField
          key={field.path}
          label={field.label}
          style={setupStyles.gridItemHalf}
          {...fieldProps(field.path, field.options || {})}
        />
      ))}
    </View>
  );
}

function NotesField({ path, fieldProps, label = 'Notes' }) {
  return <SetupField label={label} multiline {...fieldProps(path)} />;
}


function formatSetupRolloutValue(value, decimals = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  const sign = n < 0 ? '-' : '';
  const fixed = Math.abs(n).toFixed(decimals).replace(/\.000$/, '').replace(/(\.\d{1,2})0$/, '$1');
  return `${sign}${fixed}`;
}

function sameGearingCell(cell, gearing = {}) {
  return Math.round(toRolloutNumber(gearing.pinion)) === cell?.pinion && Math.round(toRolloutNumber(gearing.spur)) === cell?.spur;
}

function buildSetupRolloutChart(gearing = {}) {
  const tireDiameter = gearing.tireDiameter;
  const internalRatio = gearing.transmissionRatio || gearing.transRatio || gearing.internalRatio;
  const targetRollout = toRolloutNumber(gearing.targetRollout);
  const targetRolloutMm = targetRollout > 0 ? valueToMm(targetRollout, 'in') : 0;
  const hasCore = toRolloutNumber(tireDiameter) > 0 && toRolloutNumber(internalRatio, 1) > 0;

  if (!hasCore) {
    return {
      canBuild: false,
      chart: { spurs: [], rows: [], bestCell: null },
      centerPinion: 0,
      centerSpur: 0,
      title: 'Enter tire and transmission ratio',
    };
  }

  let centerPinion = Math.round(toRolloutNumber(gearing.pinion));
  let centerSpur = Math.round(toRolloutNumber(gearing.spur));

  // Same priority as the Tools Rollout finder: keep the current spur when a
  // target rollout is entered, then find the pinion range around that target.
  if (targetRolloutMm > 0 && centerSpur > 0) {
    const circumferenceMm = toRolloutNumber(tireDiameter) * 25.4 * Math.PI;
    const idealPinion = circumferenceMm > 0
      ? (targetRolloutMm * centerSpur * toRolloutNumber(internalRatio, 1)) / circumferenceMm
      : 0;
    centerPinion = Math.max(1, Math.round(idealPinion || centerPinion || 1));
  } else if (targetRolloutMm > 0 && centerPinion > 0) {
    const circumferenceMm = toRolloutNumber(tireDiameter) * 25.4 * Math.PI;
    const idealSpur = circumferenceMm > 0
      ? (circumferenceMm * centerPinion) / (targetRolloutMm * toRolloutNumber(internalRatio, 1))
      : 0;
    centerSpur = Math.max(1, Math.round(idealSpur || centerSpur || 1));
  }

  if (centerPinion <= 0 || centerSpur <= 0) {
    return {
      canBuild: false,
      chart: { spurs: [], rows: [], bestCell: null },
      centerPinion,
      centerSpur,
      title: 'Enter pinion and spur',
    };
  }

  let chart = makeGearMatrix({
    tireDiameter,
    tireUnit: 'in',
    internalRatio,
    spur: centerSpur,
    centerPinion,
    pinionRadius: 3,
    spurRadius: 2,
    targetRolloutMm,
  });

  // When a target rollout is entered, re-center the chart around the closest
  // pinion/spur cell so the target stays in the middle instead of forcing the
  // racer to leave the setup screen and hunt through the Tools chart.
  if (targetRolloutMm > 0 && chart.bestCell) {
    centerPinion = chart.bestCell.pinion;
    centerSpur = chart.bestCell.spur;
    chart = makeGearMatrix({
      tireDiameter,
      tireUnit: 'in',
      internalRatio,
      spur: centerSpur,
      centerPinion,
      pinionRadius: 3,
      spurRadius: 2,
      targetRolloutMm,
    });
  }

  return {
    canBuild: !!chart.rows.length,
    chart,
    centerPinion,
    centerSpur,
    title: targetRolloutMm > 0 ? `Target ${formatSetupRolloutValue(targetRollout)} in` : `Around ${centerPinion}T / ${centerSpur}T`,
  };
}

function GearingRolloutFinder({ setup, fieldProps }) {
  const gearing = setup?.gearing || {};
  const finder = useMemo(() => buildSetupRolloutChart(gearing), [
    gearing.spur,
    gearing.pinion,
    gearing.tireDiameter,
    gearing.transmissionRatio,
    gearing.transRatio,
    gearing.internalRatio,
    gearing.targetRollout,
  ]);

  const bestCell = finder.chart.bestCell;
  const bestDeltaIn = bestCell ? mmToUnit(bestCell.deltaMm || 0, 'in') : 0;

  return (
    <SetupSection title="Rollout Finder" hint="Pinion / spur chart without leaving setup">
      <TwoColumnFields
        fieldProps={fieldProps}
        fields={[
          { label: 'Target Rollout', path: 'gearing.targetRollout', options: { keyboardType: 'decimal-pad', placeholder: 'inches' } },
        ]}
      />

      <View style={setupStyles.calcBox}>
        <Text style={setupStyles.calcLabel}>Chart</Text>
        <Text style={setupStyles.calcValue}>{finder.canBuild ? finder.title : 'Need more gearing info'}</Text>
        <Text style={setupStyles.calcSubValue}>
          {bestCell
            ? `Closest: ${bestCell.pinion}T / ${bestCell.spur}T · ${formatSetupRolloutValue(bestCell.rolloutIn)} in · Δ ${bestDeltaIn >= 0 ? '+' : ''}${formatSetupRolloutValue(bestDeltaIn)}`
            : 'Enter a target to auto-center the chart on the closest gear.'}
        </Text>
      </View>

      {finder.canBuild ? (
        <View style={{ borderWidth: 1, borderColor: 'rgba(168,85,247,0.22)', borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(168,85,247,0.12)', borderBottomWidth: 1, borderBottomColor: 'rgba(168,85,247,0.18)' }}>
            <Text style={{ width: 38, color: '#c084fc', fontSize: 10, fontWeight: '900', textAlign: 'center', paddingVertical: 6 }}>P/S</Text>
            {finder.chart.spurs.map((spur) => (
              <Text key={spur} style={{ flex: 1, color: '#c084fc', fontSize: 10, fontWeight: '900', textAlign: 'center', paddingVertical: 6 }}>{spur}T</Text>
            ))}
          </View>

          {finder.chart.rows.map((row) => {
            const currentPinion = Math.round(toRolloutNumber(gearing.pinion)) === row.pinion;
            return (
              <View key={row.pinion} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 31, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', backgroundColor: currentPinion ? 'rgba(168,85,247,0.045)' : 'transparent' }}>
                <Text style={{ width: 38, color: '#c084fc', fontSize: 10, fontWeight: '900', textAlign: 'center' }}>{row.pinion}T</Text>
                {row.cells.map((cell) => {
                  const currentCell = sameGearingCell(cell, gearing);
                  const targetCell = bestCell && cell.pinion === bestCell.pinion && cell.spur === bestCell.spur;
                  return (
                    <Text
                      key={`${cell.pinion}-${cell.spur}`}
                      style={{
                        flex: 1,
                        color: targetCell ? '#12081f' : currentCell ? '#f5e8ff' : '#e9ddff',
                        backgroundColor: targetCell ? '#c084fc' : currentCell ? 'rgba(168,85,247,0.22)' : 'transparent',
                        borderRadius: 6,
                        overflow: 'hidden',
                        fontSize: 10,
                        fontWeight: '900',
                        textAlign: 'center',
                        paddingVertical: 5,
                        marginHorizontal: 1,
                      }}
                    >
                      {formatSetupRolloutValue(cell.rolloutIn)}{targetCell ? '*' : ''}
                    </Text>
                  );
                })}
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={setupStyles.calcSubValue}>Enter tire diameter, transmission ratio, and pinion/spur to build the chart.</Text>
      )}
    </SetupSection>
  );
}

function GearingPanel({ setup, fieldProps }) {
  return (
    <>
      <SetupSection title="Gearing" hint="Rollout auto-calculates">
        <TwoColumnFields
          fieldProps={fieldProps}
          fields={[
            { label: 'Spur', path: 'gearing.spur', options: { keyboardType: 'numeric' } },
            { label: 'Pinion', path: 'gearing.pinion', options: { keyboardType: 'numeric' } },
            { label: 'Tire Diameter', path: 'gearing.tireDiameter', options: { keyboardType: 'decimal-pad', placeholder: 'inches' } },
            { label: 'Transmission Ratio', path: 'gearing.transmissionRatio', options: { keyboardType: 'decimal-pad' } },
          ]}
        />
        <View style={setupStyles.calcBox}>
          <Text style={setupStyles.calcLabel}>Rollout</Text>
          <Text style={setupStyles.calcValue}>{setup.gearing.rollout || '--'}</Text>
          <Text style={setupStyles.calcSubValue}>Inches per motor revolution</Text>
        </View>
        <NotesField path="gearing.notes" fieldProps={fieldProps} />
      </SetupSection>
      <GearingRolloutFinder setup={setup} fieldProps={fieldProps} />
    </>
  );
}

function isPanCarProfile(profile) {
  return profile?.layoutFamily === 'panCar' || profile?.driveType === 'panCar' || profile?.hasRearToe === false;
}

function CornerPanel({ corner, fieldProps, profile }) {
  const chassisProfile = profile || getSetupChassisProfile({});

  if (isPanCarProfile(chassisProfile)) {
    return <PanCarCornerPanel corner={corner} fieldProps={fieldProps} />;
  }

  const isFront = FRONT_CORNERS.includes(corner);
  const showToeField = isFront || chassisProfile.hasRearToe !== false;

  return (
    <>
      <SetupSection title={`${corner} Tire + Suspension`} hint="Most common changes">
        <TwoColumnFields
          fieldProps={fieldProps}
          fields={[
            { label: `${corner} Tire`, path: `tires.${corner}` },
            { label: `${corner} Spring`, path: `suspension.springs.${corner}` },
            { label: `${corner} Oil`, path: `suspension.oil.${corner}` },
            { label: `${corner} Damper`, path: `suspension.damper.${corner}` },
          ]}
        />
      </SetupSection>

      <SetupSection title={`${corner} Positions`} hint="Shock / hub / height">
        <TwoColumnFields
          fieldProps={fieldProps}
          fields={[
            { label: 'Shock Top', path: `suspension.shockPosition.${corner}.top` },
            { label: 'Shock Bottom', path: `suspension.shockPosition.${corner}.bottom` },
            { label: 'Ride Height', path: `suspension.rideHeight.${corner}` },
            { label: 'Droop', path: `suspension.droop.${corner}` },
            { label: 'Hub / Kingpin Top', path: `suspension.wheelHubKingpinPosition.${corner}.top` },
            { label: 'Hub / Kingpin Bottom', path: `suspension.wheelHubKingpinPosition.${corner}.bottom` },
          ]}
        />
      </SetupSection>

      <SetupSection title={`${corner} Geometry + Weight`}>
        <TwoColumnFields
          fieldProps={fieldProps}
          fields={[
            ...(showToeField ? [{ label: 'Toe In / Out', path: `geometry.toe.${corner}` }] : []),
            { label: 'Camber', path: `geometry.camber.${corner}` },
            ...(isFront ? [{ label: 'Caster', path: `geometry.caster.${corner}` }] : []),
            { label: 'Arm Upper', path: `geometry.armLocation.${corner}.upper` },
            { label: 'Arm Lower', path: `geometry.armLocation.${corner}.lower` },
            { label: 'Shock Mount Upper', path: `geometry.shockMount.${corner}.upper` },
            { label: 'Shock Mount Lower', path: `geometry.shockMount.${corner}.lower` },
            { label: `${corner} Weight`, path: `cornerWeights.${corner}`, options: { keyboardType: 'decimal-pad' } },
          ]}
        />
      </SetupSection>
    </>
  );
}

function PanCarCornerPanel({ corner, fieldProps }) {
  const isFront = FRONT_CORNERS.includes(corner);

  return (
    <>
      <SetupSection title={`${corner} Tires`} hint="Pan car compound and size">
        <TwoColumnFields
          fieldProps={fieldProps}
          fields={[
            { label: 'Compound', path: `tires.compound.${corner}` },
            { label: 'Size', path: `tires.size.${corner}` },
            ...(isFront ? [{ label: 'Camber Cut', path: `tires.camberCut.${corner}` }] : []),
          ]}
        />
      </SetupSection>

      {isFront ? (
        <SetupSection title={`${corner} Front Corner`} hint="Front tire, kingpin, and scale settings">
          <TwoColumnFields
            fieldProps={fieldProps}
            fields={[
              { label: 'Scale Weight', path: `cornerWeights.${corner}`, options: { keyboardType: 'decimal-pad' } },
              { label: 'Ride Height', path: `suspension.rideHeight.${corner}` },
              { label: 'Toe In / Out', path: `geometry.toe.${corner}` },
              { label: 'Camber', path: `geometry.camber.${corner}` },
              { label: 'Caster', path: `geometry.caster.${corner}` },
              { label: 'Caster Block Spacing', path: `geometry.casterBlockSpacing.${corner}` },
              { label: `${corner} Axle Shims`, path: `suspension.axleShims.${corner}` },
              { label: 'Spring #', path: `suspension.springs.${corner}` },
              { label: 'Oil # / Dampning', path: `suspension.oil.${corner}` },
              { label: 'Sag / Droop', path: `suspension.droop.${corner}` },
              { label: 'Shims Top Kingpin', path: `suspension.wheelHubKingpinPosition.${corner}.top` },
              { label: 'Shims Bottom Kingpin', path: `suspension.wheelHubKingpinPosition.${corner}.bottom` },
            ]}
          />
        </SetupSection>
      ) : (
        <SetupSection title={`${corner} Rear Spring / Weight`} hint="Rear spring preload and scale weight">
          <TwoColumnFields
            fieldProps={fieldProps}
            fields={[
              { label: 'Scale Weight', path: `cornerWeights.${corner}`, options: { keyboardType: 'decimal-pad' } },
              { label: 'Ride Height', path: `suspension.rideHeight.${corner}` },
              { label: 'Spring #', path: `suspension.springs.${corner}` },
              { label: 'Shock Oil', path: `suspension.oil.${corner}` },
              { label: 'Spring Preload', path: `suspension.springPreload.${corner}` },
              { label: 'Shock Overall Length', path: `suspension.springLength.${corner}` },
              { label: 'Outside Shock Position', path: `suspension.outsideShockPosition.${corner}` },
              { label: `${corner} Axle Shims`, path: `suspension.axleShims.${corner}` },
              { label: 'Sag / Droop', path: `suspension.droop.${corner}` },
            ]}
          />
        </SetupSection>
      )}
    </>
  );
}


function FrontPanel({ fieldProps, profile, setup }) {
  const chassisProfile = profile || getSetupChassisProfile({});
  const isPanCarFront = chassisProfile.layoutFamily === 'panCar' || chassisProfile.driveType === 'panCar' || chassisProfile.panCarFieldsOnly === true;
  const frontFields = isPanCarFront
    ? [
        { label: 'Ackerman Angle', path: 'geometry.ackermanAngle' },
        { label: 'Front Roll Center', path: 'geometry.frontRollCenter' },
        { label: 'Servo Mount Position', path: 'electronics.servoMountPosition' },
        { label: 'Servo Mount Angle', path: 'electronics.servoMountAngle' },
      ]
    : [
        { label: 'Ackerman Angle', path: 'geometry.ackermanAngle' },
        { label: 'Front Roll Center', path: 'geometry.frontRollCenter' },
        { label: 'Front Sway Bar', path: 'geometry.frontSwayBar' },
      ];

  return (
    <>
      <SetupSection title="Front" hint="Front toe is calculated from LF + RF toe in/out">
        <View style={setupStyles.calcBox}>
          <Text style={setupStyles.calcLabel}>Calculated Front Toe</Text>
          <Text style={setupStyles.calcValue}>{setup?.geometry?.frontToe || '--'}</Text>
          <Text style={setupStyles.calcSubValue}>LF Toe + RF Toe</Text>
        </View>
        <TwoColumnFields
          fieldProps={fieldProps}
          fields={frontFields}
        />
      </SetupSection>

      {chassisProfile.hasFrontDiff ? (
        <SetupSection title="Front Diff" hint="4WD front differential">
          <TwoColumnFields
            fieldProps={fieldProps}
            fields={[
              { label: 'Front Diff Type', path: 'drivetrain.frontDiffType' },
              { label: 'Front Diff Setting', path: 'drivetrain.frontDiffSetting' },
              { label: 'Front Diff Oil / Fluid', path: 'drivetrain.frontDiffFluid' },
            ]}
          />
        </SetupSection>
      ) : null}
    </>
  );
}

function RearPanel({ fieldProps, profile, setup }) {
  const chassisProfile = profile || getSetupChassisProfile({});

  return (
    <>
      <SetupSection title="Rear" hint="Rear toe is calculated from LR + RR toe in/out">
        <View style={setupStyles.calcBox}>
          <Text style={setupStyles.calcLabel}>Calculated Rear Toe</Text>
          <Text style={setupStyles.calcValue}>{setup?.geometry?.rearToe || '--'}</Text>
          <Text style={setupStyles.calcSubValue}>LR Toe + RR Toe</Text>
        </View>
        <TwoColumnFields
          fieldProps={fieldProps}
          fields={[
            { label: 'Rear Toe Block / Inserts', path: 'geometry.rearToeBlock' },
            { label: 'Rear Hub Position', path: 'drivetrain.rearHubPosition' },
            { label: 'Rear Axle Height', path: 'geometry.rearAxleHeight' },
            { label: 'Anti-Squat', path: 'geometry.antiSquat' },
            { label: 'Rear Roll Center', path: 'geometry.rearRollCenter' },
            { label: 'Rear Sway Bar', path: 'geometry.rearSwayBar' },
          ]}
        />
      </SetupSection>

      {chassisProfile.hasRearDiff ? (
        <SetupSection
          title={chassisProfile.driveType === '2wd' ? 'Rear' : 'Rear Diff'}
          hint={chassisProfile.driveType === '2wd' ? '2WD rear diff, transmission, and slipper' : '4WD rear differential'}
        >
          <TwoColumnFields
            fieldProps={fieldProps}
            fields={chassisProfile.driveType === '2wd' ? [
              { label: 'Transmission', path: 'drivetrain.transmission' },
              { label: 'Rear Diff Type', path: 'drivetrain.rearDiffType' },
              { label: 'Rear Diff Setting', path: 'drivetrain.rearDiffSetting' },
              { label: 'Rear Diff Oil / Fluid', path: 'drivetrain.rearDiffFluid' },
              { label: 'Rear Diff Height', path: 'drivetrain.rearDiffHeight' },
              { label: 'Internal Gears', path: 'drivetrain.internalGears' },
              { label: 'Planet Gears', path: 'drivetrain.planetGears' },
              { label: 'Slipper', path: 'drivetrain.slipper' },
              { label: 'Slipper Pads', path: 'drivetrain.slipperPads' },
            ] : [
              { label: 'Rear Diff Type', path: 'drivetrain.rearDiffType' },
              { label: 'Rear Diff Setting', path: 'drivetrain.rearDiffSetting' },
              { label: 'Rear Diff Oil / Fluid', path: 'drivetrain.rearDiffFluid' },
            ]}
          />
        </SetupSection>
      ) : null}
    </>
  );
}

function RearPodPanel({ fieldProps }) {
  return (
    <>
      <SetupSection title="Center / Rear Pod" hint="Pan car rear pod and center shock adjustments">
        <TwoColumnFields
          fieldProps={fieldProps}
          fields={[
            { label: 'Pod Height', path: 'suspension.podHeight' },
            { label: 'Pod Droop', path: 'suspension.podDroop' },
            { label: 'Rear Steer', path: 'geometry.rearSteer' },
            { label: 'T-Plate / Roll Center Shim', path: 'geometry.tPlateRollCenterShim' },
          ]}
        />
      </SetupSection>

      <SetupSection title="Center Shock" hint="Center/rear pod shock locations and preload">
        <TwoColumnFields
          fieldProps={fieldProps}
          fields={[
            { label: 'Front Chassis Position', path: 'suspension.centerShockPosition.frontChassisPosition' },
            { label: 'Front Tower Position', path: 'suspension.centerShockPosition.frontTowerPosition' },
            { label: 'Rear Shock Shims', path: 'suspension.centerShockPosition.rearShims' },
            { label: 'Shock Length', path: 'suspension.centerShockLength' },
            { label: 'Center Spring', path: 'suspension.centerSpring' },
            { label: 'Spring Preload', path: 'suspension.centerSpringPreload' },
            { label: 'Oil # / Dampning', path: 'suspension.centerOil' },
            { label: 'Center Damper', path: 'suspension.centerDamper' },
          ]}
        />
      </SetupSection>
    </>
  );
}


function PowerElectronicsPanel({ fieldProps, vehicleTransponderProps }) {
  return (
    <SetupSection title="Power / Electronics" hint="Battery and electronic placement">
      <View style={setupStyles.grid2}>
        <SetupField
          label="TX / Transponder Number"
          style={setupStyles.gridItemHalf}
          {...vehicleTransponderProps}
        />
      </View>
      <TwoColumnFields
        fieldProps={fieldProps}
        fields={[
          { label: 'Battery Position', path: 'chassis.batteryPosition' },
          { label: 'Battery Orientation', path: 'electronics.batteryOrientation' },
          { label: 'Battery Type / Weight', path: 'electronics.batteryWeight' },
          { label: 'Motor Position', path: 'chassis.motorPosition' },
          { label: 'ESC Position', path: 'electronics.escPosition' },
          { label: 'Receiver Position', path: 'electronics.receiverPosition' },
          { label: 'Servo Position', path: 'electronics.servoPosition' },
          { label: 'Transponder Position', path: 'electronics.transponderPosition' },
          { label: 'Fan Position', path: 'electronics.fanPosition' },
          { label: 'Ballast / Weight', path: 'chassis.ballast' },
        ]}
      />
      <NotesField label="Power / Electronics Notes" path="electronics.notes" fieldProps={fieldProps} />
    </SetupSection>
  );
}

function CenterPanel({ fieldProps, profile }) {
  const chassisProfile = profile || getSetupChassisProfile({});

  if (chassisProfile.hasCenterPod) {
    return (
      <>
        <SetupSection title="Center Shock" hint="Center-only adjustments">
          <TwoColumnFields
            fieldProps={fieldProps}
            fields={[
              { label: 'Center Spring', path: 'suspension.centerSpring' },
              { label: 'Center Oil', path: 'suspension.centerOil' },
              { label: 'Center Damper', path: 'suspension.centerDamper' },
              { label: 'Center Shock Front', path: 'suspension.centerShockPosition.front' },
              { label: 'Center Shock Rear', path: 'suspension.centerShockPosition.rear' },
            ]}
          />
        </SetupSection>
      </>
    );
  }

  if (chassisProfile.driveType === '4wd') {
    return (
      <>
        <SetupSection title="Center Diff / Drivetrain" hint="4WD center diff and slipper">
          <TwoColumnFields
            fieldProps={fieldProps}
            fields={[
              { label: 'Transmission', path: 'drivetrain.transmission' },
              { label: 'Center Diff Type', path: 'drivetrain.centerDiffType' },
              { label: 'Center Diff Setting', path: 'drivetrain.centerDiffSetting' },
              { label: 'Center Diff Oil / Fluid', path: 'drivetrain.centerDiffFluid' },
              { label: 'Slipper', path: 'drivetrain.slipper' },
              { label: 'Slipper Pads', path: 'drivetrain.slipperPads' },
            ]}
          />
        </SetupSection>
        <SetupSection title="Drivetrain Notes" hint="Saves with this setup">
          <NotesField label="Drivetrain Notes" path="drivetrain.notes" fieldProps={fieldProps} />
        </SetupSection>
      </>
    );
  }

  return (
    <>
      <SetupSection title="Rear" hint="2WD rear diff, transmission, and slipper">
        <TwoColumnFields
          fieldProps={fieldProps}
          fields={[
            { label: 'Transmission', path: 'drivetrain.transmission' },
            { label: 'Rear Diff Type', path: 'drivetrain.rearDiffType' },
            { label: 'Rear Diff Setting', path: 'drivetrain.rearDiffSetting' },
            { label: 'Rear Diff Oil / Fluid', path: 'drivetrain.rearDiffFluid' },
            { label: 'Rear Diff Height', path: 'drivetrain.rearDiffHeight' },
            { label: 'Internal Gears', path: 'drivetrain.internalGears' },
            { label: 'Planet Gears', path: 'drivetrain.planetGears' },
            { label: 'Slipper', path: 'drivetrain.slipper' },
            { label: 'Slipper Pads', path: 'drivetrain.slipperPads' },
          ]}
        />
      </SetupSection>
      <SetupSection title="Drivetrain Notes" hint="Saves with this setup">
        <NotesField label="Drivetrain Notes" path="drivetrain.notes" fieldProps={fieldProps} />
      </SetupSection>
    </>
  );
}

function CornerWeightsPanel({ setup, fieldProps, updateField, editable }) {
  const unit = setup.cornerWeights.unit || 'grams';

  return (
    <SetupSection title="Four Corner Weights" hint="Cross = RF + LR">
      <View style={[setupStyles.wrapRow, { marginBottom: 10 }]}> 
        {['grams', 'ounces'].map((item) => {
          const active = unit === item;
          return (
            <Pressable
              key={item}
              disabled={!editable}
              onPress={() => updateField('cornerWeights.unit', item)}
              style={[setupStyles.tabPill, active && setupStyles.tabPillActive, !editable && setupStyles.buttonDisabled]}
            >
              <Text style={[setupStyles.tabText, active && setupStyles.tabTextActive]}>{item}</Text>
            </Pressable>
          );
        })}
      </View>

      <TwoColumnFields
        fieldProps={fieldProps}
        fields={CORNERS.map((corner) => ({
          label: `${corner} Weight`,
          path: `cornerWeights.${corner}`,
          options: { keyboardType: 'decimal-pad', placeholder: unit === 'grams' ? 'g' : 'oz' },
        }))}
      />

      <View style={setupStyles.calcBox}>
        <Text style={setupStyles.calcLabel}>Cross Weight</Text>
        <Text style={setupStyles.calcValue}>{setup.cornerWeights.crossWeight || '--'}</Text>
      </View>
    </SetupSection>
  );
}

function ResultsPanel({ setup, fieldProps, updateField, editable }) {
  return (
    <>
      <SetupSection title="Round" hint="Default Practice">
        <View style={setupStyles.wrapRow}>
          {SETUP_ROUNDS.map((round) => {
            const active = setup.results.round === round;
            return (
              <Pressable
                key={round}
                disabled={!editable}
                onPress={() => updateField('results.round', round)}
                style={[setupStyles.tabPill, active && setupStyles.tabPillActive, !editable && setupStyles.buttonDisabled]}
              >
                <Text style={[setupStyles.tabText, active && setupStyles.tabTextActive]}>{round}</Text>
              </Pressable>
            );
          })}
        </View>
      </SetupSection>

      <SetupSection title="Results Data">
        <TwoColumnFields
          fieldProps={fieldProps}
          fields={[
            { label: 'Fast Lap', path: 'results.fastLap', options: { keyboardType: 'decimal-pad' } },
            { label: 'Avg Lap', path: 'results.avgLap', options: { keyboardType: 'decimal-pad' } },
            { label: 'Total Laps', path: 'results.totalLaps', options: { keyboardType: 'numeric' } },
            { label: 'Total Time', path: 'results.totalTime' },
            { label: 'Motor Temp °F', path: 'results.motorTempF', options: { keyboardType: 'numeric' } },
          ]}
        />
        <NotesField path="results.notes" fieldProps={fieldProps} />
      </SetupSection>
    </>
  );
}

function NotesPanel({ fieldProps }) {
  return (
    <SetupSection title="Notes" hint="Saved with setup">
      <NotesField label="Gearing Notes" path="gearing.notes" fieldProps={fieldProps} />
      <NotesField label="Tires Notes" path="tires.notes" fieldProps={fieldProps} />
      <NotesField label="Suspension Notes" path="suspension.notes" fieldProps={fieldProps} />
      <NotesField label="Geometry Notes" path="geometry.notes" fieldProps={fieldProps} />
      <NotesField label="Chassis Notes" path="chassis.notes" fieldProps={fieldProps} />
      <NotesField label="Electronics Notes" path="electronics.notes" fieldProps={fieldProps} />
      <NotesField label="Drivetrain Notes" path="drivetrain.notes" fieldProps={fieldProps} />
      <NotesField label="Corner Weight Notes" path="cornerWeights.notes" fieldProps={fieldProps} />
      <NotesField label="Results Notes" path="results.notes" fieldProps={fieldProps} />
    </SetupSection>
  );
}

function HistoryPanel({ history, onDelete, onOpenVersion }) {

  if (!history.length) {
    return (
      <SetupSection title="History" hint="Last 10 versions">
        <Text style={setupStyles.emptyText}>No saved setup versions yet. Use Save to create the first history version.</Text>
      </SetupSection>
    );
  }

  return (
    <SetupSection title="History" hint="Last 10 versions">
      {history.map((item, index) => (
        <View key={item.id} style={setupStyles.cardTight}>
          <View style={setupStyles.headerRow}>
            <View style={setupStyles.headerTextWrap}>
              <Text style={setupStyles.cardTitle}>{index === 0 ? 'Latest Saved Version' : `Saved Version ${index + 1}`}</Text>
              <Text style={setupStyles.cardSubtitle}>{formatDate(item.savedAt || item.updatedAt)}</Text>
            </View>
            <View style={setupStyles.badge}>
              <Text style={setupStyles.badgeText}>{item.results?.round || 'Setup'}</Text>
            </View>
          </View>

          <View style={[setupStyles.row, { marginTop: 12 }]}> 
            <Pressable
              onPress={() => onOpenVersion?.(item.id)}
              style={[setupStyles.button, setupStyles.buttonSecondary, { flex: 1 }]}
            >
              <Text style={setupStyles.buttonSecondaryText}>Open Read Only</Text>
            </Pressable>
            <Pressable onPress={() => onDelete(item.id)} style={[setupStyles.button, setupStyles.buttonDanger, { flex: 1 }]}> 
              <Text style={setupStyles.buttonDangerText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </SetupSection>
  );
}

function StatBox({ label, value }) {
  return (
    <View style={setupStyles.statBox}>
      <Text style={setupStyles.statLabel}>{label}</Text>
      <Text style={setupStyles.statValue}>{value}</Text>
    </View>
  );
}

function formatDate(value) {
  if (!value) return 'Not saved yet';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
