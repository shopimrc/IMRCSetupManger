// src/dashboard/logic/useImportIntent.js
import { useEffect } from 'react';
import * as ExpoLinking from 'expo-linking';

export function useImportIntent({ router } = {}) {
  useEffect(() => {
    async function checkInitialURL() {
      const url = await ExpoLinking.getInitialURL();
      if (!url) return;
      if (url.startsWith('file://') || url.startsWith('content://') || url.toLowerCase().endsWith('.imrc')) {
        router?.push('/setups');
      }
    }
    checkInitialURL();
  }, [router]);
}
