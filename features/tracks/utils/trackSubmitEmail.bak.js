// features/tracks/utils/trackSubmitEmail.js

import * as MailComposer from 'expo-mail-composer';
import { File, Paths } from 'expo-file-system';

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

export function buildTrackSubmissionBody(track = {}) {
  const payload = buildTrackSubmissionJson(track);

  return [
    'IMRC Setup Manager Track Submission',
    '',
    'Attached is the track JSON file.',
    '',
    `Track Name: ${clean(payload.name)}`,
    `Track Type: ${clean(payload.trackType)}`,
    `Surface: ${clean(payload.surface)}`,
    `City/State: ${clean(payload.cityState)}`,
    `Zip: ${clean(payload.zip)}`,
    '',
    'Submitted from IMRC Setup Manager.',
  ].join('\n');
}

export async function createTrackSubmissionJsonFile(track = {}) {
  const fileName = buildTrackSubmissionFileName(track);
  const payload = buildTrackSubmissionJson(track);
  const jsonText = JSON.stringify(payload, null, 2);

  const file = new File(Paths.cache, fileName);

  try {
    file.create({
      overwrite: true,
      intermediates: true,
    });
  } catch (error) {
    // If the file already exists on a device/SDK that ignores overwrite,
    // try deleting and creating it once more.
    try {
      file.delete();
      file.create({
        overwrite: true,
        intermediates: true,
      });
    } catch (innerError) {
      throw error;
    }
  }

  file.write(jsonText);

  return {
    fileUri: file.uri,
    fileName,
    payload,
  };
}

export async function openTrackSubmissionEmail(track = {}) {
  const available = await MailComposer.isAvailableAsync();

  if (!available) {
    const error = new Error('No email app found.');
    error.userMessage = 'No email app is available on this device.';
    throw error;
  }

  const { fileUri, fileName, payload } = await createTrackSubmissionJsonFile(track);

  return MailComposer.composeAsync({
    recipients: [TRACK_SUBMISSION_EMAIL],
    subject: `${TRACK_SUBMISSION_SUBJECT}: ${payload.name || fileName}`,
    body: buildTrackSubmissionBody(track),
    attachments: [fileUri],
  });
}
