import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import SelectorCard from '../../features/setups/components/SelectorCard';
import { getEntityId, getTrackDisplayName, getVehicleDisplayName } from '../../features/setups/lib/setupModel';
import { getTracks, getVehicles } from '../../features/setups/lib/setupStorage';
import { setupStyles } from '../../features/setups/styles/setupStyles';

export default function SetupSelectTrackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { vehicleId } = useLocalSearchParams();
  const [tracks, setTracks] = useState([]);
  const [vehicleName, setVehicleName] = useState('Selected Vehicle');

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      Promise.all([getTracks(), getVehicles()]).then(([trackItems, vehicleItems]) => {
        if (!mounted) return;
        setTracks(trackItems);
        const vehicle = vehicleItems.find((item) => getEntityId(item) === String(vehicleId));
        setVehicleName(getVehicleDisplayName(vehicle));
      });
      return () => {
        mounted = false;
      };
    }, [vehicleId])
  );

  const savedLabel = `${tracks.length} saved track${tracks.length === 1 ? '' : 's'}`;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={setupStyles.safe}>
      <View style={setupStyles.pageHeader}>
        <View style={setupStyles.headerRow}>
          <Pressable
            onPress={() => router.back()}
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
            <Text style={setupStyles.eyebrow}>SETUPS • STEP 2 OF 2</Text>
            <Text style={setupStyles.title}>Pick Track</Text>
          </View>

          <View style={setupStyles.headerSpacer} />
        </View>

        <Text style={setupStyles.subtitle}>{vehicleName} • choose the track this setup belongs to.</Text>

        <View style={setupStyles.countBadge}>
          <Text style={setupStyles.countBadgeText}>{savedLabel}</Text>
        </View>
      </View>

      <ScrollView style={setupStyles.scroll} contentContainerStyle={[setupStyles.scrollContent, { paddingBottom: Math.max(insets.bottom + 28, 52) }]} keyboardShouldPersistTaps="handled">
        {!tracks.length ? (
          <View style={setupStyles.card}>
            <Text style={setupStyles.emptyText}>No tracks found. Add a track first, then come back to Setups.</Text>
          </View>
        ) : (
          tracks.map((track) => {
            const trackId = getEntityId(track);
            const title = getTrackDisplayName(track);
            const subtitle = [track.location, track.surface, track.layout, track.runLine].filter(Boolean).join(' • ');

            return (
              <SelectorCard
                key={trackId || title}
                title={title}
                subtitle={subtitle || 'Track setup target'}
                meta="Track"
                onPress={() => router.push(`/setups/editor/${encodeURIComponent(trackId)}/${encodeURIComponent(String(vehicleId))}`)}
              />
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
