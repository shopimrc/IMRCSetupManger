// src/dashboard/modals/ActiveRaceDayModal.js
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaLayout } from '../../layout/safeAreaLayout';
import { dashboardStyles as styles } from '../dashboard.styles';
import { sessionPrettyTime } from '../logic/formatters';

export default function ActiveRaceDayModal({ visible, choices = [], onClose, onContinue, onEnd }) {
  const { modalBackdropStyle, modalCardStyle } = useSafeAreaLayout({ edgeGap: 10, horizontalGap: 12 });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View
        style={[
          styles.modalWrap,
          modalBackdropStyle,
        ]}
      >
        <View style={[styles.modalCard, modalCardStyle]}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Active Race Day Found</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}><Text style={styles.modalCloseText}>✕</Text></TouchableOpacity>
          </View>
          <Text style={styles.modalSub}>You already have an ACTIVE Race Day session. Continue it or end it first.</Text>
          <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 10 }}>
            {choices.map((s, i) => {
              const sid = String(s?.id || s?.sessionId || '').trim();
              const carCount = Array.isArray(s?.vehicleIds) ? s.vehicleIds.length : 0;
              return (
                <View key={`${sid}-${i}`} style={styles.sessionRow}>
                  <Text style={styles.sessionTitle}>Session {sid}</Text>
                  <Text style={styles.sessionMeta}>Started: {sessionPrettyTime(s?.startedAtMs || s?.createdAtMs)}</Text>
                  <Text style={styles.sessionMeta}>Track: {String(s?.trackId || '—')} · Cars: {carCount}</Text>
                  <View style={styles.sessionActions}>
                    <TouchableOpacity style={[styles.modalButton, styles.modalButtonGreen, { flex: 1, marginTop: 0 }]} onPress={() => onContinue?.(s)}><Text style={styles.modalButtonText}>Continue</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.modalButton, styles.modalButtonRed, { flex: 1, marginTop: 0 }]} onPress={() => onEnd?.(sid)}><Text style={styles.modalButtonText}>End</Text></TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
