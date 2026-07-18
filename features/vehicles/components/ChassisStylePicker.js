import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  SectionList,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { VEHICLE_CHASSIS_SECTIONS } from "../constants/chassisStyles";
import { vehicleStyles as styles } from "../styles/vehicleStyles";

export default function ChassisStylePicker({
  visible,
  selectedValue,
  onSelect,
  onClose,
}) {
  const [search, setSearch] = useState("");
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      setSearch("");
    }
  }, [visible]);

  const filteredSections = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();

    if (!cleanSearch) {
      return VEHICLE_CHASSIS_SECTIONS;
    }

    return VEHICLE_CHASSIS_SECTIONS
      .map((section) => ({
        ...section,
        data: section.data.filter((item) =>
          item.toLowerCase().includes(cleanSearch)
        ),
      }))
      .filter((section) => section.data.length > 0);
  }, [search]);

  if (!visible) return null;

  return (
    <View
      style={[
        styles.inlinePickerOverlay,
        {
          paddingTop: Math.max(insets.top + 14, 20),
          paddingBottom: Math.max(insets.bottom + 14, 20),
        },
      ]}
      pointerEvents="auto"
    >
      <Pressable style={styles.inlinePickerBackdrop} onPress={onClose} />

      <View style={[styles.pickerPanel, styles.inlinePickerPanel]}>
        <View style={styles.pickerHeader}>
          <View style={styles.pickerTitleRow}>
            <View>
              <Text style={styles.kicker}>Vehicle</Text>
              <Text style={styles.pickerTitle}>Chassis Style</Text>
            </View>

            <Pressable style={styles.pickerClose} onPress={onClose}>
              <Text style={styles.pickerCloseText}>✕</Text>
            </Pressable>
          </View>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search chassis styles..."
            placeholderTextColor="#6F7A8C"
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>

        <SectionList
          sections={filteredSections}
          keyExtractor={(item) => item}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 28, 40) }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const isSelected = item === selectedValue;

            return (
              <Pressable
                style={[
                  styles.optionRow,
                  isSelected && styles.optionRowSelected,
                ]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text style={styles.optionText}>{item}</Text>
                {isSelected ? (
                  <Text style={styles.optionCheck}>✓</Text>
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.noResults}>
              <Text style={styles.noResultsText}>
                No chassis styles found.
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
}
