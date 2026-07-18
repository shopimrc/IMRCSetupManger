// features/tools/TrackNearMeScreen.js
// IMRC Track Database Near Me tool.
// Native-map-free version: card opens phone maps, LiveRC button stays inside card.

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ToolButton,
  ToolCard,
  ToolScaffold,
  goBack,
  TOOL_GREEN,
  TOOL_LINE,
  TOOL_MUTED,
  TOOL_TEXT,
} from './ToolShared';
import { STATIC_TRACKS } from './lib/trackSource';
import { loadTracksFromKnownStorageKeys } from './lib/trackDataAdapter';
import { loadTracksFromGithub } from './lib/trackGithubSource';
import { distanceMiles, formatMiles } from './lib/trackDistance';

let cachedLocationModule = undefined;

const GEO_CACHE_KEY = '@toolsTrackGeoCache_v1';
const ZIP_PLACE_CACHE_KEY = '@toolsTrackZipPlaceCache_v1';
const MAX_GEOCODE_PER_LOAD = 45;

const DISTANCE_FILTERS = ['25 mi', '50 mi', '100 mi', '250 mi', '500 mi'];
const DEFAULT_SURFACE_FILTERS = ['Carpet', 'Clay', 'Dirt', 'Asphalt', 'Concrete', 'Turf'];
const DEFAULT_STYLE_FILTERS = ['Oval', 'On-Road', 'Off-Road', 'Dirt Oval', 'Drag', 'Crawler'];

function getOptionalLocationModule() {
  if (cachedLocationModule !== undefined) return cachedLocationModule;
  try {
    // eslint-disable-next-line global-require
    cachedLocationModule = require('expo-location');
  } catch (error) {
    cachedLocationModule = null;
  }
  return cachedLocationModule;
}

function safeText(value) {
  return String(value || '').trim();
}

function fieldText(...values) {
  return values.map(safeText).filter(Boolean).join(' • ');
}

function cleanZip(value) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 5);
}

function placeLine(item) {
  const city = safeText(item?.city);
  const state = safeText(item?.state || item?.region);
  const zip = safeText(item?.zip || item?.postalCode);
  const cityState = [city, state].filter(Boolean).join(', ');
  return [cityState, zip].filter(Boolean).join(' ');
}

