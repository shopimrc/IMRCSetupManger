import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RaceDayHeader from '../../features/raceday/components/RaceDayHeader';
import RaceDayBottomActions from '../../features/raceday/components/RaceDayBottomActions';
import { getActiveRaceDay, getVehicles, setRaceDayVehicles } from '../../features/raceday/lib/raceDayStorage';
import { getVehicleDisplayName, getVehicleTransponder, normalizeIdList } from '../../features/raceday/lib/raceDayModel';
import { raceDayStyles } from '../../features/raceday/styles/raceDayStyles';

export default function RaceDaySelectVehiclesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const adding = params?.add === '1';
  const [active, setActive] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);

  const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);

  const load = useCallback(async () => {
    setLoading(true);
    const [raceDay, nextVehicles] = await Promise.all([getActiveRaceDay(), getVehicles()]);
    setActive(raceDay);
    setVehicles(nextVehicles);
    setSelectedIds(normalizeIdList(raceDay?.vehicleIds || []));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function toggleVehicle(vehicleId) {
    const id = String(vehicleId);
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function handleContinue() {
    await setRaceDayVehicles(selectedIds);
    router.replace('/raceday/dashboard');
  }

  return (
    <View style={raceDayStyles.screen}>
      <View style={raceDayStyles.container}>
        <RaceDayHeader
          title="Vehicles"
          subtitle={adding ? 'Add more vehicles' : 'Select RaceDay vehicles'}
          onLeftPress={() => router.back()}
        />
        {loading ? (
          <View style={raceDayStyles.empty}><ActivityIndicator /></View>
        ) : (
          <ScrollView contentContainerStyle={[raceDayStyles.scrollContent, { paddingBottom: Math.max(insets.bottom + 28, 52) }]} showsVerticalScrollIndicator={false}>
            {!active?.trackId ? (
              <View style={raceDayStyles.empty}>
                <Text style={raceDayStyles.emptyText}>No active Race Day was found. Start by selecting a track.</Text>
              </View>
            ) : vehicles.length ? vehicles.map((vehicle) => {
              const id = vehicle.id || vehicle.vehicleId;
              const selected = selectedSet.has(String(id));
              return (
                <TouchableOpacity
                  key={String(id)}
                  style={[raceDayStyles.card, selected && raceDayStyles.selectedCard]}
                  onPress={() => toggleVehicle(id)}
                  activeOpacity={0.86}
                >
                  <View style={raceDayStyles.cardAccent} />
                  <View style={raceDayStyles.rowBetween}>
                    <View style={raceDayStyles.flex1}>
                      <Text style={raceDayStyles.cardTitle}>{getVehicleDisplayName(vehicle)}</Text>
                      <Text style={raceDayStyles.cardSub} numberOfLines={1}>
                        {[vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
                      </Text>
                      <Text style={raceDayStyles.cardSub} numberOfLines={1}>
                        {[vehicle.chassisStyle, getVehicleTransponder(vehicle) ? `TX ${getVehicleTransponder(vehicle)}` : null].filter(Boolean).join(' • ') || 'RaceDay vehicle'}
                      </Text>
                    </View>
                    <View style={selected ? [raceDayStyles.pill, raceDayStyles.selectedPill] : raceDayStyles.pill}>
                      <Text style={selected ? [raceDayStyles.pillText, raceDayStyles.selectedPillText] : raceDayStyles.pillText}>
                        {selected ? 'Selected' : 'Add'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }) : (
              <View style={raceDayStyles.empty}>
                <Text style={raceDayStyles.emptyText}>No vehicles are saved yet. Add a Vehicle first, then continue Race Day.</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
      <RaceDayBottomActions
        secondaryLabel="Back"
        onSecondaryPress={() => router.back()}
        primaryLabel={adding ? 'Save Vehicles' : 'Start RaceDay'}
        onPrimaryPress={handleContinue}
        primaryDisabled={!active?.trackId || selectedIds.length === 0}
      />
    </View>
  );
}
