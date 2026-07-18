// src/dashboard/dashboard.styles.js
import { StyleSheet } from 'react-native';
import { AppColors } from '../theme/colors';

export const dashboardStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.backgroundSoft },
  container: { flex: 1, padding: 16 },
  scrollContent: { paddingBottom: 28 },
  landscapeRoot: { flex: 1, flexDirection: 'row', gap: 18, padding: 12, overflow: 'hidden' },
  landscapeLeft: { flex: 0.43, minWidth: 0, justifyContent: 'space-between' },
  landscapeLeftScroll: { flex: 1 },
  landscapeLeftContent: { paddingBottom: 4 },
  landscapeControlsBlock: { marginTop: 2 },
  landscapeStatsWrap: { flex: 3 },
  landscapeRaceDayWrap: { flex: 1.35 },
  landscapeBelowLogo: { marginTop: 4 },
  landscapeFooterBlock: { paddingTop: 6 },
  landscapeRight: { flex: 0.57, minHeight: 0 },
  landscapeRightContent: { paddingBottom: 0, flexGrow: 1 },

  header: { height: 86, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  bannerImage: { width: '100%', height: '100%' },
  fallbackLogo: { color: AppColors.text, fontSize: 34, fontWeight: '900', letterSpacing: 1 },
  fallbackLogoSub: { color: AppColors.text, fontSize: 13, fontWeight: '900', letterSpacing: 3 },
  authPill: { position: 'absolute', top: 8, left: 8, zIndex: 10, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.58)' },
  authText: { color: '#D1D5DB', fontSize: 13, fontWeight: '900' },
  authPillTouchableFix: { zIndex: 100, elevation: 100, minHeight: 32, minWidth: 72, alignItems: 'center', justifyContent: 'center' },
  statusDot: { position: 'absolute', top: 10, right: 10, zIndex: 10, width: 10, height: 10, borderRadius: 5 },

  statsRow: { flexDirection: 'row', gap: 9, marginBottom: 10 },
  statCard: { flex: 1, minHeight: 58, borderRadius: 14, padding: 8, backgroundColor: AppColors.card, borderWidth: 1, borderColor: AppColors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  statTextBlock: { flex: 1, minWidth: 0 },
  statLabel: { color: '#B6C1D4', fontSize: 10.5, fontWeight: '800' },
  statValue: { color: AppColors.text, fontSize: 20, fontWeight: '900', marginTop: 1 },
  statIconBubble: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statIcon: { fontSize: 16 },

  raceDayButton: { borderRadius: 18, borderWidth: 1.5, borderColor: AppColors.raceDay, backgroundColor: AppColors.card, marginBottom: 12, overflow: 'hidden' },
  raceDayGradient: { minHeight: 70, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  raceDayIcon: { fontSize: 22, marginRight: 10 },
  raceDayText: { color: AppColors.text, fontSize: 16, fontWeight: '900', flex: 1 },
  raceDayArrow: { color: AppColors.raceDay, fontSize: 28, fontWeight: '900' },

  recentCard: { borderRadius: 16, borderWidth: 1.5, borderColor: AppColors.danger, padding: 14, backgroundColor: AppColors.card, marginBottom: 14, minHeight: 124 },
  recentHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  recentTitle: { color: AppColors.danger, fontSize: 18, fontWeight: '900' },
  viewMoreText: { color: '#93C5FD', fontSize: 12, fontWeight: '900' },
  recentEmpty: { color: AppColors.mutedText, fontSize: 12, fontWeight: '800' },
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  recentCar: { flex: 0.5, color: '#E5E7EB', fontSize: 12.5, fontWeight: '900', paddingRight: 6 },
  recentWhat: { flex: 1, color: '#D1D5DB', fontSize: 12.5, fontWeight: '800', paddingRight: 6 },
  recentChangeValue: { flex: 0.55, color: AppColors.valueGreen, fontSize: 12.5, fontWeight: '900', textAlign: 'right' },

  sponsorCard: { borderRadius: 16, borderWidth: 1.5, borderColor: AppColors.sponsor, padding: 8, backgroundColor: AppColors.card, alignItems: 'center', marginBottom: 0, justifyContent: 'center', minHeight: 0, overflow: 'hidden' },
  sponsorImageWrap: { width: '100%', alignItems: 'center', justifyContent: 'center', minHeight: 0 },
  sponsorImage: { width: '100%', height: 220, maxHeight: 260 },
  sponsorPlaceholder: { width: '100%', height: 220, backgroundColor: '#081224', borderWidth: 1, borderColor: 'rgba(59,130,246,0.35)', alignItems: 'center', justifyContent: 'center' },
  sponsorPlaceholderText: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  sponsorLabel: { position: 'absolute', top: 9, left: 12, zIndex: 5, color: AppColors.sponsor, fontSize: 14, fontWeight: '900', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  sponsorName: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', marginTop: 8, textAlign: 'center' },

  bottomActions: { flexDirection: 'row', gap: 12, marginTop: 6 },
  toolsButton: { borderTopColor: AppColors.track, borderTopWidth: 2 },
  supportButton: { borderTopColor: AppColors.raceDay, borderTopWidth: 2 },
  bottomButton: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: AppColors.border, backgroundColor: AppColors.card, alignItems: 'center', justifyContent: 'center' },
  bottomButtonText: { color: AppColors.text, fontSize: 15, fontWeight: '900' },
  footerText: { color: '#6B7280', fontSize: 11, textAlign: 'center', marginTop: 6 },

  portraitRootFixed: {
    flex: 1,
    position: 'relative',
  },

  portraitMainScroll: {
    flex: 1,
  },

  portraitMainContent: {
    padding: 16,
    paddingBottom: 112,
    flexGrow: 0,
  },

  portraitBottomSpacer: {
    height: 4,
  },

  portraitBottomFixed: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 8,
    backgroundColor: AppColors.backgroundSoft,
    paddingTop: 6,
  },

  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.68)' },
  modalWrap: { flex: 1, justifyContent: 'center', padding: 18 },
  modalCard: { backgroundColor: '#0B1220', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: 'rgba(77,166,255,0.25)', maxHeight: '85%' },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  modalTitle: { color: AppColors.text, fontSize: 18, fontWeight: '900' },
  modalCloseBtn: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { color: AppColors.text, fontSize: 16, fontWeight: '900' },
  modalSub: { color: '#A9B7D0', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  modalScroll: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#0C1524', padding: 10, marginBottom: 12 },
  modalButton: { borderRadius: 14, borderWidth: 1, borderColor: AppColors.border, backgroundColor: AppColors.card, paddingVertical: 13, paddingHorizontal: 14, marginTop: 10 },
  modalButtonText: { color: AppColors.text, fontWeight: '900', fontSize: 15, textAlign: 'center' },
  modalButtonGreen: { borderColor: AppColors.raceDay },
  modalButtonBlue: { borderColor: AppColors.track },
  modalButtonRed: { borderColor: AppColors.danger },
  sessionRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  sessionTitle: { color: AppColors.text, fontWeight: '900', fontSize: 14 },
  sessionMeta: { color: '#A9B7D0', marginTop: 3, fontSize: 12 },
  sessionActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
});
