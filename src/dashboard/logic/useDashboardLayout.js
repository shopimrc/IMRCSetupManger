// src/dashboard/logic/useDashboardLayout.js
import { useWindowDimensions } from 'react-native';

export function useDashboardLayout() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 700;

  return {
    width,
    height,
    isLandscape,
    isTablet,
    contentPadding: isLandscape ? 14 : 16,
  };
}
