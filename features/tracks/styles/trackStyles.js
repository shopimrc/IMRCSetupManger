// features/tracks/styles/trackStyles.js

import { Platform, StyleSheet } from 'react-native';

export const TRACK_BLUE = '#1E8BFF';

// Fallback spacing only. Screens/components now apply real device insets with
// react-native-safe-area-context so iOS notches/status bars are handled correctly.
const TRACK_SAFE_TOP = Platform.select({
  android: 16,
  ios: 16,
  default: 12,
});

const TRACK_SAFE_BOTTOM = Platform.select({
  android: 24,
  ios: 18,
  default: 18,
});

export const trackColors = {
  background: '#070A12',
  panel: '#0B1220',
  panelSoft: '#101827',
  card: '#121A2A',
  border: '#263449',
  text: '#F8FAFC',
  muted: '#A9B6C7',
  mutedDark: '#728096',
  blue: TRACK_BLUE,
  blueSoft: 'rgba(30, 139, 255, 0.16)',
  bluePill: 'rgba(30, 139, 255, 0.20)',
  blueBorder: 'rgba(30, 139, 255, 0.72)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.14)',
  overlay: 'rgba(0, 0, 0, 0.72)',
  white: '#FFFFFF',
};

const TRACK_STYLE_ACCENTS = {
  ovalAsphalt: {
    text: '#FFB020',
    bar: '#F59E0B',
    border: 'rgba(245, 158, 11, 0.92)',
    background: 'rgba(245, 158, 11, 0.18)',
  },
  ovalCarpet: {
    text: '#FBBF24',
    bar: '#D97706',
    border: 'rgba(251, 191, 36, 0.96)',
    background: 'rgba(217, 119, 6, 0.20)',
  },
  ovalDirt: {
    text: '#FB923C',
    bar: '#EA580C',
    border: 'rgba(234, 88, 12, 0.92)',
    background: 'rgba(234, 88, 12, 0.18)',
  },
  ovalConcrete: {
    text: '#FCD34D',
    bar: '#CA8A04',
    border: 'rgba(252, 211, 77, 0.92)',
    background: 'rgba(202, 138, 4, 0.18)',
  },
  onRoadAsphalt: {
    text: '#38BDF8',
    bar: '#0EA5E9',
    border: 'rgba(14, 165, 233, 0.92)',
    background: 'rgba(14, 165, 233, 0.18)',
  },
  onRoadCarpet: {
    text: '#67E8F9',
    bar: '#0891B2',
    border: 'rgba(103, 232, 249, 0.92)',
    background: 'rgba(8, 145, 178, 0.18)',
  },
  onRoadConcrete: {
    text: '#93C5FD',
    bar: '#2563EB',
    border: 'rgba(147, 197, 253, 0.92)',
    background: 'rgba(37, 99, 235, 0.18)',
  },
  offRoadDirt: {
    text: '#34D399',
    bar: '#10B981',
    border: 'rgba(16, 185, 129, 0.92)',
    background: 'rgba(16, 185, 129, 0.18)',
  },
  offRoadClay: {
    text: '#86EFAC',
    bar: '#16A34A',
    border: 'rgba(134, 239, 172, 0.92)',
    background: 'rgba(22, 163, 74, 0.18)',
  },
  offRoadCarpet: {
    text: '#A7F3D0',
    bar: '#059669',
    border: 'rgba(167, 243, 208, 0.92)',
    background: 'rgba(5, 150, 105, 0.18)',
  },
  offRoadTurf: {
    text: '#BEF264',
    bar: '#65A30D',
    border: 'rgba(190, 242, 100, 0.92)',
    background: 'rgba(101, 163, 13, 0.18)',
  },
  dragAsphalt: {
    text: '#F472B6',
    bar: '#EC4899',
    border: 'rgba(236, 72, 153, 0.92)',
    background: 'rgba(236, 72, 153, 0.18)',
  },
  dragConcrete: {
    text: '#FDA4AF',
    bar: '#E11D48',
    border: 'rgba(253, 164, 175, 0.92)',
    background: 'rgba(225, 29, 72, 0.18)',
  },
  default: {
    text: '#93C5FD',
    bar: TRACK_BLUE,
    border: 'rgba(147, 197, 253, 0.92)',
    background: 'rgba(30, 139, 255, 0.18)',
  },
};

