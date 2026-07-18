// features/tracks/utils/trackRemoteImport.js

import { GITHUB_TRACKS_API_URL } from '../constants/trackImportSources';
import { parseTrackImportText } from './trackImportExport';

function clean(value) {
  return String(value || '').trim();
}

export function normalizeImportSurface(surface = '') {
  const value = clean(surface);
  const lower = value.toLowerCase();

  if (!value) return '';

  // CRC carpet is a carpet brand/style. Display as Carpet for users.
  if (lower.includes('crc')) return 'Carpet';

  if (lower.includes('carpet')) return 'Carpet';
  if (lower.includes('asphalt')) return 'Asphalt';
  if (lower.includes('concrete')) return 'Concrete';
  if (lower.includes('dirt')) return 'Dirt';
  if (lower.includes('clay')) return 'Clay';
  if (lower.includes('turf')) return 'Turf';

  return value;
}

export function normalizeImportTrackStyle(trackType = '') {
  const value = clean(trackType);
  const lower = value.toLowerCase();

  if (!value) return '';

  if (lower.includes('oval')) return 'Oval';
  if (lower.includes('on-road') || lower.includes('on road')) return 'On-Road';
  if (lower.includes('off-road') || lower.includes('off road')) return 'Off-Road';
  if (lower.includes('drag')) return 'Drag';

  return value;
}

function makeSearchText(track = {}, fileName = '') {
  return [
    fileName,
    track.trackName,
    track.name,
    track.trackType,
    normalizeImportTrackStyle(track.trackType),
    track.surface,
    normalizeImportSurface(track.surface),
    track.city,
    track.state,
    track.cityState,
    track.zipCode,
    track.zip,
    track.direction,
    track.tractionLevel,
    track.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function filterRemoteTracks(remoteTracks = [], query = '', filters = {}) {
  const cleanQuery = clean(query).toLowerCase();
  const styleFilter = clean(filters.style);
  const surfaceFilter = clean(filters.surface);

  return remoteTracks.filter(item => {
    const track = item.track || {};
    const style = normalizeImportTrackStyle(track.trackType);
    const surface = normalizeImportSurface(track.surface);

    const matchesQuery = !cleanQuery || item.searchText.includes(cleanQuery);
    const matchesStyle = !styleFilter || style === styleFilter;
    const matchesSurface = !surfaceFilter || surface === surfaceFilter;

    return matchesQuery && matchesStyle && matchesSurface;
  });
}

export function getAvailableImportFilters(remoteTracks = []) {
  const styles = new Set();
  const surfaces = new Set();

  remoteTracks.forEach(item => {
    const track = item.track || {};
    const style = normalizeImportTrackStyle(track.trackType);
    const surface = normalizeImportSurface(track.surface);

    if (style) styles.add(style);
    if (surface) surfaces.add(surface);
  });

  return {
    styles: Array.from(styles).sort((a, b) => a.localeCompare(b)),
    surfaces: Array.from(surfaces).sort((a, b) => a.localeCompare(b)),
  };
}

export async function fetchRemoteTrackList() {
  const response = await fetch(GITHUB_TRACKS_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    const error = new Error(`GitHub track list failed with status ${response.status}.`);
    error.userMessage = 'Could not load the online track list from GitHub.';
    throw error;
  }

  const folderItems = await response.json();

  if (!Array.isArray(folderItems)) {
    const error = new Error('GitHub response was not a folder list.');
    error.userMessage = 'The GitHub track folder did not return a valid list.';
    throw error;
  }

  const jsonFiles = folderItems
    .filter(item => item?.type === 'file')
    .filter(item => String(item?.name || '').toLowerCase().endsWith('.json'))
    .filter(item => item?.download_url);

  const loadedTracks = await Promise.all(
    jsonFiles.map(async item => {
      try {
        const fileResponse = await fetch(item.download_url);

        if (!fileResponse.ok) {
          return null;
        }

        const text = await fileResponse.text();
        const track = parseTrackImportText(text);

        return {
          id: item.sha || item.name,
          fileName: item.name,
          downloadUrl: item.download_url,
          htmlUrl: item.html_url,
          track,
          searchText: makeSearchText(track, item.name),
        };
      } catch (error) {
        console.warn('Failed to load remote track file:', item.name, error);
        return null;
      }
    })
  );

  return loadedTracks
    .filter(Boolean)
    .sort((a, b) =>
      String(a.track.trackName || '').localeCompare(String(b.track.trackName || ''))
    );
}
