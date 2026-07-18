import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { isIncomingFileOpenUri, queueIncomingImrcImport } from '../lib/setupFileTransfer';

/**
 * Root-level hook for IMRC setup file opens.
 *
 * Use once from app/_layout.js so opening/sharing a .imrc file into the app
 * queues the file and sends the user to the Setups screen for car/track review.
 */
export default function useIncomingIMRC() {
  const router = useRouter();
  const handledUrisRef = useRef(new Set());

  useEffect(() => {
    let mounted = true;

    async function handleUrl(url) {
      if (!mounted || !url || !isIncomingFileOpenUri(url) || handledUrisRef.current.has(url)) return;
      handledUrisRef.current.add(url);

      try {
        const queued = await queueIncomingImrcImport(url);
        if (queued) {
          router.replace({ pathname: '/setups', params: { imrcImport: String(Date.now()) } });
        }
      } catch (error) {
        console.warn('Unable to queue incoming IMRC setup file', error);
      }
    }

    // Initial URL is only handled here at the app root. The Setups page itself
    // should not read Linking.getInitialURL(), otherwise Android can retry the
    // same old content:// intent every time the user opens Setups.
    Linking.getInitialURL().then(handleUrl).catch((error) => {
      console.warn('Unable to read initial IMRC setup URL', error);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, [router]);
}
