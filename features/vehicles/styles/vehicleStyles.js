import { StyleSheet } from "react-native";
import { VEHICLE_COLORS } from "../constants/vehicleColors";

export const vehicleStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: VEHICLE_COLORS.appBg,
  },

  screen: {
    flex: 1,
    backgroundColor: VEHICLE_COLORS.appBg,
  },

  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 22,
  },

  landscapeScrollContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
  },

  header: {
    marginBottom: 10,
  },

  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  backButton: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.border,
    backgroundColor: VEHICLE_COLORS.cardBg2,
    alignItems: "center",
    justifyContent: "center",
  },

  backButtonText: {
    color: VEHICLE_COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },

  titleBlock: {
    flex: 1,
  },

  kicker: {
    color: VEHICLE_COLORS.accent,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 1,
  },

  title: {
    color: VEHICLE_COLORS.text,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "900",
  },

  subtitle: {
    color: VEHICLE_COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },

  addButton: {
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 13,
    backgroundColor: VEHICLE_COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: VEHICLE_COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },

  addButtonText: {
    color: VEHICLE_COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },

  countPill: {
    alignSelf: "flex-start",
    marginTop: 8,
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
    fontWeight: "800",
  },

  landscapeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  portraitList: {
    gap: 7,
  },

  cardWrapperLandscape: {
    width: "49%",
  },

  card: {
    borderRadius: 13,
    backgroundColor: VEHICLE_COLORS.cardBg,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.border,
    overflow: "hidden",
  },

  thinCard: {
    minHeight: 68,
  },

  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.996 }],
  },

  cardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: VEHICLE_COLORS.accent,
  },

  thinCardInner: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    paddingLeft: 14,
  },

  thinCardMainRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 9,
  },

  thinCardTextBlock: {
    flex: 1,
    minWidth: 0,
  },

  thinCardTitle: {
    color: VEHICLE_COLORS.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 19,
  },

  thinCardMeta: {
    color: VEHICLE_COLORS.textMuted,
    fontSize: 12,
    lineHeight: 15,
    marginTop: 1,
    fontWeight: "700",
  },

  thinCardChassis: {
    color: VEHICLE_COLORS.textFaint,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
    fontWeight: "800",
  },

  thinTransponderBox: {
    minWidth: 74,
    maxWidth: 102,
    minHeight: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.accentBorder,
    backgroundColor: VEHICLE_COLORS.accentSoft,
    paddingHorizontal: 7,
    paddingVertical: 5,
    alignItems: "center",
    justifyContent: "center",
  },

  thinTransponderLabel: {
    color: VEHICLE_COLORS.textFaint,
    fontSize: 10,
    lineHeight: 11,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center",
    minWidth: 18,
  },

  thinTransponderValue: {
    color: VEHICLE_COLORS.text,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    marginTop: 1,
    textAlign: "center",
  },

  emptyCard: {
    marginTop: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.border,
    backgroundColor: VEHICLE_COLORS.cardBg,
    padding: 19,
    alignItems: "center",
  },

  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: VEHICLE_COLORS.accentSoft,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.accentBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 11,
  },

  emptyIconText: {
    color: VEHICLE_COLORS.text,
    fontSize: 25,
    fontWeight: "900",
  },

  emptyTitle: {
    color: VEHICLE_COLORS.text,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 7,
  },

  emptyBody: {
    color: VEHICLE_COLORS.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },

  formOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.66)",
    justifyContent: "flex-end",
  },

  formPanel: {
    maxHeight: "96%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.borderStrong,
    backgroundColor: VEHICLE_COLORS.appBg,
    overflow: "hidden",
  },

  formHandle: {
    alignSelf: "center",
    width: 48,
    height: 4,
    borderRadius: 999,
    backgroundColor: VEHICLE_COLORS.borderStrong,
    marginTop: 7,
    marginBottom: 6,
  },

  formContent: {
    paddingHorizontal: 14,
    paddingBottom: 18,
  },

  formHeader: {
    marginBottom: 14,
  },

  formHeaderCompact: {
    marginBottom: 9,
  },

  formTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  formTitle: {
    color: VEHICLE_COLORS.text,
    fontSize: 26,
    fontWeight: "900",
  },

  formTitleCompact: {
    color: VEHICLE_COLORS.text,
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "900",
  },

  formSubtitle: {
    color: VEHICLE_COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },

  formRow: {
    flexDirection: "row",
    gap: 9,
    marginBottom: 10,
  },

  formRowItem: {
    flex: 1,
    minWidth: 0,
  },

  field: {
    marginBottom: 13,
  },

  fieldCompact: {
    marginBottom: 10,
  },

  label: {
    color: VEHICLE_COLORS.text,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 7,
  },

  labelCompact: {
    color: VEHICLE_COLORS.text,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 5,
  },

  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.border,
    backgroundColor: VEHICLE_COLORS.inputBg,
    color: VEHICLE_COLORS.text,
    paddingHorizontal: 13,
    fontSize: 16,
    fontWeight: "700",
  },

  inputCompact: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.border,
    backgroundColor: VEHICLE_COLORS.inputBg,
    color: VEHICLE_COLORS.text,
    paddingHorizontal: 11,
    fontSize: 14,
    fontWeight: "700",
  },

  inputError: {
    borderColor: VEHICLE_COLORS.danger,
  },

  textArea: {
    minHeight: 88,
    paddingTop: 12,
    textAlignVertical: "top",
  },

  textAreaCompact: {
    minHeight: 58,
    paddingTop: 9,
    textAlignVertical: "top",
  },

  helperText: {
    color: VEHICLE_COLORS.textFaint,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },

  errorText: {
    color: VEHICLE_COLORS.danger,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
  },

  pickerButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.border,
    backgroundColor: VEHICLE_COLORS.inputBg,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  pickerButtonCompact: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.border,
    backgroundColor: VEHICLE_COLORS.inputBg,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  pickerButtonSelected: {
    borderColor: VEHICLE_COLORS.accentBorder,
    backgroundColor: VEHICLE_COLORS.accentSoft,
  },

  pickerButtonText: {
    flex: 1,
    color: VEHICLE_COLORS.text,
    fontSize: 16,
    fontWeight: "800",
  },

  pickerButtonTextCompact: {
    flex: 1,
    color: VEHICLE_COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },

  pickerButtonPlaceholder: {
    color: VEHICLE_COLORS.textFaint,
  },

  pickerChevron: {
    color: VEHICLE_COLORS.textMuted,
    fontSize: 17,
    fontWeight: "900",
  },

  viewSetupsButton: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.accentBorder,
    backgroundColor: VEHICLE_COLORS.accentSoft,
    paddingHorizontal: 14,
    paddingVertical: 9,
    justifyContent: "center",
    marginBottom: 14,
  },

  viewSetupsButtonCompact: {
    minHeight: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.accentBorder,
    backgroundColor: VEHICLE_COLORS.accentSoft,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  viewSetupsButtonText: {
    color: VEHICLE_COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },

  viewSetupsButtonTextCompact: {
    color: VEHICLE_COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },

  viewSetupsSubText: {
    color: VEHICLE_COLORS.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    marginTop: 2,
  },

  formActions: {
    flexDirection: "row",
    gap: 11,
    marginTop: 4,
  },

  formActionsCompact: {
    flexDirection: "row",
    gap: 9,
    marginTop: 2,
  },

  formButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.borderStrong,
    backgroundColor: VEHICLE_COLORS.cardBg,
  },

  formButtonCompact: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.borderStrong,
    backgroundColor: VEHICLE_COLORS.cardBg,
  },

  formButtonPrimary: {
    backgroundColor: VEHICLE_COLORS.accent,
    borderColor: VEHICLE_COLORS.accent,
  },

  formButtonText: {
    color: VEHICLE_COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },

  formDeleteButton: {
    minHeight: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 90, 95, 0.55)",
    backgroundColor: "rgba(255, 90, 95, 0.12)",
    marginTop: 1,
    marginBottom: 11,
  },

  formDeleteButtonCompact: {
    minHeight: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 90, 95, 0.55)",
    backgroundColor: "rgba(255, 90, 95, 0.12)",
    marginTop: 0,
    marginBottom: 9,
  },

  formDeleteButtonText: {
    color: VEHICLE_COLORS.danger,
    fontSize: 14,
    fontWeight: "900",
  },

  inlinePickerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.72)",
  },

  inlinePickerBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },

  inlinePickerPanel: {
    height: "88%",
    maxHeight: "88%",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.70)",
    justifyContent: "flex-end",
  },

  pickerPanel: {
    height: "88%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: VEHICLE_COLORS.appBg,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.borderStrong,
    overflow: "hidden",
  },

  pickerHeader: {
    padding: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: VEHICLE_COLORS.border,
  },

  pickerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  pickerTitle: {
    color: VEHICLE_COLORS.text,
    fontSize: 23,
    fontWeight: "900",
  },

  pickerClose: {
    minWidth: 44,
    minHeight: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: VEHICLE_COLORS.cardBg,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.border,
  },

  pickerCloseText: {
    color: VEHICLE_COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },

  searchInput: {
    marginTop: 12,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.border,
    backgroundColor: VEHICLE_COLORS.inputBg,
    color: VEHICLE_COLORS.text,
    paddingHorizontal: 13,
    fontSize: 15,
    fontWeight: "700",
  },

  sectionHeader: {
    backgroundColor: VEHICLE_COLORS.appBg,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
  },

  sectionHeaderText: {
    color: VEHICLE_COLORS.accent,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },

  optionRow: {
    minHeight: 50,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: VEHICLE_COLORS.border,
    backgroundColor: VEHICLE_COLORS.cardBg,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  optionRowSelected: {
    borderColor: VEHICLE_COLORS.accentBorder,
    backgroundColor: VEHICLE_COLORS.accentSoft,
  },

  optionText: {
    flex: 1,
    color: VEHICLE_COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },

  optionCheck: {
    color: VEHICLE_COLORS.accent,
    fontSize: 18,
    fontWeight: "900",
  },

  noResults: {
    padding: 20,
    alignItems: "center",
  },

  noResultsText: {
    color: VEHICLE_COLORS.textMuted,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
});