function parseCityStateZip(value) {
  const text = safeText(value)
    .replace(/\bUSA\b/gi, '')
    .replace(/\bUnited States\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;

  const matches = Array.from(text.matchAll(/(?:^|,)\s*([^,]+?)\s*,?\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?/gi));
  const match = matches[matches.length - 1];
  if (!match) return null;

  return {
    city: safeText(match[1]),
    state: safeText(match[2]).toUpperCase(),
    zip: safeText(match[3]),
  };
}

function displayLocationLine(track) {
  const direct = placeLine(track);

  // If we only have ZIP, try to pull City/State/ZIP from a full address field.
  if (direct && !/^\d{5}$/.test(direct)) return direct;

  const parsed = parseCityStateZip(
    track?.address
    || track?.streetAddress
    || track?.fullAddress
    || track?.street
    || ''
  );

  if (parsed) return placeLine(parsed);
  return direct || safeText(track?.address) || 'Address missing';
}

function currentLocationLine(place) {
  if (!place) return '';
  const line = placeLine(place);
  if (line) return line;
  if (Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) {
    return `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`;
  }
  return '';
}

function normalizeReverseGeocode(item = {}, coords = null) {
  const city = item.city || item.subregion || item.district || item.name || '';
  const state = item.region || item.isoCountryCode || '';
  const zip = item.postalCode || '';
  return {
    city,
    state,
    zip,
    latitude: coords?.latitude,
    longitude: coords?.longitude,
  };
}

function normalizeFilterValue(value) {
  return String(value || '').trim();
}

function splitFilterValues(value) {
  if (Array.isArray(value)) return value.flatMap(splitFilterValues);
  return String(value || '')
    .split(/[|,/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function trackSurfaceValues(track) {
  return splitFilterValues(track.surface || track.trackSurface || track.surfaces || track.trackSurfaces);
}

function trackStyleValues(track) {
  return splitFilterValues(
    track.racingStyle
    || track.raceStyle
    || track.trackType
    || track.type
    || track.style
    || track.layoutType
    || track.category
  );
}

function trackDetailsLine(track) {
  return fieldText(
    trackSurfaceValues(track).slice(0, 2).join(', '),
    trackStyleValues(track).slice(0, 2).join(', ')
  ) || 'Surface / style not listed';
}

function uniqueSorted(values) {
  return Array.from(new Set(values.map(normalizeFilterValue).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
}

function trackMatchesFilter(track, filter, getter) {
  if (!filter || filter === 'All') return true;
  return getter(track).some((value) => value.toLowerCase() === filter.toLowerCase());
}

function distanceFilterMiles(filter) {
  if (!filter || filter === 'All') return null;
  const n = Number(String(filter).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function dedupeResultTracks(items) {
  const map = new Map();

  for (const track of items) {
    const key = [
      track.name,
      track.city,
      track.state,
      track.zip,
      trackSurfaceValues(track).join('|'),
      trackStyleValues(track).join('|'),
    ].map((part) => String(part || '').trim().toLowerCase()).join('::');

    if (!map.has(key)) map.set(key, track);
  }

  return Array.from(map.values());
}

function mapUrlForTrack(track) {
  const query = encodeURIComponent(track.address || `${track.name} ${track.city} ${track.state} ${track.zip}`);
  if (Platform.OS === 'ios') return `http://maps.apple.com/?q=${query}`;
  return `geo:0,0?q=${query}`;
}

function livercUrl(track) {
  return track.liverc || track.liveRcUrl || track.livercUrl || track.liveRC || track.liveRc || '';
}

function coordKey(track) {
  return String(track.address || `${track.name}-${track.city}-${track.state}-${track.zip}`).trim().toLowerCase();
}

async function readGeoCache() {
  try {
    const raw = await AsyncStorage.getItem(GEO_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

async function writeGeoCache(cache) {
  try {
    await AsyncStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    // Cache failure should not break this tool.
  }
}

async function readZipPlaceCache() {
  try {
    const raw = await AsyncStorage.getItem(ZIP_PLACE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

async function writeZipPlaceCache(cache) {
  try {
    await AsyncStorage.setItem(ZIP_PLACE_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    // Cache failure should not break this tool.
  }
}

function needsCityState(track) {
  return !!cleanZip(track?.zip || track?.postalCode) && (!safeText(track?.city) || !safeText(track?.state || track?.region));
}

async function hydrateTrackCityStateFromZip(track, zipPlaceCache = null) {
  const zip = cleanZip(track?.zip || track?.postalCode);
  if (!zip || !needsCityState(track)) return track;

  const cache = zipPlaceCache || await readZipPlaceCache();
  let place = cache[zip];

  if (!place) {
    place = await lookupZipWithPublicApi(zip);
    if (place) {
      cache[zip] = place;
      await writeZipPlaceCache(cache);
    }
  }

  if (!place) return track;

  return {
    ...track,
    city: safeText(track.city) || place.city,
    state: safeText(track.state || track.region) || place.state,
    zip: safeText(track.zip || track.postalCode) || place.zip,
  };
}

async function hydrateTracksCityStateFromZip(tracks, onProgress) {
  const cache = await readZipPlaceCache();
  const output = [];
  let changed = false;

  for (const track of tracks) {
    if (needsCityState(track)) {
      onProgress?.(`Adding city/state for ${cleanZip(track.zip || track.postalCode)}`);
      const beforeCount = Object.keys(cache).length;
      const hydrated = await hydrateTrackCityStateFromZip(track, cache);
      if (Object.keys(cache).length !== beforeCount) changed = true;
      output.push(hydrated);
    } else {
      output.push(track);
    }
  }

  if (changed) await writeZipPlaceCache(cache);
  return output;
}

async function lookupZipWithPublicApi(zip) {
  const safeZip = cleanZip(zip);
  if (safeZip.length !== 5) return null;

  try {
    const response = await fetch(`https://api.zippopotam.us/us/${safeZip}`);
    if (!response.ok) return null;

    const payload = await response.json();
    const place = payload?.places?.[0];
    const latitude = Number(place?.latitude);
    const longitude = Number(place?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return {
      latitude,
      longitude,
      city: place?.['place name'] || '',
      state: place?.['state abbreviation'] || place?.state || '',
      zip: safeZip,
    };
  } catch (error) {
    return null;
  }
}

async function geocodeZip(zip) {
  const safeZip = cleanZip(zip);
  if (safeZip.length !== 5) return null;

  const Location = getOptionalLocationModule();

  if (Location?.geocodeAsync) {
    try {
      const found = await Location.geocodeAsync(`${safeZip}, USA`);
      if (found?.[0]) {
        const coords = {
          latitude: found[0].latitude,
          longitude: found[0].longitude,
        };

        if (Location.reverseGeocodeAsync) {
          try {
            const reverse = await Location.reverseGeocodeAsync(coords);
            const place = normalizeReverseGeocode(reverse?.[0], coords);
            return { ...place, zip: place.zip || safeZip };
          } catch (error) {
            return { ...coords, zip: safeZip };
          }
        }

        return { ...coords, zip: safeZip };
      }
    } catch (error) {
      // Fall back to public ZIP lookup below.
    }
  }

  return lookupZipWithPublicApi(safeZip);
}

async function geocodeTracks(tracks, onProgress) {
  const Location = getOptionalLocationModule();
  const cache = await readGeoCache();
  const nextCache = { ...cache };
  let geocodeCount = 0;
  const output = [];

  for (const track of tracks) {
    if (Number.isFinite(track.latitude) && Number.isFinite(track.longitude)) {
      output.push(await hydrateTrackCityStateFromZip(track));
      continue;
    }

    const key = coordKey(track);
    if (Number.isFinite(nextCache[key]?.latitude) && Number.isFinite(nextCache[key]?.longitude)) {
      const withCachedCoords = { ...track, latitude: nextCache[key].latitude, longitude: nextCache[key].longitude };
      output.push(await hydrateTrackCityStateFromZip(withCachedCoords));
      continue;
    }

    if ((!track.address && !track.zip) || geocodeCount >= MAX_GEOCODE_PER_LOAD) {
      output.push(track);
      continue;
    }

    try {
      geocodeCount += 1;
      onProgress?.(`Checking track addresses ${geocodeCount}/${Math.min(MAX_GEOCODE_PER_LOAD, tracks.length)}`);

      let coords = null;

      if (Location?.geocodeAsync && track.address) {
        try {
          const found = await Location.geocodeAsync(track.address);
          if (found?.[0]) {
            coords = { latitude: found[0].latitude, longitude: found[0].longitude };
          }
        } catch (error) {
          coords = null;
        }
      }

      let placePatch = null;

      if (track.zip && needsCityState(track)) {
        placePatch = await hydrateTrackCityStateFromZip(track);
      }

      if (!coords && track.zip) {
        const zipPlace = await geocodeZip(track.zip);
        if (zipPlace) {
          coords = { latitude: zipPlace.latitude, longitude: zipPlace.longitude };
          placePatch = {
            ...(placePatch || track),
            city: safeText((placePatch || track).city) || zipPlace.city,
            state: safeText((placePatch || track).state) || zipPlace.state,
            zip: safeText((placePatch || track).zip) || zipPlace.zip,
          };
        }
      }

      if (coords) {
        nextCache[key] = coords;
        output.push({ ...(placePatch || track), ...coords });
      } else {
        output.push(placePatch || track);
      }
    } catch (error) {
      output.push(track);
    }
  }

  await writeGeoCache(nextCache);
  return output;
}

function DropdownFilter({ title, value, onPress }) {
  const shown = value && value !== 'All' ? value : 'All';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.dropdownFilter, pressed && styles.pressed]}>
      <View style={styles.dropdownTextWrap}>
        <Text style={styles.dropdownLabel}>{title}</Text>
        <Text style={styles.dropdownValue} numberOfLines={1}>{shown}</Text>
      </View>
      <Text style={styles.dropdownChevron}>▾</Text>
    </Pressable>
  );
}

function FilterOption({ label, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.filterOption, selected && styles.filterOptionSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.filterOptionText, selected && styles.filterOptionTextSelected]}>{label}</Text>
      {selected && <Text style={styles.filterOptionCheck}>✓</Text>}
    </Pressable>
  );
}

function LiveRcButton({ url }) {
  if (!url) return null;

  return (
    <Pressable
      onPress={(event) => {
        event?.stopPropagation?.();
        Linking.openURL(url);
      }}
      style={({ pressed }) => [styles.liveButton, pressed && styles.pressed]}
    >
      <Text style={styles.liveButtonText}>LiveRC</Text>
    </Pressable>
  );
}

export default function TrackNearMeScreen(props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Pick filters, then search the IMRC Track Database.');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [currentPlace, setCurrentPlace] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [surfaceFilter, setSurfaceFilter] = useState('All');
  const [styleFilter, setStyleFilter] = useState('All');
  const [distanceFilter, setDistanceFilter] = useState('All');
  const [searched, setSearched] = useState(false);
  const [zipPromptVisible, setZipPromptVisible] = useState(false);
  const [manualZip, setManualZip] = useState('');
  const [zipBusy, setZipBusy] = useState(false);
  const [zipError, setZipError] = useState('');
  const [activeFilter, setActiveFilter] = useState(null);

  const filterOptions = useMemo(() => {
    const surfaces = uniqueSorted([...DEFAULT_SURFACE_FILTERS, ...tracks.flatMap(trackSurfaceValues)]);
    const styles = uniqueSorted([...DEFAULT_STYLE_FILTERS, ...tracks.flatMap(trackStyleValues)]);
    return { surfaces, styles };
  }, [tracks]);

  const sortedTracks = useMemo(() => {
    const uniqueTracks = dedupeResultTracks(tracks);
    const withDistance = uniqueTracks.map((track) => ({
      ...track,
      distance: userLocation ? distanceMiles(userLocation, track) : null,
    }));

    return withDistance.sort((a, b) => {
      if (a.distance == null && b.distance == null) return a.name.localeCompare(b.name);
      if (a.distance == null) return 1;
      if (b.distance == null) return -1;
      return a.distance - b.distance;
    });
  }, [tracks, userLocation]);

  const filteredTracks = useMemo(() => {
    const maxMiles = distanceFilterMiles(distanceFilter);

    return sortedTracks.filter((track) => {
      const distanceOk = !maxMiles || (track.distance != null && track.distance <= maxMiles);
      return (
        distanceOk
        && trackMatchesFilter(track, surfaceFilter, trackSurfaceValues)
        && trackMatchesFilter(track, styleFilter, trackStyleValues)
      );
    });
  }, [sortedTracks, surfaceFilter, styleFilter, distanceFilter]);

  const resetFilters = () => {
    setSurfaceFilter('All');
    setStyleFilter('All');
    setDistanceFilter('All');
  };

  const searchTrackDatabase = useCallback(async ({ forcedCoords = null, forcedPlace = null, askForPhoneLocation = true } = {}) => {
    setLoading(true);
    setPermissionDenied(false);
    setSearched(true);
    setStatus('Searching IMRC Track Database...');

    try {
      const Location = getOptionalLocationModule();

      const githubTracks = await loadTracksFromGithub((message) => {
        if (message && String(message).toLowerCase().includes('cached')) {
          setStatus('Using cached IMRC Track Database...');
        } else {
          setStatus('Searching IMRC Track Database...');
        }
      });

      const databaseTracks = await loadTracksFromKnownStorageKeys([...STATIC_TRACKS, ...githubTracks]);

      if (!databaseTracks.length) {
        setTracks([]);
        setStatus('No tracks found in the IMRC Track Database.');
        return;
      }

      let coords = forcedCoords || userLocation || null;
      let shouldAskForZip = !coords;

      if (forcedPlace) {
        setCurrentPlace(forcedPlace);
      }

      if (!coords && askForPhoneLocation && Location?.requestForegroundPermissionsAsync) {
        try {
          setStatus('Requesting phone location...');
          const permission = await Location.requestForegroundPermissionsAsync();

          if (permission.status !== 'granted') {
            setPermissionDenied(true);
            setStatus('Current location unavailable. Please enter ZIP to sort nearby tracks.');
          } else {
            setStatus('Getting phone location...');
            let location = await Location.getLastKnownPositionAsync({ maxAge: 1000 * 60 * 30 });
            if (!location) {
              const accuracy = Location.Accuracy?.Balanced || 3;
              location = await Location.getCurrentPositionAsync({ accuracy });
            }

            coords = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            };

            setUserLocation(coords);
            shouldAskForZip = false;

            if (Location.reverseGeocodeAsync) {
              try {
                setStatus('Finding your city/state...');
                const reverse = await Location.reverseGeocodeAsync(coords);
                setCurrentPlace(normalizeReverseGeocode(reverse?.[0], coords));
              } catch (error) {
                setCurrentPlace({ ...coords });
              }
            } else {
              setCurrentPlace({ ...coords });
            }
          }
        } catch (error) {
          setPermissionDenied(true);
          setUserLocation(null);
          shouldAskForZip = true;
          setStatus('Current location unavailable. Please enter ZIP to sort nearby tracks.');
        }
      }

      if (coords) {
        setUserLocation(coords);
      }

      setStatus('Adding city/state from ZIP...');
      const withCityState = await hydrateTracksCityStateFromZip(databaseTracks, () => setStatus('Adding city/state from ZIP...'));

      setStatus('Checking track addresses...');
      const withCoords = await geocodeTracks(withCityState, () => setStatus('Checking track addresses...'));
      setTracks(withCoords);

      const uniqueCount = dedupeResultTracks(withCoords).length;
      const withKnownDistance = coords
        ? withCoords.filter((track) => distanceMiles(coords, track) != null).length
        : 0;

      if (coords) {
        setStatus(`${uniqueCount} tracks loaded. ${withKnownDistance} have distance data.`);
      } else {
        setZipPromptVisible(shouldAskForZip);
        setStatus(`${uniqueCount} tracks loaded. Current location unavailable — enter ZIP to sort by distance.`);
      }
    } catch (error) {
      setStatus(`Unable to search IMRC Track Database: ${error?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [userLocation]);

  const findTracksNearMe = useCallback(() => {
    searchTrackDatabase({ askForPhoneLocation: true });
  }, [searchTrackDatabase]);

  const applyZipLocation = useCallback(async () => {
    const zip = cleanZip(manualZip);
    if (zip.length !== 5) {
      setZipError('Enter a 5 digit ZIP code.');
      return;
    }

    setZipBusy(true);
    setZipError('');

    try {
      setStatus(`Finding ZIP ${zip}...`);
      const place = await geocodeZip(zip);

      if (!place) {
        setZipError('Could not find that ZIP code.');
        return;
      }

      const coords = {
        latitude: place.latitude,
        longitude: place.longitude,
      };

      setUserLocation(coords);
      setCurrentPlace(place);
      setPermissionDenied(false);
      setZipPromptVisible(false);
      setStatus(`Using ${currentLocationLine(place) || zip} to search nearby tracks.`);

      await searchTrackDatabase({
        forcedCoords: coords,
        forcedPlace: place,
        askForPhoneLocation: false,
      });
    } catch (error) {
      setZipError(`ZIP lookup failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setZipBusy(false);
    }
  }, [manualZip, searchTrackDatabase]);

  const activeFilterTitle =
    activeFilter === 'distance'
      ? 'Distance'
      : activeFilter === 'surface'
        ? 'Surface'
        : activeFilter === 'style'
          ? 'Racing Style'
          : '';

  const activeFilterValue =
    activeFilter === 'distance'
      ? distanceFilter
      : activeFilter === 'surface'
        ? surfaceFilter
        : activeFilter === 'style'
          ? styleFilter
          : 'All';

  const activeFilterOptions =
    activeFilter === 'distance'
      ? DISTANCE_FILTERS
      : activeFilter === 'surface'
        ? filterOptions.surfaces
        : activeFilter === 'style'
          ? filterOptions.styles
          : [];

  const selectFilterValue = (value) => {
    if (activeFilter === 'distance') setDistanceFilter(value);
    if (activeFilter === 'surface') setSurfaceFilter(value);
    if (activeFilter === 'style') setStyleFilter(value);
    setActiveFilter(null);
  };

  const resultCountText = searched
    ? `${filteredTracks.length}/${dedupeResultTracks(tracks).length} shown`
    : 'filters ready';

  return (
    <ToolScaffold
      title="Tracks Near Me"
      onBack={() => goBack(props)}
      right={<Text style={styles.count}>{resultCountText}</Text>}
    >
      <ToolCard compact style={styles.searchCard}>
        <Text style={styles.help}>Pick filters, then search the IMRC Track Database.</Text>

        <View style={styles.searchButtons}>
          <ToolButton
            label={loading ? 'Searching...' : 'Find Tracks Near Me'}
            onPress={findTracksNearMe}
            disabled={loading}
            style={styles.findButton}
          />
          <ToolButton
            label="Enter ZIP"
            secondary
            onPress={() => {
              setZipError('');
              setZipPromptVisible(true);
            }}
            disabled={loading}
            style={styles.zipButton}
          />
        </View>

        <Text style={[styles.status, permissionDenied && styles.warning]}>{status}</Text>

        {!!currentLocationLine(currentPlace) && (
          <View style={styles.currentLocationBox}>
            <Text style={styles.currentLocationLabel}>Search Center</Text>
            <Text style={styles.currentLocationText}>{currentLocationLine(currentPlace)}</Text>
          </View>
        )}
      </ToolCard>

      <ToolCard compact style={styles.filterCard}>
        <View style={styles.filterHeader}>
          <Text style={styles.filterHeaderTitle}>Filters</Text>
          <Pressable onPress={resetFilters} style={({ pressed }) => [styles.resetFilters, pressed && styles.pressed]}>
            <Text style={styles.resetFiltersText}>Reset</Text>
          </Pressable>
        </View>

        <View style={styles.dropdownGrid}>
          <DropdownFilter title="Distance" value={distanceFilter} onPress={() => setActiveFilter('distance')} />
          <DropdownFilter title="Surface" value={surfaceFilter} onPress={() => setActiveFilter('surface')} />
          <DropdownFilter title="Style" value={styleFilter} onPress={() => setActiveFilter('style')} />
        </View>
      </ToolCard>

      {!searched && (
        <ToolCard compact style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Ready to search.</Text>
          <Text style={styles.emptyText}>Tap a card after searching to open maps. LiveRC appears when available.</Text>
        </ToolCard>
      )}

      {!!searched && !filteredTracks.length && !loading && (
        <ToolCard compact style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No tracks matched.</Text>
          <Text style={styles.emptyText}>Try Reset, expand the distance filter, or enter a ZIP code if GPS is unavailable.</Text>
        </ToolCard>
      )}

      {filteredTracks.slice(0, 50).map((track, index) => {
        const live = livercUrl(track);
        const location = displayLocationLine(track);
        const miles = formatMiles(track.distance);
        const details = trackDetailsLine(track);

        return (
          <Pressable
            key={`${track.id}-${index}`}
            onPress={() => Linking.openURL(mapUrlForTrack(track))}
            style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}
          >
            <ToolCard compact style={styles.trackCard}>
              <View style={styles.trackAccent} />

              <View style={styles.trackTopRow}>
                <View style={styles.trackMain}>
                  <Text style={styles.trackName} numberOfLines={1}>{track.name}</Text>
                  <Text style={styles.trackLocation} numberOfLines={1}>{location}</Text>
                  <Text style={styles.trackDetails} numberOfLines={1}>{details}</Text>
                </View>

                <View style={styles.trackRightCol}>
                  <View style={styles.distanceBox}>
                    <Text style={styles.distance}>{miles}</Text>
                  </View>
                  <LiveRcButton url={live} />
                </View>
              </View>
            </ToolCard>
          </Pressable>
        );
      })}

      <Modal
        visible={!!activeFilter}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveFilter(null)}
      >
        <View
          style={[
            styles.modalOverlay,
            {
              paddingTop: Math.max(insets.top + 20, 24),
              paddingBottom: Math.max(insets.bottom + 20, 24),
            },
          ]}
        >
          <View style={[styles.filterModal, { maxHeight: Math.max(240, windowHeight - insets.top - insets.bottom - 40) }]}>
            <Text style={styles.filterModalTitle}>{activeFilterTitle}</Text>

            <View style={styles.filterOptionList}>
              <FilterOption
                label="All"
                selected={!activeFilterValue || activeFilterValue === 'All'}
                onPress={() => selectFilterValue('All')}
              />
              {activeFilterOptions.map((option) => (
                <FilterOption
                  key={option}
                  label={option}
                  selected={activeFilterValue === option}
                  onPress={() => selectFilterValue(option)}
                />
              ))}
            </View>

            <ToolButton
              label="Cancel"
              secondary
              onPress={() => setActiveFilter(null)}
              style={styles.filterCancelButton}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={zipPromptVisible} transparent animationType="fade" onRequestClose={() => setZipPromptVisible(false)}>
        <View
          style={[
            styles.modalOverlay,
            {
              paddingTop: Math.max(insets.top + 20, 24),
              paddingBottom: Math.max(insets.bottom + 20, 24),
            },
          ]}
        >
          <View style={[styles.zipModal, { maxHeight: Math.max(240, windowHeight - insets.top - insets.bottom - 40) }]}>
            <Text style={styles.zipModalTitle}>Location Unavailable</Text>
            <Text style={styles.zipModalText}>
              Please enter a ZIP code so Tracks Near Me can search the IMRC Track Database by distance.
            </Text>

            <View style={styles.zipInputRow}>
              <TextInput
                value={manualZip}
                onChangeText={(value) => {
                  setManualZip(cleanZip(value));
                  setZipError('');
                }}
                keyboardType="number-pad"
                maxLength={5}
                placeholder="ZIP code"
                placeholderTextColor="rgba(243,255,247,0.32)"
                style={styles.zipInput}
              />
            </View>

            {!!zipError && <Text style={styles.zipError}>{zipError}</Text>}

            <View style={styles.modalButtons}>
              <ToolButton label="Cancel" secondary onPress={() => setZipPromptVisible(false)} disabled={zipBusy} style={styles.modalButton} />
              <ToolButton label={zipBusy ? 'Searching...' : 'Use ZIP + Search'} onPress={applyZipLocation} disabled={zipBusy || loading} style={styles.modalButton} />
            </View>
          </View>
        </View>
      </Modal>

      {loading && (
        <View style={[styles.loadingOverlay, { bottom: Math.max(insets.bottom + 18, 18) }]}>
          <ActivityIndicator />
        </View>
      )}
    </ToolScaffold>
  );
}

const styles = StyleSheet.create({
  count: { color: TOOL_GREEN, fontWeight: '900', fontSize: 12, textAlign: 'right' },
  searchCard: { gap: 6, paddingVertical: 10 },
  help: { color: TOOL_MUTED, fontWeight: '700', lineHeight: 16, fontSize: 12 },
  searchButtons: { flexDirection: 'row', gap: 7 },
  findButton: { flex: 1.55, minHeight: 38 },
  zipButton: { flex: 1, minHeight: 38 },
  status: { color: TOOL_MUTED, fontWeight: '800', lineHeight: 15, fontSize: 11 },
  warning: { color: '#ffd46b' },

  currentLocationBox: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(57,255,136,0.08)',
    borderWidth: 1,
    borderColor: TOOL_LINE,
  },
  currentLocationLabel: { color: TOOL_MUTED, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  currentLocationText: { color: TOOL_GREEN, fontSize: 13, fontWeight: '900', marginTop: 1 },

  filterCard: { gap: 7, paddingVertical: 10 },
  filterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterHeaderTitle: { color: TOOL_TEXT, fontSize: 14, fontWeight: '900' },
  resetFilters: {
    minHeight: 24,
    paddingHorizontal: 9,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(57,255,136,0.09)',
    borderWidth: 1,
    borderColor: TOOL_LINE,
  },
  resetFiltersText: { color: TOOL_GREEN, fontWeight: '900', fontSize: 11 },
  dropdownGrid: { flexDirection: 'row', gap: 7 },
  dropdownFilter: {
    flex: 1,
    minHeight: 43,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  dropdownTextWrap: { flex: 1 },
  dropdownLabel: { color: TOOL_MUTED, fontSize: 8, lineHeight: 10, fontWeight: '900', textTransform: 'uppercase' },
  dropdownValue: { color: TOOL_TEXT, fontSize: 12, lineHeight: 15, fontWeight: '900', marginTop: 2 },
  dropdownChevron: { color: TOOL_GREEN, fontSize: 14, fontWeight: '900', marginLeft: 4 },

  emptyCard: { gap: 4 },
  emptyTitle: { color: TOOL_TEXT, fontSize: 15, fontWeight: '900' },
  emptyText: { color: TOOL_MUTED, fontSize: 12, fontWeight: '700', lineHeight: 17 },

  cardPressable: { borderRadius: 15 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  trackCard: {
    position: 'relative',
    overflow: 'hidden',
    gap: 0,
    paddingLeft: 11,
    paddingRight: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(17,25,22,0.96)',
  },
  trackAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: TOOL_GREEN, opacity: 0.92 },
  trackTopRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  trackMain: { flex: 1, minWidth: 0 },
  trackName: { color: TOOL_TEXT, fontSize: 14, lineHeight: 16, fontWeight: '900' },
  trackLocation: { color: TOOL_MUTED, fontWeight: '800', fontSize: 11, lineHeight: 12, marginTop: 0 },
  trackRightCol: { width: 74, alignItems: 'center', justifyContent: 'center', gap: 4 },
  trackDetails: { color: TOOL_GREEN, fontSize: 11, lineHeight: 12, fontWeight: '900', marginTop: 3 },
  distanceBox: {
    minWidth: 66,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignItems: 'center',
    backgroundColor: 'rgba(57,255,136,0.10)',
    borderWidth: 1,
    borderColor: TOOL_LINE,
  },
  distance: { color: TOOL_GREEN, fontWeight: '900', fontSize: 12, lineHeight: 14 },
  liveButton: {
    minHeight: 27,
    minWidth: 70,
    borderRadius: 10,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(57,255,136,0.12)',
    borderWidth: 1,
    borderColor: TOOL_LINE,
  },
  liveButtonText: { color: TOOL_GREEN, fontSize: 12, fontWeight: '900' },

  loadingOverlay: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  filterModal: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '78%',
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#101915',
    borderWidth: 1,
    borderColor: TOOL_LINE,
  },
  filterModalTitle: { color: TOOL_TEXT, fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  filterOptionList: { gap: 6 },
  filterOption: {
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  filterOptionSelected: { backgroundColor: 'rgba(57,255,136,0.14)', borderColor: TOOL_LINE },
  filterOptionText: { color: TOOL_TEXT, fontSize: 14, fontWeight: '900' },
  filterOptionTextSelected: { color: TOOL_GREEN },
  filterOptionCheck: { color: TOOL_GREEN, fontSize: 16, fontWeight: '900' },
  filterCancelButton: { minHeight: 40, marginTop: 12 },

  zipModal: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#101915',
    borderWidth: 1,
    borderColor: TOOL_LINE,
  },
  zipModalTitle: { color: TOOL_TEXT, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  zipModalText: { color: TOOL_MUTED, fontSize: 13, fontWeight: '700', lineHeight: 18, textAlign: 'center', marginTop: 8 },
  zipInputRow: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TOOL_LINE,
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  zipInput: { minHeight: 48, paddingHorizontal: 14, color: TOOL_TEXT, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  zipError: { color: '#ff7878', fontSize: 12, fontWeight: '800', lineHeight: 16, textAlign: 'center', marginTop: 8 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalButton: { flex: 1, minHeight: 42 },
});
