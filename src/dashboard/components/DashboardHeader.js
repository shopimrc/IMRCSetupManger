// src/dashboard/components/DashboardHeader.js
// ✅ DROP-IN FILE
// Keeps Dashboard sign-in tappable in dev and production builds.
// Important: the logo image is pointerEvents="none" and the auth touch target is rendered last.

import { Image, Text, TouchableOpacity, View } from 'react-native';
import { dashboardStyles as styles } from '../dashboard.styles';

export default function DashboardHeader({
  userName,
  statusDotColor,
  onAuthPress,
  onAuthLongPress,
  style,
  imageStyle,
  authPillStyle,
}) {
  const dotColor = statusDotColor || '#6B7280';

  return (
    <View style={[styles.header, style]}>
      <Image
        pointerEvents="none"
        source={require('../../../assets/banner-logo.png')}
        style={[styles.bannerImage, imageStyle]}
        resizeMode="contain"
      />

      <View pointerEvents="none" style={[styles.statusDot, { backgroundColor: dotColor }]} />

      <TouchableOpacity
        hitSlop={{ top: 22, bottom: 22, left: 22, right: 22 }}
        delayLongPress={450}
        onPress={onAuthPress}
        onLongPress={onAuthLongPress}
        style={[styles.authPill, styles.authPillTouchableFix, authPillStyle]}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={userName ? 'Sync account' : 'Sign in'}
      >
        <Text style={styles.authText}>{userName || 'Sign In'}</Text>
      </TouchableOpacity>
    </View>
  );
}
