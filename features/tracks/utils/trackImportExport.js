// features/tracks/utils/trackImportExport.js

import { normalizeTrack, validateTrack } from '../storage/trackStorage';

export const TRACK_IMPORT_VERSION = 1;

export function buildTrackExportPayload(track) {
  return {
    schemaVersion: TRACK_IMPORT_VERSION,
    name: track.trackName || track.name || '',
    trackType: track.trackType || '',
    liveRcUrl: track.liveRcUrl || '',
    streetAddress: track.address || track.streetAddress || '',
    cityState: track.cityState || [track.city, track.state].filter(Boolean).join(', '),
    zip: track.zipCode || track.zip || '',
    phone: track.phone || '',
    direction: track.direction || '',
    surface: track.surface || '',
    tractionLevel: track.tractionLevel || '',
    runLine: track.runLine || '',
    trackDimensions: track.trackDimensions || '',
    notes: track.notes || '',
  };
}

export function stringifyTrackExport(track) {
  return JSON.stringify(buildTrackExportPayload(normalizeTrack(track)), null, 2);
}

export function parseTrackImportText(text = '') {
  const cleanText = String(text || '').trim();

  if (!cleanText) {
    const error = new Error('Nothing was pasted.');
    error.userMessage = 'Paste track import data first.';
    throw error;
  }

  let parsed;

  try {
    parsed = JSON.parse(cleanText);
  } catch (error) {
    const importError = new Error('Invalid JSON.');
    importError.userMessage = 'Import data is not valid JSON.';
    throw importError;
  }

  const rawTrack = parsed.track || parsed;
  const normalized = normalizeTrack(rawTrack);
  const result = validateTrack(normalized);

  if (!result.isValid) {
    const error = new Error('Track import validation failed.');
    error.userMessage = 'Imported track must include Track Name and Track Type.';
    error.validationErrors = result.errors;
    throw error;
  }

  return normalized;
}

export async function fetchTrackImportFromUrl(url) {
  const cleanUrl = String(url || '').trim();

  if (!cleanUrl) {
    const error = new Error('Missing import URL.');
    error.userMessage = 'Enter a GitHub raw JSON URL first.';
    throw error;
  }

  const response = await fetch(cleanUrl);

  if (!response.ok) {
    const error = new Error(`Import URL failed with status ${response.status}.`);
    error.userMessage = 'Could not download the track import file.';
    throw error;
  }

  const text = await response.text();
  return parseTrackImportText(text);
}

export function buildExampleTrackImport() {
  return JSON.stringify(
    {
      schemaVersion: 1,
      name: 'Phoenix RC Racing Club',
      trackType: 'Oval',
      liveRcUrl: 'https://thestable.liverc.com/',
      streetAddress: '112 Main Street',
      cityState: 'East Randolph, NY',
      zip: '14730',
      phone: '',
      direction: 'Counter-Clockwise',
      surface: 'CRC Gray',
      tractionLevel: 'Medium',
      runLine: '103',
      trackDimensions: "24' x 60'",
      notes: 'Called `The Paperclib`',
    },
    null,
    2
  );
}
