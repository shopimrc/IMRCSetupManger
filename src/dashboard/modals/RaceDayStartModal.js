// src/dashboard/modals/RaceDayStartModal.js
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaLayout } from '../../layout/safeAreaLayout';
import { dashboardStyles as styles } from '../dashboard.styles';

export default function RaceDayStartModal({ visible, onClose, onNewEvent, onPastEvents }) {
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
            <Text style={styles.modalTitle}>Start Race Day</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}><Text style={styles.modalCloseText}>✕</Text></TouchableOpacity>
          </View>
          <Text style={styles.modalSub}>Choose whether you want to create a new Race Day or view past events.</Text>
          <TouchableOpacity style={[styles.modalButton, styles.modalButtonGreen]} activeOpacity={0.9} onPress={onNewEvent}><Text style={styles.modalButtonText}>New Event</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.modalButton, styles.modalButtonBlue]} activeOpacity={0.9} onPress={onPastEvents}><Text style={styles.modalButtonText}>Past Events</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
