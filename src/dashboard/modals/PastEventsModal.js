// src/dashboard/modals/PastEventsModal.js
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaLayout } from '../../layout/safeAreaLayout';
import { dashboardStyles as styles } from '../dashboard.styles';
import { sessionPrettyTime } from '../logic/formatters';

export default function PastEventsModal({ visible, trackChoices = [], sessionChoices = [], selectedTrackId, onClose, onBack, onSelectTrack, onOpenSession }) {
  const { modalBackdropStyle, modalCardStyle } = useSafeAreaLayout({ edgeGap: 10, horizontalGap: 12 });
  const selectedTrack = (trackChoices || []).find((t) => String(t?.trackId || '') === String(selectedTrackId || ''));
  const closeOrBack = selectedTrackId ? onBack : onClose;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeOrBack}>
      <Pressable style={styles.modalOverlay} onPress={closeOrBack} />
      <View
        style={[
          styles.modalWrap,
          modalBackdropStyle,
        ]}
      >
        <View style={[styles.modalCard, modalCardStyle]}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>{selectedTrackId ? 'Past Sessions' : 'Select Track'}</Text>
            <TouchableOpacity onPress={closeOrBack} style={styles.modalCloseBtn}><Text style={styles.modalCloseText}>{selectedTrackId ? '‹' : '✕'}</Text></TouchableOpacity>
          </View>
          {!selectedTrackId ? (
            <>
              <Text style={styles.modalSub}>Choose a track first, then the saved sessions for that track will appear.</Text>
              <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 10 }}>
                {!trackChoices.length ? <Text style={styles.sessionMeta}>No saved Race Days found.</Text> : trackChoices.map((t, i) => (
                  <TouchableOpacity key={`${t.trackId}-${i}`} style={[styles.modalButton, styles.modalButtonGreen]} activeOpacity={0.9} onPress={() => onSelectTrack?.(t.trackId)}>
                    <Text style={styles.modalButtonText}>{t.trackLabel}</Text>
                    <Text style={[styles.sessionMeta, { textAlign: 'center' }]}>{Array.isArray(t.sessions) ? t.sessions.length : 0} saved session{Array.isArray(t.sessions) && t.sessions.length === 1 ? '' : 's'}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              <Text style={styles.modalSub}>Showing saved sessions for {selectedTrack?.trackLabel || 'this track'}.</Text>
              <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 10 }}>
                {!sessionChoices.length ? <Text style={styles.sessionMeta}>No saved sessions found for this track.</Text> : sessionChoices.map((s, i) => {
                  const sid = String(s?.id || s?.sessionId || s?.raceDayId || '').trim() || `session-${i}`;
                  const eventName = String(s?.eventName || s?.selectedEventName || s?.liveRcEventName || s?.event?.name || '').trim();
                  const carCount = Array.isArray(s?.vehicleIds) ? s.vehicleIds.length : 0;
                  return (
                    <View key={`${sid}-${i}`} style={styles.sessionRow}>
                      <Text style={styles.sessionTitle} numberOfLines={1}>{eventName || `Session ${sid}`}</Text>
                      <Text style={styles.sessionMeta}>Started: {sessionPrettyTime(s?.startedAtMs || s?.createdAtMs)}</Text>
                      <Text style={styles.sessionMeta}>Ended: {sessionPrettyTime(s?.endedAtMs || s?.updatedAtMs)} · Cars: {carCount}</Text>
                      <TouchableOpacity style={[styles.modalButton, styles.modalButtonGreen]} activeOpacity={0.9} onPress={() => onOpenSession?.(s)}><Text style={styles.modalButtonText}>Open Session</Text></TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
