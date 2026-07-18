import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaLayout } from '../../../src/layout/safeAreaLayout';

const SUPPORT_ACCENT = '#38bdf8';
const CARD_BG = '#151923';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const TEXT = '#f8fafc';
const MUTED = '#a7b0c0';

const SECTIONS = [
  {
    title: 'Dashboard',
    body: 'Your home screen. Use it to jump into Vehicles, Tracks, Setups, RaceDay, Tools, and Support.',
  },
  {
    title: 'Vehicles',
    body: 'Add each RC car you race. Save the vehicle name, chassis style, transponder, and notes.',
  },
  {
    title: 'Tracks',
    body: 'Save the tracks you race at. Tracks can include location info and LiveRC links.',
  },
  {
    title: 'Setups',
    body: 'Build and save setup sheets for each vehicle and track. Use Notes, Results, and History to track changes.',
  },
  {
    title: 'RaceDay',
    body: 'Start a RaceDay, sync LiveRC event data, view race info, save notes, and track setup changes during an event.',
  },
  {
    title: 'Cloud Sync',
    body: 'When signed in, your data can sync to the cloud. Wait for the sync light to fully finish before closing the app.',
  },
  {
    title: 'Support',
    body: 'Use the Support page to contact IMRC, join Discord, email support, or reopen this guide anytime.',
  },
];

export default function HowToUseAppModal({
  visible,
  onClose,
  title = 'Welcome to IMRC Setup Manager 2.0',
  showFirstUseMessage = false,
}) {
  const { modalBackdropStyle, modalCardStyle } = useSafeAreaLayout({ edgeGap: 10, horizontalGap: 12 });

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.backdrop,
          modalBackdropStyle,
        ]}
      >
        <View style={[styles.modalCard, modalCardStyle]}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>
                This app helps manage RC vehicles, tracks, setups, race days, notes, and setup changes.
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              hitSlop={10}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          {showFirstUseMessage ? (
            <View style={styles.firstUseBox}>
              <Text style={styles.firstUseText}>
                This guide only opens automatically the first time. You can reopen it later from Support.
              </Text>
            </View>
          ) : null}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {SECTIONS.map((section) => (
              <View key={section.title} style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionBody}>{section.body}</Text>
              </View>
            ))}
          </ScrollView>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.gotItButton, pressed && styles.pressed]}
          >
            <Text style={styles.gotItText}>Got It</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 22,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    borderRadius: 22,
    backgroundColor: '#0b0f17',
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 46,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    color: TEXT,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  closeText: {
    color: TEXT,
    fontSize: 25,
    lineHeight: 28,
    fontWeight: '800',
    marginTop: -1,
  },
  firstUseBox: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(56,189,248,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.32)',
  },
  firstUseText: {
    color: '#dff6ff',
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '700',
  },
  scroll: {
    marginTop: 12,
  },
  scrollContent: {
    paddingBottom: 4,
    gap: 8,
  },
  sectionCard: {
    borderRadius: 15,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  sectionTitle: {
    color: SUPPORT_ACCENT,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 4,
  },
  sectionBody: {
    color: '#d8dee9',
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
  },
  gotItButton: {
    marginTop: 12,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SUPPORT_ACCENT,
  },
  gotItText: {
    color: '#03111a',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
});
