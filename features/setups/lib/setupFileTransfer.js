import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  buildSetupExportBundle,
  importSetupExportBundle,
  saveSetupCopyToTarget,
} from './setupStorage';
import { buildSetupPdfHtml } from './setupPdfExport';

export const IMRC_SETUP_FILE_SCHEMA = 'imrc-setup-file-v1';
export const PENDING_IMRC_IMPORT_URI_KEY = '@pendingImrcImportUri_v1';
export const LAST_HANDLED_IMRC_IMPORT_URI_KEY = '@lastHandledImrcImportUri_v1';

function safeFileName(value, fallback = 'setup') {
  const clean = String(value || fallback)
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return clean || fallback;
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function getPickedAsset(result) {
  if (!result) return null;
  if (result.canceled) return null;
  if (Array.isArray(result.assets) && result.assets[0]) return result.assets[0];
  if (result.type === 'success' && result.uri) return result;
  return null;
}

async function ensureCanShare() {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }
}

function cacheFile(fileName) {
  return new File(Paths.cache, fileName);
}

function writeTextCacheFile(fileName, contents) {
  const file = cacheFile(fileName);
  file.create({ overwrite: true, intermediates: true });
  file.write(contents, { encoding: 'utf8' });
  return file.uri;
}

function decodeMaybe(value) {
  const raw = String(value || '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function trimTrailingRoutingNoise(uri) {
  const value = String(uri || '').trim();
  if (!value) return '';

  // Expo Router / Android can append unmatched-route or query fragments after
  // the real file URI. Keep the actual file/content URI portion only.
  const routerSplit = value.split('/--/')[0];
  return routerSplit.replace(/[\s]+$/g, '');
}

export function getReadableImportUriFromUrl(value) {
  const source = String(value || '').trim();
  if (!source) return '';

  const decoded = decodeMaybe(source);

  // First inspect known deep-link query parameters before doing broad string
  // slicing. This preserves encoded content:// values better on Android.
  for (const candidate of [source, decoded]) {
    try {
      const parsed = new URL(candidate);
      const nestedUri = parsed.searchParams.get('uri')
        || parsed.searchParams.get('file')
        || parsed.searchParams.get('url')
        || parsed.searchParams.get('source')
        || parsed.searchParams.get('path')
        || parsed.searchParams.get('data')
        || parsed.searchParams.get('initialUrl');
      if (nestedUri && nestedUri !== candidate) {
        const nested = getReadableImportUriFromUrl(nestedUri);
        if (nested) return nested;
      }
    } catch {
      // Not a normal URL. Continue with raw string matching below.
    }
  }

  // Direct readable file paths.
  if (decoded.startsWith('file://') || decoded.startsWith('/') || decoded.startsWith('content://')) {
    return trimTrailingRoutingNoise(decoded);
  }

  // Deep links/unmatched routes sometimes contain the readable URI inside the
  // path or hash instead of query params.
  const contentIndex = decoded.indexOf('content://');
  if (contentIndex >= 0) {
    return trimTrailingRoutingNoise(decoded.slice(contentIndex));
  }

  const fileIndex = decoded.indexOf('file://');
  if (fileIndex >= 0) {
    return trimTrailingRoutingNoise(decoded.slice(fileIndex));
  }

  return '';
}

function looksLikeJsonText(value) {
  const text = String(value || '').trim();
  return text.startsWith('{') || text.startsWith('[');
}

async function readContentUriWithLegacyBridge(contentUri) {
  const encoding = LegacyFileSystem.EncodingType?.UTF8 || 'utf8';

  // SAF can read many Android content:// document URIs directly. This is the
  // most reliable automatic-open path for Files/Downloads/Drive providers.
  try {
    if (LegacyFileSystem.StorageAccessFramework?.readAsStringAsync) {
      return await LegacyFileSystem.StorageAccessFramework.readAsStringAsync(contentUri, { encoding });
    }
  } catch (safError) {
    // Fall through to cache-copy bridge.
  }

  const fileName = `incoming-imrc-${Date.now()}.imrc`;
  const targetUri = `${LegacyFileSystem.cacheDirectory || ''}${fileName}`;
  if (!targetUri) {
    throw new Error('IMRC could not prepare a temporary import file.');
  }

  await LegacyFileSystem.copyAsync({ from: contentUri, to: targetUri });
  return await LegacyFileSystem.readAsStringAsync(targetUri, { encoding });
}

async function readTextFile(uri) {
  const source = String(uri || '').trim();
  if (!source) {
    throw new Error('No import file was selected.');
  }

  if (looksLikeJsonText(source)) {
    return source;
  }

  const readableUri = getReadableImportUriFromUrl(source);

  if (readableUri.startsWith('file://') || readableUri.startsWith('/')) {
    const file = new File(readableUri);
    return await file.text();
  }

  if (readableUri.startsWith('content://')) {
    try {
      return await readContentUriWithLegacyBridge(readableUri);
    } catch (legacyError) {
      try {
        const response = await fetch(readableUri);
        const text = await response.text();
        if (text) return text;
      } catch {
        // Throw the more helpful message below.
      }
      throw new Error('IMRC could not read the opened .imrc file from Android. Use the Import button and choose the file from storage if this file provider blocks direct open-with access.');
    }
  }

  throw new Error('IMRC opened the app, but Android did not pass a readable .imrc file URL. Use Import and pick the same file from storage.');
}

async function copyFileToCache(sourceUri, fileName) {
  const sourceFile = new File(sourceUri);
  const targetFile = cacheFile(fileName);
  if (targetFile.exists) {
    targetFile.delete();
  }
  await sourceFile.copy(targetFile);
  return targetFile.uri;
}

function buildSetupFilePayload(setup) {
  return {
    schema: IMRC_SETUP_FILE_SCHEMA,
    app: 'IMRC Setup Manager 2.0',
    exportedAt: new Date().toISOString(),
    data: {
      setup,
      setups: setup ? [setup] : [],
      setupHistories: setup?.vehicleId && setup?.trackId
        ? [{ vehicleId: String(setup.vehicleId), trackId: String(setup.trackId), history: [setup] }]
        : [],
      lastViewedSetup: setup?.vehicleId && setup?.trackId
        ? {
            setupId: setup.id || setup.setupId,
            vehicleId: setup.vehicleId,
            trackId: setup.trackId,
            vehicleName: setup.vehicleName,
            trackName: setup.trackName,
            savedAt: setup.savedAt || setup.updatedAt,
          }
        : null,
    },
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstSetupFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload.data || payload;
  return data.setup || payload.setup || asArray(data.setups || payload.setups)[0] || null;
}

function countSetupsInPayload(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  const data = payload.data || payload;
  const setups = asArray(data.setups || payload.setups);
  const histories = asArray(data.setupHistories || payload.setupHistories || data.histories || payload.histories);
  return (data.setup || payload.setup ? 1 : 0) + setups.length + histories.reduce((sum, group) => sum + asArray(group.history || group.versions || group.items).length, 0);
}

function buildImportReview({ payload, uri, fileName }) {
  const setup = firstSetupFromPayload(payload);
  const data = payload?.data || payload || {};

  if (!setup || typeof setup !== 'object') {
    return {
      uri,
      fileName,
      payload,
      setup: null,
      isSingleSetup: false,
      setupCount: countSetupsInPayload(payload),
    };
  }

  return {
    uri,
    fileName,
    payload,
    setup,
    isSingleSetup: true,
    setupCount: countSetupsInPayload(payload) || 1,
    suggestedVehicleId: String(setup.vehicleId || data.vehicleId || ''),
    suggestedTrackId: String(setup.trackId || data.trackId || ''),
    suggestedVehicleName: setup.vehicleName || setup.carName || setup.vehicle || data.vehicleName || '',
    suggestedTrackName: setup.trackName || setup.track || data.trackName || '',
    sourceVehicleName: setup.vehicleName || setup.carName || setup.vehicle || data.vehicleName || 'Imported Vehicle',
    sourceTrackName: setup.trackName || setup.track || data.trackName || 'Imported Track',
    sourceChassisStyle: setup.vehicleChassisStyle || setup.chassisStyle || setup.chassisProfile?.label || '',
    sourceTrackType: setup.trackType || setup.trackStyle || setup.trackCategory || setup.surface || '',
    exportedAt: payload.exportedAt || data.exportedAt || setup.savedAt || setup.updatedAt || '',
  };
}

export function isLikelyImrcUri(uri) {
  const value = String(uri || '').toLowerCase();
  return value.includes('.imrc') || value.includes('imrc-setup') || value.startsWith('imrc://') || value.startsWith('imrc-setup://');
}

export function isIncomingFileOpenUri(uri) {
  const value = String(uri || '').toLowerCase();
  if (!value) return false;
  if (value.startsWith('content://') || value.startsWith('file://')) return true;
  if (getReadableImportUriFromUrl(uri)) return true;
  // Plain imrc:// links should open Setups, but only count as an import if they
  // include a nested file/content URI. This prevents false Import Failed popups.
  return isLikelyImrcUri(uri);
}

export function canQueueReadableImrcImport(uri) {
  const value = String(uri || '').toLowerCase();
  return Boolean(value.startsWith('content://') || value.startsWith('file://') || getReadableImportUriFromUrl(uri));
}

function normalizeIncomingUriForCompare(uri) {
  return String(uri || '').trim();
}

async function wasIncomingUriJustQueued(uri) {
  const normalized = normalizeIncomingUriForCompare(uri);
  if (!normalized) return false;

  try {
    const raw = await AsyncStorage.getItem(LAST_HANDLED_IMRC_IMPORT_URI_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const sameUri = normalizeIncomingUriForCompare(parsed?.uri) === normalized;
    const ageMs = Date.now() - new Date(parsed?.handledAt || parsed?.queuedAt || 0).getTime();
    return sameUri && Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 12000;
  } catch {
    return false;
  }
}

async function rememberIncomingUriQueued(uri) {
  const normalized = normalizeIncomingUriForCompare(uri);
  if (!normalized) return;
  await AsyncStorage.setItem(
    LAST_HANDLED_IMRC_IMPORT_URI_KEY,
    JSON.stringify({ uri: normalized, handledAt: new Date().toISOString() })
  );
}

export async function clearPendingIncomingImrcImport() {
  await AsyncStorage.removeItem(PENDING_IMRC_IMPORT_URI_KEY);
}

export async function queueIncomingImrcImport(uri, { allowRecentRepeat = false } = {}) {
  const source = String(uri || '').trim();
  if (!source || !isIncomingFileOpenUri(source)) return false;

  // Android can resend the same open-with URL when the app navigates. Do not
  // keep re-queuing it after the user cancels, backs out, or an import fails.
  if (!allowRecentRepeat && await wasIncomingUriJustQueued(source)) {
    return false;
  }

  const queuedAt = new Date().toISOString();

  try {
    // Read and parse immediately while Android's temporary content:// grant is
    // freshest. The Setups screen then consumes prepared JSON instead of trying
    // to read the file later after navigation.
    const preparedImport = await prepareSetupImportFromUri(source, 'opened-setup.imrc');
    await AsyncStorage.setItem(
      PENDING_IMRC_IMPORT_URI_KEY,
      JSON.stringify({ uri: source, queuedAt, preparedImport })
    );
    await rememberIncomingUriQueued(source);
    return true;
  } catch (error) {
    // Do not queue unreadable Android open-with attempts. Android may open the
    // app without granting a readable file URI; queuing that state causes Setups
    // to show the import warning every time the page opens.
    await clearPendingIncomingImrcImport();
    await rememberIncomingUriQueued(source);
    console.warn('Incoming IMRC file was not readable; ignoring automatic import.', error);
    return false;
  }
}

export async function consumePendingIncomingImrcImport() {
  const raw = await AsyncStorage.getItem(PENDING_IMRC_IMPORT_URI_KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(PENDING_IMRC_IMPORT_URI_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return { uri: raw };
  }
}

export async function prepareSetupImportFromUri(uri, fileName = 'setup-import.imrc') {
  const raw = await readTextFile(uri);
  const payload = JSON.parse(raw);
  return buildImportReview({ payload, uri, fileName });
}

export async function pickSetupImportForReview() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', 'text/plain', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  const asset = getPickedAsset(result);
  if (!asset?.uri) {
    return { canceled: true };
  }

  return {
    canceled: false,
    ...(await prepareSetupImportFromUri(asset.uri, asset.name || 'setup-import.imrc')),
  };
}

export async function importPreparedSetupToTarget(preparedImport, { vehicle, track, vehicleId, trackId } = {}) {
  const setup = preparedImport?.setup;
  if (!setup) {
    throw new Error('This file does not contain a single setup that can be imported to a car and track.');
  }

  const savedSetup = await saveSetupCopyToTarget(setup, {
    vehicle,
    track,
    vehicleId,
    trackId,
    source: 'imrc-import',
  });

  return {
    savedSetup,
    mergedSetupCount: 1,
    fileName: preparedImport.fileName || 'setup-import.imrc',
  };
}

export async function importPreparedSetupBundle(preparedImport) {
  if (!preparedImport?.payload) {
    throw new Error('No setup data is ready to import.');
  }
  return importSetupExportBundle(preparedImport.payload);
}

export async function shareSetupsExportJson() {
  await ensureCanShare();
  const bundle = await buildSetupExportBundle();
  const setupCount = bundle?.data?.setups?.length || 0;
  const historyCount = bundle?.data?.setupHistories?.length || 0;
  const fileName = `imrc-setups-export-${timestampForFile()}.imrc`;
  const uri = writeTextCacheFile(fileName, JSON.stringify(bundle, null, 2));

  await Sharing.shareAsync(uri, {
    mimeType: 'application/octet-stream',
    dialogTitle: 'Export IMRC Setups',
    UTI: 'public.data',
  });

  return { uri, setupCount, historyCount };
}

export async function importSetupsExportJson() {
  const prepared = await pickSetupImportForReview();
  if (prepared?.canceled) return { canceled: true };
  const imported = await importPreparedSetupBundle(prepared);
  return {
    ...imported,
    canceled: false,
    fileName: prepared.fileName || 'setup-import.imrc',
  };
}

export async function shareSetupVersionImrc(setup) {
  if (!setup) throw new Error('No setup selected.');
  await ensureCanShare();

  const fileName = `${safeFileName(setup.vehicleName)}-${safeFileName(setup.trackName)}-${timestampForFile()}.imrc`;
  const payload = buildSetupFilePayload(setup);
  const uri = writeTextCacheFile(fileName, JSON.stringify(payload, null, 2));

  await Sharing.shareAsync(uri, {
    mimeType: 'application/octet-stream',
    dialogTitle: 'Export Setup .imrc',
    UTI: 'public.data',
  });

  return { uri };
}

// Backwards-compatible alias for older code paths. New UI labels this as .imrc.
export async function shareSetupVersionJson(setup) {
  return shareSetupVersionImrc(setup);
}

export async function shareSetupPdf(setup) {
  if (!setup) throw new Error('No setup selected.');
  await ensureCanShare();

  const html = buildSetupPdfHtml(setup);
  const printed = await Print.printToFileAsync({ html, base64: false });
  const sourceUri = printed?.uri;
  if (!sourceUri) throw new Error('PDF file could not be created.');

  const fileName = `${safeFileName(setup.vehicleName)}-${safeFileName(setup.trackName)}-${timestampForFile()}.pdf`;
  const targetUri = await copyFileToCache(sourceUri, fileName);

  await Sharing.shareAsync(targetUri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Export Printable Setup PDF',
    UTI: 'com.adobe.pdf',
  });

  return { uri: targetUri };
}
