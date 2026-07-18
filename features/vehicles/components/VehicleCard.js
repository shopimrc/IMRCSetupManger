import React from "react";
import { Pressable, Text, View } from "react-native";

import { vehicleStyles as styles } from "../styles/vehicleStyles";

function blankFallback(value, fallback = "Not set") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

export default function VehicleCard({ vehicle, isLandscape, onEdit }) {
  const manufacturerModel = [vehicle.manufacturer, vehicle.model]
    .filter(Boolean)
    .join(" ");

  return (
    <View style={isLandscape ? styles.cardWrapperLandscape : undefined}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          styles.thinCard,
          pressed && styles.cardPressed,
        ]}
        onPress={() => onEdit(vehicle)}
      >
        <View style={styles.cardAccent} />

        <View style={styles.thinCardInner}>
          <View style={styles.thinCardMainRow}>
            <View style={styles.thinCardTextBlock}>
              <Text style={styles.thinCardTitle} numberOfLines={1}>
                {blankFallback(vehicle.name, "Unnamed Vehicle")}
              </Text>

              <Text style={styles.thinCardMeta} numberOfLines={1}>
                {blankFallback(manufacturerModel, "Manufacturer / Model not set")}
              </Text>

              <Text style={styles.thinCardChassis} numberOfLines={1}>
                {blankFallback(vehicle.chassisStyle, "Chassis Style not set")}
              </Text>
            </View>

            <View style={styles.thinTransponderBox}>
              <Text
                style={styles.thinTransponderLabel}
                numberOfLines={1}
                allowFontScaling={false}
              >
                TX
              </Text>
              <Text
                style={styles.thinTransponderValue}
                numberOfLines={1}
                allowFontScaling={false}
              >
                {blankFallback(vehicle.transponder, "—")}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}
