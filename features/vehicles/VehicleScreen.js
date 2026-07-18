import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import EmptyVehiclesState from "./components/EmptyVehiclesState";
import VehicleCard from "./components/VehicleCard";
import VehicleForm from "./components/VehicleForm";
import {
  deleteVehicle,
  getVehicles,
  upsertVehicle,
} from "./logic/vehicleStorage";
import { VEHICLE_COLORS } from "./constants/vehicleColors";
import { vehicleStyles as styles } from "./styles/vehicleStyles";
import { vehicleScreenModernStyles as modernStyles } from "./styles/vehicleScreenModernStyles";

export default function VehicleScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [formVisible, setFormVisible] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);

  const loadVehicles = useCallback(async () => {
    const savedVehicles = await getVehicles();
    setVehicles(savedVehicles);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      setLoading(true);
      const savedVehicles = await getVehicles();

      if (mounted) {
        setVehicles(savedVehicles);
        setLoading(false);
      }
    }

    loadInitial();

    return () => {
      mounted = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadVehicles();
    }, [loadVehicles])
  );

  async function onRefresh() {
    setRefreshing(true);
    await loadVehicles();
    setRefreshing(false);
  }

  function openAddForm() {
    setEditingVehicle(null);
    setFormVisible(true);
  }

  function openEditForm(vehicle) {
    setEditingVehicle(vehicle);
    setFormVisible(true);
  }

  async function handleSave(vehicleDraft) {
    await upsertVehicle(vehicleDraft);
    setFormVisible(false);
    setEditingVehicle(null);
    await loadVehicles();
  }

  async function handleDelete(vehicleId) {
    const nextVehicles = await deleteVehicle(vehicleId);
    setVehicles(nextVehicles);
    setFormVisible(false);
    setEditingVehicle(null);
  }

  function handleViewSetups(vehicle) {
    setFormVisible(false);
    setEditingVehicle(null);

    router.push({
      pathname: "/setups",
      params: {
        vehicleId: vehicle.id,
        vehicleName: vehicle.name || "",
        mode: "vehicle",
      },
    });
  }

  const vehicleCountLabel =
    vehicles.length === 1 ? "1 saved vehicle" : `${vehicles.length} saved vehicles`;

  return (
    <View style={styles.safeArea}>
      <View
        style={[
          styles.screen,
          modernStyles.screenWithSafeArea,
          {
            paddingTop: Math.max(insets.top, 10),
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
        <View style={modernStyles.headerBar}>
          <Pressable style={modernStyles.headerSideButton} onPress={() => router.back()}>
            <Text style={modernStyles.headerSideButtonText}>‹ Back</Text>
          </Pressable>

          <View style={modernStyles.headerTitleBlock}>
            <Text style={modernStyles.headerKicker}>Vehicle</Text>
            <Text style={modernStyles.headerTitle}>Vehicles</Text>
          </View>

          <Pressable style={modernStyles.headerAddButton} onPress={openAddForm}>
            <Text style={modernStyles.headerAddButtonText}>+ Add</Text>
          </Pressable>
        </View>

        <View style={modernStyles.subHeaderRow}>
          <Text style={modernStyles.subHeaderText} numberOfLines={2}>
            Saved cars are used for Setups and Race Day.
          </Text>

          <View style={modernStyles.countPill}>
            <Text style={modernStyles.countPillText}>{vehicleCountLabel}</Text>
          </View>
        </View>

        <ScrollView
          style={modernStyles.bodyScroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={VEHICLE_COLORS.accent}
            />
          }
          contentContainerStyle={[
            modernStyles.bodyContent,
            isLandscape && modernStyles.bodyContentLandscape,
            {
              paddingBottom: Math.max(insets.bottom + 18, 28),
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={modernStyles.loadingBlock}>
              <ActivityIndicator color={VEHICLE_COLORS.accent} size="large" />
            </View>
          ) : vehicles.length === 0 ? (
            <EmptyVehiclesState onAdd={openAddForm} />
          ) : (
            <View
              style={isLandscape ? styles.landscapeGrid : styles.portraitList}
            >
              {vehicles.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  isLandscape={isLandscape}
                  onEdit={openEditForm}
                />
              ))}
            </View>
          )}
        </ScrollView>

        <VehicleForm
          visible={formVisible}
          vehicle={editingVehicle}
          onCancel={() => {
            setFormVisible(false);
            setEditingVehicle(null);
          }}
          onSave={handleSave}
          onDelete={handleDelete}
          onViewSetups={handleViewSetups}
        />
      </View>
    </View>
  );
}
