// features/tracks/components/TrackTypeDropdown.js

import React, { useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import PopupScrollTab from './PopupScrollTab';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TRACK_TYPE_OPTIONS } from '../constants/trackTypes';
import { trackStyles as styles } from '../styles/trackStyles';

export default function TrackTypeDropdown({
  value,
  onChange,
  error,
  placeholder = 'Select Track Type',
}) {
  const [open, setOpen] = useState(false);
  const [scrollVisibleHeight, setScrollVisibleHeight] = useState(0);
  const [scrollContentHeight, setScrollContentHeight] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const selectedLabel = value || placeholder;

  const dropdownSafeOverlay = {
    paddingTop: Math.max(insets.top + 10, 22),
    paddingBottom: Math.max(insets.bottom + 10, 22),
  };

  function selectOption(option) {
    onChange?.(option);
    setOpen(false);
  }

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.dropdownButton,
          error && styles.inputError,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text
          style={[
            styles.dropdownButtonText,
            !value && styles.dropdownPlaceholderText,
          ]}
          numberOfLines={1}
        >
          {selectedLabel}
        </Text>
        <Text style={styles.dropdownChevron}>▾</Text>
      </Pressable>

      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={[styles.dropdownOverlay, dropdownSafeOverlay]}
          onPress={() => setOpen(false)}
        >
          <Pressable style={styles.dropdownModal} onPress={() => {}}>

            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Track Type</Text>
              <Pressable
                onPress={() => setOpen(false)}
                style={({ pressed }) => [
                  styles.dropdownCloseButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.dropdownCloseText}>Close</Text>
              </Pressable>
            </View>

            <PopupScrollTab
              scrollY={scrollY}
              visibleHeight={scrollVisibleHeight}
              contentHeight={scrollContentHeight}
              style={styles.dropdownPopupScrollTab}
            />

            <Animated.ScrollView
              style={styles.dropdownList}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onLayout={event => setScrollVisibleHeight(event.nativeEvent.layout.height)}
              onContentSizeChange={(_, contentHeight) => setScrollContentHeight(contentHeight)}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true }
              )}
            >
              {TRACK_TYPE_OPTIONS.map(option => {
                const selected = option === value;

                return (
                  <Pressable
                    key={option}
                    onPress={() => selectOption(option)}
                    style={({ pressed }) => [
                      styles.dropdownOption,
                      selected && styles.dropdownOptionSelected,
                      pressed && styles.dropdownOptionPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        selected && styles.dropdownOptionTextSelected,
                      ]}
                    >
                      {option}
                    </Text>
                    {selected ? <Text style={styles.dropdownCheck}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </Animated.ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
