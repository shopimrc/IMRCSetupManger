// features/tools/ScaleCalculatorScreen.styles.js
// Compact fit-to-screen layout only for ScaleCalculatorScreen.

import { StyleSheet } from 'react-native';
import {
  TOOL_GREEN,
  TOOL_MUTED,
  TOOL_RED,
} from './ToolShared';

const CARD_DARK = 'rgba(12,18,29,0.96)';

export default StyleSheet.create({
  keyboardWrap: {
    flex: 1,
  },
  scaleScroll: {
    flex: 1,
  },
  fitContainer: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    justifyContent: 'center',
    gap: 7,
  },
  fitContainerTiny: {
    paddingHorizontal: 7,
    paddingTop: 5,
    paddingBottom: 6,
    gap: 5,
  },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },

  referenceCard: {
    paddingHorizontal: 9,
    paddingTop: 8,
    paddingBottom: 9,
    backgroundColor: 'rgba(9,14,23,0.98)',
  },
  referenceCardShort: {
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 7,
  },
  referenceCardTiny: {
    paddingHorizontal: 6,
    paddingTop: 5,
    paddingBottom: 5,
  },

  titleBand: {
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    backgroundColor: 'rgba(38,217,109,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(38,217,109,0.22)',
  },
  titleBandShort: {
    minHeight: 36,
    marginBottom: 6,
    borderRadius: 13,
  },
  titleBandTiny: {
    minHeight: 30,
    marginBottom: 4,
    borderRadius: 11,
  },
  titleBandText: {
    color: '#35ff86',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  titleBandTextShort: {
    fontSize: 18,
    lineHeight: 21,
  },
  titleBandTextTiny: {
    fontSize: 16,
    lineHeight: 18,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8,
  },
  rowShort: {
    gap: 5,
    marginBottom: 6,
  },
  rowTiny: {
    gap: 4,
    marginBottom: 4,
  },
  middleRow: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
    marginBottom: 8,
  },
  middleRowShort: {
    minHeight: 118,
    marginBottom: 6,
  },
  middleRowTiny: {
    minHeight: 100,
    marginBottom: 4,
    gap: 3,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8,
  },

  scalePad: {
    width: '31%',
    minHeight: 74,
    borderRadius: 13,
    paddingHorizontal: 7,
    paddingTop: 5,
    paddingBottom: 5,
    backgroundColor: CARD_DARK,
    borderWidth: 1,
    borderColor: 'rgba(165,177,196,0.36)',
  },
  scalePadShort: {
    minHeight: 68,
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 4,
    borderRadius: 12,
  },
  scalePadTiny: {
    minHeight: 60,
    paddingHorizontal: 5,
    paddingTop: 3,
    paddingBottom: 3,
    borderRadius: 11,
  },
  scaleLabel: {
    color: 'rgba(226,232,244,0.72)',
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  scaleLabelShort: {
    fontSize: 15,
    lineHeight: 17,
    marginBottom: 3,
  },
  scaleLabelTiny: {
    fontSize: 13,
    lineHeight: 15,
    marginBottom: 2,
  },
  scaleConvert: {
    color: TOOL_MUTED,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    textAlign: 'right',
    marginTop: 2,
  },
  scaleConvertTiny: {
    fontSize: 7,
    lineHeight: 8,
    marginTop: 1,
  },

  inputShell: {
    minHeight: 30,
    borderRadius: 9,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,244,0.16)',
  },
  inputShellShort: {
    minHeight: 28,
    paddingHorizontal: 7,
  },
  inputShellTiny: {
    minHeight: 24,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  input: {
    flex: 1,
    padding: 0,
    margin: 0,
    color: '#f3fff7',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900',
  },
  inputShort: {
    fontSize: 14,
    lineHeight: 16,
  },
  inputTiny: {
    fontSize: 12,
    lineHeight: 14,
  },
  suffix: {
    color: 'rgba(226,232,244,0.72)',
    fontSize: 10,
    fontWeight: '900',
    marginLeft: 4,
  },
  suffixTiny: {
    fontSize: 9,
    marginLeft: 3,
  },

  metricBlock: {
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBlockLarge: {
    minWidth: 86,
  },
  metricLabel: {
    color: 'rgba(226,232,244,0.66)',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  metricLabelShort: {
    fontSize: 14,
    lineHeight: 16,
  },
  metricLabelTiny: {
    fontSize: 12,
    lineHeight: 14,
  },
  metricValue: {
    color: '#35ff86',
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 1,
  },
  metricValueShort: {
    fontSize: 17,
    lineHeight: 20,
  },
  metricValueTiny: {
    fontSize: 15,
    lineHeight: 17,
  },
  metricValueLarge: {
    fontSize: 22,
    lineHeight: 25,
  },
  metricValueLargeShort: {
    fontSize: 20,
    lineHeight: 23,
  },
  metricValueLargeTiny: {
    fontSize: 17,
    lineHeight: 20,
  },
  metricValueBad: {
    color: '#ff6969',
  },
  metricSub: {
    color: 'rgba(226,232,244,0.72)',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 0,
  },
  metricSubShort: {
    fontSize: 9,
    lineHeight: 11,
  },
  metricSubTiny: {
    fontSize: 8,
    lineHeight: 9,
  },

  centerStack: {
    flex: 1,
    minHeight: 126,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerStackShort: {
    minHeight: 112,
  },
  centerStackTiny: {
    minHeight: 94,
  },
  carGlyph: {
    width: 54,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 7,
  },
  carGlyphShort: {
    width: 48,
    height: 52,
    marginTop: 5,
  },
  carGlyphTiny: {
    width: 40,
    height: 42,
    marginTop: 3,
  },
  carBody: {
    width: 35,
    height: 56,
    borderRadius: 13,
    borderWidth: 1.1,
    borderColor: 'rgba(226,232,244,0.28)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  carBodyShort: {
    width: 31,
    height: 48,
    borderRadius: 12,
  },
  carBodyTiny: {
    width: 26,
    height: 38,
    borderRadius: 10,
  },
  carAxle: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(226,232,244,0.36)',
  },
  carAxleTop: {
    top: 15,
  },
  carAxleBottom: {
    bottom: 15,
  },
  carAxleTopShort: {
    top: 13,
  },
  carAxleBottomShort: {
    bottom: 13,
  },
  carAxleTopTiny: {
    top: 10,
  },
  carAxleBottomTiny: {
    bottom: 10,
  },

  footerRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 7,
  },
  footerRowShort: {
    minHeight: 50,
    marginBottom: 5,
  },
  footerRowTiny: {
    minHeight: 44,
    marginBottom: 4,
  },
  showUnitButton: {
    minWidth: 96,
    minHeight: 36,
    borderRadius: 11,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,244,0.30)',
  },
  showUnitButtonShort: {
    minWidth: 88,
    minHeight: 32,
    borderRadius: 10,
  },
  showUnitButtonTiny: {
    minWidth: 78,
    minHeight: 28,
    borderRadius: 9,
  },
  showUnitButtonText: {
    color: '#35ff86',
    fontSize: 14,
    fontWeight: '900',
  },
  showUnitButtonTextShort: {
    fontSize: 13,
  },
  showUnitButtonTextTiny: {
    fontSize: 11,
  },
  totalBlock: {
    alignItems: 'center',
    minWidth: 104,
  },
  totalLabel: {
    color: 'rgba(226,232,244,0.66)',
    fontSize: 15,
    lineHeight: 17,
    fontWeight: '600',
  },
  totalLabelShort: {
    fontSize: 14,
    lineHeight: 15,
  },
  totalLabelTiny: {
    fontSize: 12,
    lineHeight: 13,
  },
  totalValue: {
    color: '#35ff86',
    fontSize: 22,
    lineHeight: 25,
    fontWeight: '900',
    marginTop: 0,
  },
  totalValueShort: {
    fontSize: 19,
    lineHeight: 22,
  },
  totalValueTiny: {
    fontSize: 16,
    lineHeight: 18,
  },
  totalUnit: {
    color: 'rgba(226,232,244,0.72)',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '800',
  },
  totalUnitTiny: {
    fontSize: 10,
    lineHeight: 11,
  },
  totalConvert: {
    color: 'rgba(226,232,244,0.72)',
    fontSize: 8,
    lineHeight: 9,
    fontWeight: '800',
    marginTop: 1,
  },
  totalConvertTiny: {
    fontSize: 7,
    lineHeight: 8,
  },
  totalTargetDelta: {
    color: '#35ff86',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    marginTop: 1,
    textAlign: 'center',
  },
  totalTargetDeltaTiny: {
    fontSize: 8,
    lineHeight: 9,
  },

  targetMiniRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 0,
  },
  targetMiniRowShort: {
    gap: 6,
  },
  targetMiniRowTiny: {
    gap: 5,
  },
  targetMini: {
    flex: 1,
  },
  targetLabel: {
    color: 'rgba(226,232,244,0.72)',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  targetLabelTiny: {
    fontSize: 8,
    lineHeight: 9,
    marginBottom: 2,
  },
  targetInputShell: {
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,244,0.16)',
  },
  targetInputShellShort: {
    minHeight: 30,
    paddingHorizontal: 8,
  },
  targetInputShellTiny: {
    minHeight: 26,
    paddingHorizontal: 7,
    borderRadius: 8,
  },

  clearButton: {
    minHeight: 34,
    marginTop: 0,
  },
  clearButtonShort: {
    minHeight: 31,
  },
  clearButtonTiny: {
    minHeight: 28,
  },

  badText: {
    color: TOOL_RED,
  },
});
