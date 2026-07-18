import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HowToUseAppModal from './HowToUseAppModal';

export const HOW_TO_USE_SEEN_KEY = '@imrc_how_to_use_seen_v1';

export default function FirstUseHowToUseGate() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;

    const checkFirstUse = async () => {
      try {
        const seen = await AsyncStorage.getItem(HOW_TO_USE_SEEN_KEY);
        if (alive && seen !== '1') {
          setVisible(true);
        }
      } catch (error) {
        // If storage fails, still show the guide once for this app session.
        if (alive) {
          setVisible(true);
        }
      }
    };

    checkFirstUse();

    return () => {
      alive = false;
    };
  }, []);

  const closeAndRemember = async () => {
    setVisible(false);
    try {
      await AsyncStorage.setItem(HOW_TO_USE_SEEN_KEY, '1');
    } catch (error) {
      // No-op. The modal is already closed for this session.
    }
  };

  return (
    <HowToUseAppModal
      visible={visible}
      onClose={closeAndRemember}
      showFirstUseMessage
    />
  );
}
