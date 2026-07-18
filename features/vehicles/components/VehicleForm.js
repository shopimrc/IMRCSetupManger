import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ChassisStylePicker from "./ChassisStylePicker";
import { createEmptyVehicle } from "../logic/vehicleDefaults";
import { validateVehicle } from "../logic/vehicleValidation";
import { vehicleStyles as styles } from "../styles/vehicleStyles";
import { vehicleKeyboardStyles as keyboardStyles } from "../styles/vehicleKeyboardStyles";

export default function VehicleForm({
  visible,
  vehicle,
  onCancel,
  onSave,
  onDelete,
  onViewSetups,
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const scrollRef = useRef(null);
  const focusedFieldRef = useRef(null);
  const fieldPositionsRef = useRef({});

  const [draft, setDraft] = useState(createEmptyVehicle());
  const [errors, setErrors] = useState({});
  const [pickerVisible, setPickerVisible] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const isEditing = Boolean(draft?.id);

  const popupWidth = Math.min(width - 24, 560);
  const verticalSafeReserve = Math.max(insets.top + insets.bottom, 22);
  const popupHeight = Math.min(
    Math.floor(height * 0.86),
    Math.max(390, height - verticalSafeReserve - 28),
    650
  );

  const scrollFocusedFieldIntoView = useCallback((delay = 70) => {
    const fieldName = focusedFieldRef.current;
    if (!fieldName) return;

    const fieldY = fieldPositionsRef.current[fieldName];
    if (typeof fieldY !== "number") return;

    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, fieldY - 14),
        animated: true,
      });
    }, delay);
  }, []);

  function getInputFocusProps(fieldName) {
    return {
      onFocus: () => {
        focusedFieldRef.current = fieldName;
        if (keyboardOpen) {
          scrollFocusedFieldIntoView(25);
        }
      },
    };
  }

  function storeFieldPosition(fieldName) {
    return (event) => {
      fieldPositionsRef.current[fieldName] = event.nativeEvent.layout.y;
    };
  }

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardOpen(true);
      setKeyboardHeight(event?.endCoordinates?.height || 0);
      scrollFocusedFieldIntoView(90);
    });

    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardOpen(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollFocusedFieldIntoView]);

  useEffect(() => {
    if (!visible) return;

    setDraft(vehicle || createEmptyVehicle());
    setErrors({});
    setPickerVisible(false);
    setKeyboardOpen(false);
    setKeyboardHeight(0);
    focusedFieldRef.current = null;
    fieldPositionsRef.current = {};

    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, 0);
  }, [visible, vehicle]);

  function updateField(field, value) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));

    if (errors[field]) {
      setErrors((current) => ({
        ...current,
        [field]: "",
      }));
    }
  }

  function handleSave() {
    const result = validateVehicle(draft);

    if (!result.isValid) {
      setErrors(result.errors);

      focusedFieldRef.current = result.errors.name
        ? "name"
        : result.errors.chassisStyle
          ? "chassisStyle"
          : null;

      scrollFocusedFieldIntoView(20);
      return;
    }

    Keyboard.dismiss();
    onSave(draft);
  }

  function handleCancel() {
    Keyboard.dismiss();
    onCancel();
  }

  function handleDeletePress() {
    if (!draft?.id || !onDelete) return;

    Keyboard.dismiss();

    Alert.alert(
      "Delete Vehicle?",
      `Delete ${draft.name || "this vehicle"}? This will remove it from saved vehicles.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(draft.id),
        },
      ]
    );
  }

  function handleViewSetupsPress() {
    Keyboard.dismiss();
    onViewSetups?.(draft);
  }

  function renderActionButtons() {
    return (
      <>
        {isEditing ? (
          <View style={keyboardStyles.actionTopRow}>
            <Pressable
              style={keyboardStyles.viewSetupsActionButton}
              onPress={handleViewSetupsPress}
            >
              <Text style={keyboardStyles.viewSetupsActionButtonText}>
                View Setups
              </Text>
            </Pressable>

            <Pressable
              style={keyboardStyles.deleteActionButton}
              onPress={handleDeletePress}
            >
              <Text style={keyboardStyles.deleteActionButtonText}>
                Delete Vehicle
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.formActionsCompact}>
          <Pressable style={styles.formButtonCompact} onPress={handleCancel}>
            <Text style={styles.formButtonText}>Cancel</Text>
          </Pressable>

          <Pressable
            style={[styles.formButtonCompact, styles.formButtonPrimary]}
            onPress={handleSave}
          >
            <Text style={styles.formButtonText}>Save Vehicle</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View
          style={[
            styles.formOverlay,
            keyboardStyles.formOverlayStable,
            {
              paddingTop: Math.max(insets.top + 8, 16),
              paddingBottom: Math.max(insets.bottom + 8, 16),
            },
          ]}
        >
          <View
            style={[
              styles.formPanel,
              keyboardStyles.formPanelStable,
              {
                width: popupWidth,
                height: popupHeight,
              },
            ]}
          >
            <View style={styles.formHandle} />

            <View style={keyboardStyles.modalHeaderRow}>
              <Pressable style={keyboardStyles.modalBackButton} onPress={handleCancel}>
                <Text style={keyboardStyles.modalBackButtonText}>‹ Back</Text>
              </Pressable>

              <View style={keyboardStyles.modalTitleBlock}>
                <Text style={styles.kicker}>Vehicle</Text>
                <Text style={styles.formTitleCompact}>
                  {isEditing ? "Edit Vehicle" : "Add Vehicle"}
                </Text>
              </View>

              <View style={keyboardStyles.modalHeaderSpacer} />
            </View>

            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.formContent,
                keyboardStyles.scrollContentStable,
                {
                  paddingBottom: keyboardOpen
                    ? keyboardHeight + insets.bottom + 132
                    : insets.bottom + 124,
                },
              ]}
            >
              <View
                style={styles.fieldCompact}
                onLayout={storeFieldPosition("name")}
              >
                <Text style={styles.labelCompact}>Vehicle Name *</Text>
                <TextInput
                  value={draft.name}
                  onChangeText={(value) => updateField("name", value)}
                  placeholder="Example: Yoshi Truck"
                  placeholderTextColor="#6F7A8C"
                  style={[styles.inputCompact, errors.name && styles.inputError]}
                  autoCorrect={false}
                  returnKeyType="next"
                  {...getInputFocusProps("name")}
                />
                {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
              </View>

              <View style={styles.formRow}>
                <View
                  style={styles.formRowItem}
                  onLayout={storeFieldPosition("manufacturer")}
                >
                  <Text style={styles.labelCompact}>Manufacturer</Text>
                  <TextInput
                    value={draft.manufacturer}
                    onChangeText={(value) => updateField("manufacturer", value)}
                    placeholder="CRC"
                    placeholderTextColor="#6F7A8C"
                    style={styles.inputCompact}
                    autoCorrect={false}
                    returnKeyType="next"
                    {...getInputFocusProps("manufacturer")}
                  />
                </View>

                <View
                  style={styles.formRowItem}
                  onLayout={storeFieldPosition("model")}
                >
                  <Text style={styles.labelCompact}>Model</Text>
                  <TextInput
                    value={draft.model}
                    onChangeText={(value) => updateField("model", value)}
                    placeholder="CK25"
                    placeholderTextColor="#6F7A8C"
                    style={styles.inputCompact}
                    autoCorrect={false}
                    returnKeyType="next"
                    {...getInputFocusProps("model")}
                  />
                </View>
              </View>

              <View
                style={styles.fieldCompact}
                onLayout={storeFieldPosition("chassisStyle")}
              >
                <Text style={styles.labelCompact}>Chassis Style *</Text>
                <Pressable
                  style={[
                    styles.pickerButtonCompact,
                    draft.chassisStyle && styles.pickerButtonSelected,
                    errors.chassisStyle && styles.inputError,
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    focusedFieldRef.current = "chassisStyle";
                    setTimeout(() => {
                      setPickerVisible(true);
                    }, 80);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerButtonTextCompact,
                      !draft.chassisStyle && styles.pickerButtonPlaceholder,
                    ]}
                    numberOfLines={1}
                  >
                    {draft.chassisStyle || "Select chassis style"}
                  </Text>
                  <Text style={styles.pickerChevron}>⌄</Text>
                </Pressable>

                {errors.chassisStyle ? (
                  <Text style={styles.errorText}>{errors.chassisStyle}</Text>
                ) : null}
              </View>

              <View
                style={styles.fieldCompact}
                onLayout={storeFieldPosition("transponder")}
              >
                <Text style={styles.labelCompact}>Transponder Number</Text>
                <TextInput
                  value={draft.transponder}
                  onChangeText={(value) => updateField("transponder", value)}
                  placeholder="Example: 3358118"
                  placeholderTextColor="#6F7A8C"
                  style={styles.inputCompact}
                  autoCorrect={false}
                  keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
                  returnKeyType="next"
                  {...getInputFocusProps("transponder")}
                />
              </View>

              <View
                style={styles.fieldCompact}
                onLayout={storeFieldPosition("notes")}
              >
                <Text style={styles.labelCompact}>Notes</Text>
                <TextInput
                  value={draft.notes}
                  onChangeText={(value) => updateField("notes", value)}
                  placeholder="Optional vehicle notes..."
                  placeholderTextColor="#6F7A8C"
                  style={[styles.inputCompact, styles.textAreaCompact]}
                  multiline
                  textAlignVertical="top"
                  {...getInputFocusProps("notes")}
                />
              </View>
            </ScrollView>

            {!keyboardOpen ? (
              <View
                style={[
                  keyboardStyles.fixedActionBar,
                  {
                    paddingBottom: Math.max(insets.bottom + 10, 14),
                  },
                ]}
              >
                {renderActionButtons()}
              </View>
            ) : null}
          </View>

          {keyboardOpen ? (
            <View
              style={[
                keyboardStyles.floatingActionBar,
                {
                  width: popupWidth,
                  bottom: Math.max(8, keyboardHeight + insets.bottom + 8),
                },
              ]}
            >
              {renderActionButtons()}
            </View>
          ) : null}

          <ChassisStylePicker
            visible={pickerVisible}
            selectedValue={draft.chassisStyle}
            onSelect={(value) => updateField("chassisStyle", value)}
            onClose={() => setPickerVisible(false)}
          />
        </View>
      </Modal>
    </>
  );
}