function getSurfaceFamily(surface = '') {
  const value = String(surface || '').toLowerCase();

  if (value.includes('crc')) return 'carpet';
  if (value.includes('carpet')) return 'carpet';
  if (value.includes('clay')) return 'clay';
  if (value.includes('dirt')) return 'dirt';
  if (value.includes('turf')) return 'turf';
  if (value.includes('concrete')) return 'concrete';
  if (value.includes('asphalt')) return 'asphalt';

  return '';
}

export function getTrackStyleAccent(trackType = '', surface = '') {
  const style = String(trackType || '').toLowerCase();
  const surfaceFamily = getSurfaceFamily(surface);

  if (style.includes('oval')) {
    if (surfaceFamily === 'carpet') return TRACK_STYLE_ACCENTS.ovalCarpet;
    if (surfaceFamily === 'dirt' || surfaceFamily === 'clay') return TRACK_STYLE_ACCENTS.ovalDirt;
    if (surfaceFamily === 'concrete') return TRACK_STYLE_ACCENTS.ovalConcrete;
    return TRACK_STYLE_ACCENTS.ovalAsphalt;
  }

  if (style.includes('on-road') || style.includes('on road') || style.includes('onroad')) {
    if (surfaceFamily === 'carpet') return TRACK_STYLE_ACCENTS.onRoadCarpet;
    if (surfaceFamily === 'concrete') return TRACK_STYLE_ACCENTS.onRoadConcrete;
    return TRACK_STYLE_ACCENTS.onRoadAsphalt;
  }

  if (style.includes('off-road') || style.includes('off road') || style.includes('offroad')) {
    if (surfaceFamily === 'carpet') return TRACK_STYLE_ACCENTS.offRoadCarpet;
    if (surfaceFamily === 'clay') return TRACK_STYLE_ACCENTS.offRoadClay;
    if (surfaceFamily === 'turf') return TRACK_STYLE_ACCENTS.offRoadTurf;
    return TRACK_STYLE_ACCENTS.offRoadDirt;
  }

  if (style.includes('drag')) {
    if (surfaceFamily === 'concrete') return TRACK_STYLE_ACCENTS.dragConcrete;
    return TRACK_STYLE_ACCENTS.dragAsphalt;
  }

  return TRACK_STYLE_ACCENTS.default;
}

const shadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
  },
  android: {
    elevation: 3,
  },
  default: {},
});

