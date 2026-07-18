import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaLayout } from '../../../src/layout/safeAreaLayout';
import { raceDayStyles } from '../styles/raceDayStyles';

export default function RaceDayPopup({
  visible,
  title,
  subtitle,
  onClose,
  children,
  centered = false,
  keyboardAware = false,
  showScrollIndicator = false,
  contentContainerStyle,
  bodyScroll = true,
}) {
  const { insets, modalBackdropStyle, modalCardStyle } = useSafeAreaLayout({ edgeGap: 10, horizontalGap: 12 });
  const Wrapper = keyboardAware ? KeyboardAvoidingView : View;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Wrapper
        style={[
          raceDayStyles.modalBackdrop,
          centered ? raceDayStyles.modalBackdropCenter : raceDayStyles.modalBackdropBottom,
          modalBackdropStyle,
        ]}
        behavior={keyboardAware ? (Platform.OS === 'ios' ? 'padding' : 'height') : undefined}
        keyboardVerticalOffset={keyboardAware ? Math.max(insets.top + 8, 12) : 0}
      >
        <View
          style={[
            raceDayStyles.modalCard,
            centered && raceDayStyles.centeredModalCard,
            modalCardStyle,
          ]}
        >
          <View style={raceDayStyles.rowBetween}>
            <View style={raceDayStyles.flex1}>
              <Text style={raceDayStyles.modalTitle}>{title}</Text>
              {subtitle ? <Text style={raceDayStyles.modalSub}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity style={raceDayStyles.smallButton} onPress={onClose} activeOpacity={0.82}>
              <Text style={raceDayStyles.smallButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
          {bodyScroll ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={showScrollIndicator}
              contentContainerStyle={[{ paddingTop: 14, paddingBottom: 12 }, contentContainerStyle]}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[{ paddingTop: 14, paddingBottom: 12 }, contentContainerStyle]}>
              {children}
            </View>
          )}
        </View>
      </Wrapper>
    </Modal>
  );
}

export { RaceDayPopup };
