// features/tracks/utils/trackSubmitEmail.js

import { Linking } from 'react-native';

import {
  TRACK_SUBMISSION_EMAIL,
  TRACK_SUBMISSION_SUBJECT,
} from '../constants/trackSubmit';
import { buildTrackExportPayload } from './trackImportExport';
import { normalizeTrack } from '../storage/trackStorage';

function clean(value) {
  return String(value || '').trim();
}

function safeFilePart(value, fallback = 'Track') {
  const cleaned = clean(value)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return cleaned || fallback;
}

function isNativeModuleMissingError(error) {
  const message = String(error?.message || error || '');
  return (
    message.includes('Cannot find native module') ||
    message.includes('ExpoMailComposer') ||
    message.includes('NativeModule')
  );
}

export function buildTrackSubmissionJson(track = {}) {
  const normalized = normalizeTrack(track);

  // Keep this matching the GitHub Version 1 import format.
  return buildTrackExportPayload(normalized);
}

export function buildTrackSubmissionFileName(track = {}) {
  const payload = buildTrackSubmissionJson(track);
  const namePart = safeFilePart(payload.name || track.trackName || track.name, 'Track');
  const typePart = safeFilePart(payload.trackType || track.trackType, 'TrackType');

  return `${namePart}.${typePart}.json`;
}

export function buildTrackSubmissionBody(track = {}, options = {}) {
  const payload = buildTrackSubmissionJson(track);

  const lines = [
    'IMRC Setup Manager Track Submission',
    '',
  ];

  if (options.jsonAttached) {
    lines.push('Attached is the track JSON file.');
  } else {
    lines.push('The native email attachment module is not available in this app build.');
    lines.push('The track JSON is pasted below instead.');
  }

  lines.push(
    '',
    `Track Name: ${clean(payload.name)}`,
    `Track Type: ${clean(payload.trackType)}`,
    `Surface: ${clean(payload.surface)}`,
    `City/State: ${clean(payload.cityState)}`,
    `Zip: ${clean(payload.zip)}`,
    '',
  );

  if (!options.jsonAttached) {
    lines.push(
      '--- TRACK JSON START ---',
      JSON.stringify(payload, null, 2),
      '--- TRACK JSON END ---',
      '',
      'To send this as an attached .json file, rebuild the app with expo-mail-composer installed.',
      ''
    );
  }

  lines.push('Submitted from IMRC Setup Manager.');

  return lines.join('\n');
}

async function loadAttachmentModules() {
  try {
    const MailComposer = await import('expo-mail-composer');
    const FileSystem = await import('expo-file-system');

    return {
      MailComposer,
      FileSystem,
    };
  } catch (error) {
    const wrappedError = new Error('Email attachment modules are not available in this app build.');
    wrappedError.originalError = error;
    wrappedError.userMessage =
      'Email attachments require expo-mail-composer in the installed app build. Rebuild the dev app/APK after installing the package.';
    throw wrappedError;
  }
}

export async function createTrackSubmissionJsonFile(track = {}) {
  const { FileSystem } = await loadAttachmentModules();

  const fileName = buildTrackSubmissionFileName(track);
  const payload = buildTrackSubmissionJson(track);
  const jsonText = JSON.stringify(payload, null, 2);

  const cacheDirectory = FileSystem.cacheDirectory;

  if (!cacheDirectory) {
    const error = new Error('Expo FileSystem cacheDirectory is not available.');
    error.userMessage = 'Could not create the JSON attachment file on this device.';
    throw error;
  }

  const fileUri = `${cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, jsonText, {
    encoding: FileSystem.EncodingType?.UTF8 || 'utf8',
  });

  return {
    fileUri,
    fileName,
    payload,
  };
}

async function openFallbackMailto(track = {}) {
  const payload = buildTrackSubmissionJson(track);
  const subject = encodeURIComponent(
    `${TRACK_SUBMISSION_SUBJECT}: ${payload.name || buildTrackSubmissionFileName(track)}`
  );
  const body = encodeURIComponent(buildTrackSubmissionBody(track, { jsonAttached: false }));
  const mailtoUrl = `mailto:${TRACK_SUBMISSION_EMAIL}?subject=${subject}&body=${body}`;

  const canOpen = await Linking.canOpenURL(mailtoUrl);

  if (!canOpen) {
    const error = new Error('No email app found.');
    error.userMessage = 'No email app is available on this device.';
    throw error;
  }

  await Linking.openURL(mailtoUrl);

  return {
    fallback: true,
  };
}

export async function openTrackSubmissionEmail(track = {}) {
  try {
    const { MailComposer } = await loadAttachmentModules();

    const available = await MailComposer.isAvailableAsync();

    if (!available) {
      return openFallbackMailto(track);
    }

    const { fileUri, fileName, payload } = await createTrackSubmissionJsonFile(track);

    return MailComposer.composeAsync({
      recipients: [TRACK_SUBMISSION_EMAIL],
      subject: `${TRACK_SUBMISSION_SUBJECT}: ${payload.name || fileName}`,
      body: buildTrackSubmissionBody(track, { jsonAttached: true }),
      attachments: [fileUri],
    });
  } catch (error) {
    if (isNativeModuleMissingError(error) || isNativeModuleMissingError(error?.originalError)) {
      return openFallbackMailto(track);
    }

    throw error;
  }
}
