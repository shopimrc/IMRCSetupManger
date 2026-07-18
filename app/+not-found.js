import React, { useEffect } from 'react';
import { Linking, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { isIncomingFileOpenUri, queueIncomingImrcImport } from '../features/setups/lib/setupFileTransfer';

/**
 * Handles Android file-open/deep-link fall-throughs.
 *
 * Some .imrc opens arrive as content:// or file:// URLs. Expo Router can see
 * those as unmatched routes before the Setups screen loads. This catch-all
 * queues the file and moves the user to /setups, where the import review popup
 * asks which car and track to import into.
 */
export default function NotFoundRoute() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    async function routeSafely() {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (mounted && initialUrl && isIncomingFileOpenUri(initialUrl)) {
          const queued = await queueIncomingImrcImport(initialUrl);
          if (queued) {
            router.replace({ pathname: '/setups', params: { imrcImport: String(Date.now()) } });
            return;
          }
        }
      } catch (error) {
        console.warn('Unable to handle incoming IMRC file route', error);
      }

      if (mounted) {
        router.replace('/');
      }
    }

    routeSafely();
    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: '#05060a', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: '#ffffff', fontWeight: '800' }}>Opening IMRC...</Text>
    </View>
  );
}
