// features/tools/lib/trackDataAdapter.js
// This adapter is intentionally loose because the Track section has had several storage versions.
// It tries common storage shapes and normalizes tracks for Track Near Me.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeTrack } from './trackDistance';

export const TOOL_TRACK_STORAGE_KEYS = [
  '@imrc_tracks_v1',
  '@tracks_v1',
  '@savedTracks_v1',
  '@trackList_v1',
  '@importedTracks_v1',
  'tracks',
];

function flattenPossibleTrackPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.tracks)) return payload.tracks;
  if (Array.isArray(payload.savedTracks)) return payload.savedTracks;
  if (Array.isArray(payload.importedTracks)) return payload.importedTracks;
  if (Array.isArray(payload.items)) return payload.items;
  if (typeof payload === 'object') {
    return Object.values(payload).flatMap((value) => flattenPossibleTrackPayload(value));
  }
  return [];
}

export async function loadTracksFromKnownStorageKeys(extraTracks = []) {
  const all = [...(Array.isArray(extraTracks) ? extraTracks : [])];

  for (const key of TOOL_TRACK_STORAGE_KEYS) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      all.push(...flattenPossibleTrackPayload(parsed));
    } catch (error) {
      // Ignore old/bad storage keys. We do not want Tools to break the app.
    }
  }

  const map = new Map();
  for (const item of all) {
    const track = normalizeTrack(item);
    const dedupeKey = String(track.id || `${track.name}-${track.city}-${track.state}-${track.zip}`).toLowerCase();
    if (!map.has(dedupeKey)) map.set(dedupeKey, track);
  }

  return Array.from(map.values()).filter((track) => track.name && track.name !== 'Unnamed Track');
}
