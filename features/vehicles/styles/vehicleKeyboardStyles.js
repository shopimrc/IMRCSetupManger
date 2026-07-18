import { StyleSheet } from "react-native";
import { VEHICLE_COLORS } from "../constants/vehicleColors";

export const vehicleKeyboardStyles = StyleSheet.create({
  formOverlayStable: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },

  formPanelStable: {
    borderRadius: 22,
    overflow: "hidden",
  },

  modalHeaderRow: {
    minHeight: 50,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: VEHICLE_COLORS.border,
  },

  modalBackButton: {
    minHeight: 36,
    minWidth: 70,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.border,
    backgroundColor: VEHICLE_COLORS.cardBg2,
    alignItems: "center",
    justifyContent: "center",
  },

  modalBackButtonText: {
    color: VEHICLE_COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },

  modalTitleBlock: {
    flex: 1,
    minWidth: 0,
  },

  modalHeaderSpacer: {
    width: 70,
    minHeight: 36,
  },

  scrollContentStable: {
    paddingHorizontal: 14,
    paddingTop: 10,
  },

  fixedActionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 9,
    backgroundColor: VEHICLE_COLORS.appBg,
    borderTopWidth: 1,
    borderTopColor: VEHICLE_COLORS.border,
  },

  floatingActionBar: {
    position: "absolute",
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 10,
    borderRadius: 18,
    backgroundColor: VEHICLE_COLORS.appBg,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.borderStrong,
  },

  actionTopRow: {
    flexDirection: "row",
    gap: 9,
    marginBottom: 8,
  },

  viewSetupsActionButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.accentBorder,
    backgroundColor: VEHICLE_COLORS.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  viewSetupsActionButtonText: {
    color: VEHICLE_COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },

  deleteActionButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 90, 95, 0.55)",
    backgroundColor: "rgba(255, 90, 95, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  deleteActionButtonText: {
    color: VEHICLE_COLORS.danger,
    fontSize: 13,
    fontWeight: "900",
  },
});