export const trackStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: trackColors.background,
  },

  screenContent: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: TRACK_SAFE_TOP,
    paddingBottom: TRACK_SAFE_BOTTOM,
  },

  screenContentLandscape: {
    paddingHorizontal: 18,
    paddingTop: Math.max(10, TRACK_SAFE_TOP - 6),
    paddingBottom: TRACK_SAFE_BOTTOM,
  },

  vehicleLikeHeader: {
    marginBottom: 9,
  },

  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },

  appLabel: {
    color: trackColors.blue,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },

  pageTitle: {
    color: trackColors.text,
    fontSize: 25,
    lineHeight: 28,
    fontWeight: '900',
  },

  pageSubtitle: {
    color: trackColors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
  },

  headerButton: {
    minHeight: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panelSoft,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerButtonText: {
    color: trackColors.text,
    fontSize: 12,
    fontWeight: '900',
  },

  headerImportButton: {
    minHeight: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.38)',
    backgroundColor: 'rgba(34, 197, 94, 0.14)',
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerImportButtonText: {
    color: '#BFF7CF',
    fontSize: 12,
    fontWeight: '900',
  },

  addButton: {
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: trackColors.blue,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  addButtonText: {
    color: trackColors.white,
    fontSize: 13,
    fontWeight: '900',
  },

  headerToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },

  savedCountPill: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: trackColors.blueBorder,
    backgroundColor: 'rgba(30, 139, 255, 0.08)',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  savedCountText: {
    color: trackColors.text,
    fontSize: 11,
    fontWeight: '900',
  },

  list: {
    flex: 1,
  },

  listContent: {
    paddingBottom: TRACK_SAFE_BOTTOM + 26,
    gap: 6,
  },

  listContentLandscape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 10,
  },

  emptyStateCard: {
    marginTop: 8,
    marginBottom: TRACK_SAFE_BOTTOM,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.card,
    paddingHorizontal: 24,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 252,
  },

  emptyPlusCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },

  emptyPlusText: {
    color: trackColors.white,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
  },

  emptyStateTitle: {
    color: trackColors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },

  emptyStateText: {
    color: trackColors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
    maxWidth: 300,
  },

  emptyAddButton: {
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: trackColors.blue,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyAddButtonText: {
    color: trackColors.white,
    fontSize: 13,
    fontWeight: '900',
  },

  emptyCard: {
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.blueSoft,
    marginTop: 4,
  },

  emptyTitle: {
    color: trackColors.text,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 5,
  },

  emptyText: {
    color: trackColors.muted,
    fontSize: 13,
    lineHeight: 19,
  },

  trackCard: {
    width: '100%',
    minHeight: 70,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.card,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
    ...shadow,
  },

  trackCardLandscape: {
    width: '48.8%',
    minWidth: 280,
  },

  trackCardPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.86,
  },

  cardBlueBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: trackColors.blue,
  },

  cardLeft: {
    flex: 1,
    minWidth: 0,
  },

  cardTitle: {
    color: trackColors.text,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '900',
  },

  cardSubLine: {
    color: trackColors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    marginTop: 1,
  },

  cardStyleSurfaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 2,
    marginBottom: 0,
    minWidth: 0,
  },

  cardStyleChip: {
    maxWidth: '48%',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },

  cardStyleChipText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
  },

  cardSurfaceBrightText: {
    flex: 1,
    minWidth: 0,
    color: '#EAF2FF',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },

  cardBottomLine: {
    color: trackColors.mutedDark,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    marginTop: 1,
  },

  cardRightPill: {
    width: 74,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.bluePill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },

  cardRightLabel: {
    color: trackColors.muted,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  cardRightValue: {
    color: trackColors.white,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 1,
  },

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    color: trackColors.muted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },

  formShell: {
    flex: 1,
    backgroundColor: trackColors.background,
  },

  formScroll: {
    flex: 1,
  },

  formContent: {
    paddingHorizontal: 14,
    paddingTop: TRACK_SAFE_TOP,
    paddingBottom: TRACK_SAFE_BOTTOM + 96,
  },

  formContentLandscape: {
    paddingHorizontal: 18,
    paddingTop: Math.max(10, TRACK_SAFE_TOP - 6),
  },

  editHeader: {
    marginBottom: 11,
  },

  submitTopHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  submitTopTitleWrap: {
    flex: 1,
    minWidth: 0,
  },

  editTitle: {
    color: trackColors.text,
    fontSize: 25,
    lineHeight: 29,
    fontWeight: '900',
  },

  editSubtitle: {
    color: trackColors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },

  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },

  formGridNested: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },

  formFieldFull: {
    width: '100%',
  },

  formFieldHalf: {
    width: '48.7%',
    minWidth: 250,
  },

  formFieldThird: {
    width: '31.9%',
    minWidth: 150,
  },

  compactSection: {
    width: '100%',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panel,
    padding: 10,
  },

  compactSectionTitle: {
    color: trackColors.text,
    fontSize: 13,
    fontWeight: '900',
  },

  sheetOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: TRACK_SAFE_TOP + 10,
    paddingBottom: TRACK_SAFE_BOTTOM + 10,
  },

  sheetDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },

  sheetKeyboardWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },

  bottomSheet: {
    width: '100%',
    maxWidth: 560,
    height: '84%',
    maxHeight: '84%',
    borderRadius: 22,
    position: 'relative',
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.background,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    overflow: 'hidden',
  },

  bottomSheetKeyboardOpen: {
    // Keep the popup stable when the keyboard opens.
  },

  bottomSheetLandscape: {
    height: '88%',
    maxHeight: '88%',
    alignSelf: 'center',
    maxWidth: 720,
    borderRadius: 22,
  },

  sheetHandle: {
    width: 48,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#6B7280',
    alignSelf: 'center',
    marginBottom: 8,
    opacity: 0.8,
  },

  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },

  sheetHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },

  sheetEyebrow: {
    color: trackColors.blue,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    marginBottom: 2,
  },

  sheetTitle: {
    color: trackColors.text,
    fontSize: 23,
    lineHeight: 27,
    fontWeight: '900',
  },

  sheetSmallButton: {
    minHeight: 36,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.bluePill,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sheetSmallButtonText: {
    color: trackColors.white,
    fontSize: 12,
    fontWeight: '900',
  },

  sheetTopActionsWrap: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: trackColors.border,
    borderBottomColor: trackColors.border,
    paddingTop: 6,
    paddingBottom: 7,
    marginBottom: 8,
    backgroundColor: trackColors.background,
  },

  sheetScroll: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 160,
  },

  sheetContent: {
    paddingBottom: 18,
  },

  sheetContentKeyboardOpen: {
    paddingBottom: 300,
  },

  sheetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  sheetGridNested: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 7,
  },

  sheetFieldFull: {
    width: '100%',
  },

  sheetFieldHalf: {
    width: '48.7%',
    minWidth: 0,
  },

  sheetFieldThird: {
    width: '31.8%',
    minWidth: 0,
  },

  sheetFieldTwoThird: {
    width: '65.2%',
    minWidth: 0,
  },

  sheetSection: {
    width: '100%',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panel,
    padding: 8,
  },

  sheetSectionTitle: {
    color: trackColors.text,
    fontSize: 13,
    fontWeight: '900',
  },

  inputLabel: {
    color: trackColors.text,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 5,
  },

  textInput: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panel,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: trackColors.text,
    fontSize: 13,
    fontWeight: '700',
  },

  urlInput: {
    marginTop: 8,
  },

  notesInput: {
    minHeight: 58,
    lineHeight: 19,
  },

  notesInputCompact: {
    minHeight: 50,
    lineHeight: 17,
  },

  importInput: {
    minHeight: 230,
    lineHeight: 19,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: undefined,
    }),
    fontSize: 12,
  },

  inputError: {
    borderColor: trackColors.danger,
  },

  errorText: {
    color: trackColors.danger,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
  },

  dropdownButton: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panel,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  dropdownButtonText: {
    flex: 1,
    color: trackColors.text,
    fontSize: 13,
    fontWeight: '800',
  },

  dropdownPlaceholderText: {
    color: trackColors.mutedDark,
  },

  dropdownChevron: {
    color: trackColors.muted,
    fontSize: 16,
    fontWeight: '900',
    marginLeft: 8,
  },

  dropdownOverlay: {
    flex: 1,
    backgroundColor: trackColors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingTop: TRACK_SAFE_TOP + 10,
    paddingBottom: TRACK_SAFE_BOTTOM + 10,
  },

  dropdownModal: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '78%',
    borderRadius: 20,
    position: 'relative',
    borderWidth: 1,
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.panel,
    overflow: 'hidden',
  },

  dropdownHeader: {
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: trackColors.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  dropdownTitle: {
    color: trackColors.text,
    fontSize: 16,
    fontWeight: '900',
  },

  dropdownCloseButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panelSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  dropdownCloseText: {
    color: trackColors.text,
    fontSize: 12,
    fontWeight: '900',
  },

  dropdownList: {
    padding: 10,
  },

  dropdownOption: {
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  dropdownOptionSelected: {
    borderColor: trackColors.blue,
    backgroundColor: trackColors.blueSoft,
  },

  dropdownOptionPressed: {
    opacity: 0.75,
  },

  dropdownOptionText: {
    color: trackColors.text,
    fontSize: 14,
    fontWeight: '800',
  },

  dropdownOptionTextSelected: {
    color: trackColors.blue,
  },

  dropdownCheck: {
    color: trackColors.blue,
    fontSize: 16,
    fontWeight: '900',
  },

  importInfoBox: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panel,
    padding: 12,
    marginTop: 10,
    marginBottom: 10,
  },

  importInfoTitle: {
    color: trackColors.text,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 4,
  },

  importInfoText: {
    color: trackColors.muted,
    fontSize: 12,
    lineHeight: 17,
  },

  importButtonSpacing: {
    marginTop: 9,
  },

  actionRow: {
    gap: 9,
    marginTop: 13,
  },

  actionRowLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },

  primaryButton: {
    minHeight: 40,
    borderRadius: 15,
    backgroundColor: trackColors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  primaryButtonText: {
    color: trackColors.white,
    fontSize: 14,
    fontWeight: '900',
  },

  secondaryButton: {
    minHeight: 40,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  secondaryButtonText: {
    color: trackColors.blue,
    fontSize: 14,
    fontWeight: '900',
  },

  submitTrackInlineButton: {
    width: '100%',
    minHeight: 38,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  submitTrackInlineText: {
    color: trackColors.blue,
    fontSize: 13,
    fontWeight: '900',
  },

  deleteButton: {
    width: '100%',
    minHeight: 38,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.72)',
    backgroundColor: trackColors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  deleteButtonText: {
    color: trackColors.danger,
    fontSize: 13,
    fontWeight: '900',
  },

  sheetInlineActionsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },

  sheetInlineActionHalf: {
    flex: 1,
    width: undefined,
  },

  keyboardFloatingActions: {
    position: 'absolute',
    left: 22,
    right: 22,
    zIndex: 100,
  },

  sheetActionsBlock: {
    borderTopWidth: 1,
    borderTopColor: trackColors.border,
    paddingTop: 7,
    backgroundColor: trackColors.background,
  },

  sheetActionsBlockFloating: {
    width: '100%',
    borderWidth: 1,
    borderColor: trackColors.border,
    borderRadius: 18,
    padding: 10,
    backgroundColor: trackColors.background,
  },

  stationaryMergeButton: {
    width: '100%',
    minHeight: 34,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.78)',
    backgroundColor: 'rgba(168, 85, 247, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginBottom: 7,
  },

  stationaryMergeButtonText: {
    color: '#C084FC',
    fontSize: 12,
    fontWeight: '900',
  },

  sheetStationaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 0,
    paddingBottom: 7,
    backgroundColor: trackColors.background,
  },

  stationarySubmitButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },

  stationarySubmitButtonText: {
    color: trackColors.blue,
    fontSize: 12,
    fontWeight: '900',
  },

  stationaryDeleteButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.65)',
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },

  stationaryDeleteButtonText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '900',
  },

  stationaryActionSpacer: {
    flex: 1,
    minHeight: 38,
  },

  sheetFooterRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: trackColors.background,
  },

  cancelButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panelSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelButtonText: {
    color: trackColors.white,
    fontSize: 14,
    fontWeight: '900',
  },

  saveButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 14,
    backgroundColor: trackColors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveButtonText: {
    color: trackColors.white,
    fontSize: 14,
    fontWeight: '900',
  },

  importSheetOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingTop: TRACK_SAFE_TOP + 10,
    paddingBottom: TRACK_SAFE_BOTTOM + 10,
  },

  importSheetDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.74)',
  },

  importKeyboardAvoidWrap: {
    width: '100%',
    maxWidth: 560,
    alignItems: 'center',
    justifyContent: 'center',
  },

  importModalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '86%',
    borderRadius: 22,
    position: 'relative',
    borderWidth: 1,
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.background,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },

  importModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },

  importModalTitleWrap: {
    flex: 1,
    minWidth: 0,
  },

  importModalEyebrow: {
    color: trackColors.blue,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    marginBottom: 2,
  },

  importModalTitle: {
    color: trackColors.text,
    fontSize: 23,
    lineHeight: 27,
    fontWeight: '900',
  },

  importModalDescription: {
    color: trackColors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 4,
  },

  importCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: trackColors.panelSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  importCloseText: {
    color: trackColors.text,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '500',
  },

  importSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },

  importSearchInput: {
    flex: 1,
    minHeight: 43,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panel,
    paddingHorizontal: 11,
    color: trackColors.text,
    fontSize: 13,
    fontWeight: '700',
  },

  importFilterButton: {
    minHeight: 43,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panelSoft,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  importFilterButtonActive: {
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.blueSoft,
  },

  importFilterButtonText: {
    color: trackColors.text,
    fontSize: 12,
    fontWeight: '900',
  },

  importFilterButtonTextActive: {
    color: trackColors.blue,
  },

  importFilterPanel: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panel,
    padding: 10,
    marginBottom: 10,
  },

  importFilterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },

  importFilterTitle: {
    color: trackColors.text,
    fontSize: 13,
    fontWeight: '900',
  },

  importClearFilterButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panelSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  importClearFilterText: {
    color: trackColors.muted,
    fontSize: 11,
    fontWeight: '900',
  },

  importFilterLabel: {
    color: trackColors.muted,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 6,
    marginTop: 3,
  },

  importFilterChipsRow: {
    gap: 7,
    paddingRight: 6,
    marginBottom: 5,
  },

  importFilterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.card,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  importFilterChipSelected: {
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.blueSoft,
  },

  importFilterChipText: {
    color: trackColors.muted,
    fontSize: 11,
    fontWeight: '900',
  },

  importFilterChipTextSelected: {
    color: trackColors.blue,
  },

  importTracksScroll: {
    flexGrow: 0,
    maxHeight: 520,
    marginRight: -4,
    paddingRight: 4,
  },

  importListContent: {
    paddingVertical: 2,
    paddingRight: 3,
    paddingBottom: TRACK_SAFE_BOTTOM + 22,
    gap: 8,
  },

  importLoadingWrap: {
    minHeight: 210,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  importLoadingText: {
    color: trackColors.muted,
    fontSize: 14,
    fontWeight: '800',
  },

  importEmptyWrap: {
    minHeight: 210,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  importEmptyTitle: {
    color: trackColors.text,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },

  importEmptyText: {
    color: trackColors.muted,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },

  importVehicleCard: {
    width: '100%',
    minHeight: 68,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.card,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },

  importVehicleCardSelected: {
    borderColor: trackColors.blueBorder,
    backgroundColor: 'rgba(30, 139, 255, 0.10)',
  },

  importCardBlueBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: trackColors.blue,
  },

  importCardLeft: {
    flex: 1,
    minWidth: 0,
  },

  importCardTitle: {
    color: trackColors.text,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '900',
    marginBottom: 4,
  },

  importCardSubLine: {
    color: trackColors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    marginTop: 1,
  },

  importCardBottomLine: {
    color: trackColors.mutedDark,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    marginTop: 1,
  },

  importCardMergeLine: {
    color: trackColors.blue,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    marginTop: 2,
  },

  importCardRightPill: {
    width: 82,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.bluePill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 5,
  },

  importCardRightPillSelected: {
    backgroundColor: 'rgba(30, 139, 255, 0.34)',
    borderColor: trackColors.blue,
  },

  importCardRightStyle: {
    color: trackColors.white,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
    textAlign: 'center',
  },

  importCardRightSurface: {
    color: trackColors.muted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 1,
  },

  importSubmitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 10,
  },

  importSubmitText: {
    color: trackColors.mutedDark,
    fontSize: 12,
    fontWeight: '900',
  },

  importSubmitButton: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.blueSoft,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  importSubmitButtonText: {
    color: '#B8DAFF',
    fontSize: 12,
    fontWeight: '900',
  },

  importFooterRow: {
    flexDirection: 'row',
    gap: 10,
  },

  importRefreshButton: {
    minHeight: 43,
    borderRadius: 14,
    backgroundColor: trackColors.panelSoft,
    borderWidth: 1,
    borderColor: trackColors.border,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  importRefreshText: {
    color: trackColors.white,
    fontSize: 13,
    fontWeight: '900',
  },

  importSelectedButton: {
    flex: 1,
    minHeight: 43,
    borderRadius: 14,
    backgroundColor: trackColors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  importSelectedButtonDisabled: {
    opacity: 0.48,
  },

  importSelectedText: {
    color: trackColors.white,
    fontSize: 13,
    fontWeight: '900',
  },

  importSelectedTextDisabled: {
    color: trackColors.muted,
  },

  popupScrollTab: {
    position: 'absolute',
    right: 4,
    top: 82,
    width: 8,
    zIndex: 20,
  },

  importPopupScrollTab: {
    position: 'absolute',
    right: 4,
    top: 150,
    width: 8,
    zIndex: 20,
  },

  dropdownPopupScrollTab: {
    position: 'absolute',
    right: 4,
    top: 58,
    width: 8,
    zIndex: 20,
  },

  movingScrollTabTrack: {
    alignItems: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.10)',
    borderRadius: 999,
  },

  movingScrollTabThumb: {
    width: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.68)',
  },

  mergeSheetOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  mergeSheetDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: trackColors.overlay,
  },

  mergeModalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '86%',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.background,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    position: 'relative',
  },

  mergeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: trackColors.border,
  },

  mergeTitleWrap: {
    flex: 1,
    minWidth: 0,
  },

  mergeEyebrow: {
    color: trackColors.blue,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },

  mergeTitle: {
    color: trackColors.text,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
  },

  mergeDescription: {
    color: trackColors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 5,
  },

  mergeSourceBox: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panel,
    padding: 10,
    marginTop: 10,
    marginBottom: 9,
  },

  mergeSourceLabel: {
    color: trackColors.mutedDark,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 3,
  },

  mergeSourceTitle: {
    color: trackColors.text,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '900',
  },

  mergeSourceText: {
    color: trackColors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    marginTop: 3,
  },

  mergeOptionsScroll: {
    flexGrow: 0,
    maxHeight: 330,
    marginRight: -4,
    paddingRight: 4,
  },

  mergeOptionsContent: {
    gap: 8,
    paddingBottom: 8,
  },

  mergeTrackOption: {
    width: '100%',
    minHeight: 64,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.card,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    overflow: 'hidden',
  },

  mergeTrackOptionSelected: {
    borderColor: trackColors.blueBorder,
    backgroundColor: 'rgba(30, 139, 255, 0.11)',
  },

  mergeOptionBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },

  mergeOptionTextWrap: {
    flex: 1,
    minWidth: 0,
  },

  mergeOptionTitle: {
    color: trackColors.text,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '900',
  },

  mergeOptionLocation: {
    color: trackColors.mutedDark,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    marginTop: 2,
  },

  mergeSelectPill: {
    width: 54,
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panelSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  mergeSelectPillSelected: {
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.blueSoft,
  },

  mergeSelectText: {
    color: trackColors.muted,
    fontSize: 10,
    fontWeight: '900',
  },

  mergeSelectTextSelected: {
    color: trackColors.blue,
  },

  mergeWarningBox: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.38)',
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    padding: 9,
    marginTop: 9,
  },

  mergeWarningText: {
    color: '#FDE68A',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },

  mergeFooterRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
  },

  mergeConfirmButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: trackColors.blueBorder,
    backgroundColor: trackColors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },

  mergeConfirmText: {
    color: trackColors.blue,
    fontSize: 13,
    fontWeight: '900',
  },

  mergeEmptyBox: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: trackColors.border,
    backgroundColor: trackColors.panel,
    padding: 14,
    marginTop: 4,
  },

  mergeEmptyTitle: {
    color: trackColors.text,
    fontSize: 14,
    fontWeight: '900',
  },

  mergeEmptyText: {
    color: trackColors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  disabledButton: {
    opacity: 0.55,
  },

  buttonPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.85,
  },

  bottomSpacer: {
    height: TRACK_SAFE_BOTTOM,
  },
});
