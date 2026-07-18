import { StyleSheet } from "react-native";
import { VEHICLE_COLORS } from "../constants/vehicleColors";

export const vehicleScreenModernStyles = StyleSheet.create({
  screenWithSafeArea: {
    flex: 1,
  },

  headerBar: {
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: VEHICLE_COLORS.border,
    backgroundColor: VEHICLE_COLORS.appBg,
  },

  headerSideButton: {
    minHeight: 38,
    minWidth: 72,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.border,
    backgroundColor: VEHICLE_COLORS.cardBg2,
    alignItems: "center",
    justifyContent: "center",
  },

  headerSideButtonText: {
    color: VEHICLE_COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },

  headerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },

  headerKicker: {
    color: VEHICLE_COLORS.accent,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  headerTitle: {
    color: VEHICLE_COLORS.text,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900",
  },

  headerAddButton: {
    minHeight: 38,
    minWidth: 72,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: VEHICLE_COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  headerAddButtonText: {
    color: VEHICLE_COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },

  subHeaderRow: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: VEHICLE_COLORS.appBg,
  },

  subHeaderText: {
    flex: 1,
    color: VEHICLE_COLORS.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },

  countPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.accentBorder,
    backgroundColor: VEHICLE_COLORS.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  countPillText: {
    color: VEHICLE_COLORS.text,
    fontSize: 11,
    fontWeight: "900",
  },

  bodyScroll: {
    flex: 1,
  },

  bodyContent: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },

  bodyContentLandscape: {
    paddingHorizontal: 18,
  },

  loadingBlock: {
    paddingTop: 40,
  },
});
