import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Returns dimensions for content that must stay between the device's system bars.
 * Uses React Native logical pixels, so it works across low/high density displays.
 */
export function useSafeAreaLayout(options = {}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const edgeGap = options.edgeGap ?? 10;
  const horizontalGap = options.horizontalGap ?? 12;

  return useMemo(() => {
    const top = Math.max(insets.top, 0);
    const bottom = Math.max(insets.bottom, 0);
    const left = Math.max(insets.left, 0);
    const right = Math.max(insets.right, 0);
    const usableWidth = Math.max(0, width - left - right);
    const usableHeight = Math.max(0, height - top - bottom);

    return {
      insets: { top, bottom, left, right },
      width,
      height,
      usableWidth,
      usableHeight,
      compact: usableWidth < 390 || usableHeight < 700,
      screenStyle: {
        paddingTop: top,
        paddingBottom: bottom,
        paddingLeft: left,
        paddingRight: right,
      },
      modalBackdropStyle: {
        paddingTop: top + edgeGap,
        paddingBottom: bottom + edgeGap,
        paddingLeft: left + horizontalGap,
        paddingRight: right + horizontalGap,
      },
      modalCardStyle: {
        width: '100%',
        maxWidth: Math.max(280, usableWidth - horizontalGap * 2),
        maxHeight: Math.max(240, usableHeight - edgeGap * 2),
        alignSelf: 'center',
      },
    };
  }, [height, width, insets.top, insets.bottom, insets.left, insets.right, edgeGap, horizontalGap]);
}
