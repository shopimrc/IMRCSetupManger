import React from "react";
import { Pressable, Text, View } from "react-native";

import { vehicleStyles as styles } from "../styles/vehicleStyles";

export default function EmptyVehiclesState({ onAdd }) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Text style={styles.emptyIconText}>＋</Text>
      </View>

      <Text style={styles.emptyTitle}>No saved vehicles yet</Text>

      <Text style={styles.emptyBody}>
        Add your first car so Setups and Race Day can use the correct vehicle,
        chassis style, and transponder information.
      </Text>

      <Pressable style={[styles.addButton, { marginTop: 18 }]} onPress={onAdd}>
        <Text style={styles.addButtonText}>Add Vehicle</Text>
      </Pressable>
    </View>
  );
}
