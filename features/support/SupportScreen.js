import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import HowToUseAppModal from './components/HowToUseAppModal';

const FACEBOOK_URL = 'https://www.facebook.com/IMRCracingNrepair';
const DISCORD_URL = 'https://discord.gg/rTSYeh5cGZ';
const SUPPORT_EMAIL = 'shopimrc@gmail.com';

const SUPPORT_ACCENT = '#38bdf8';
const BG = '#070a10';
const PANEL = '#0d121c';
const CARD = '#151923';
const BORDER = 'rgba(255,255,255,0.10)';
const TEXT = '#f8fafc';
const MUTED = '#a7b0c0';

export default function SupportScreen({ navigation }) {
  const [guideVisible, setGuideVisible] = useState(false);
  const insets = useSafeAreaInsets();

  const canGoBack = true;

  const handleBack = () => {
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    try {
      if (typeof router.canGoBack === 'function' && router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    } catch (error) {
      router.replace('/');
    }
  };

  const openUrl = async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Unable to open link', url);
        return;
      }
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Unable to open link', 'Please try again from your device.');
    }
  };

  const openEmail = () => {
    const subject = encodeURIComponent('IMRC Setup Manager Support');
    openUrl(`mailto:${SUPPORT_EMAIL}?subject=${subject}`);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            disabled={!canGoBack}
            style={({ pressed }) => [
              styles.headerButton,
              !canGoBack && styles.headerButtonHidden,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.headerButtonText}>Back</Text>
          </Pressable>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Support</Text>
            <View style={styles.headerUnderline} />
          </View>

          <View style={styles.headerButtonSpacer} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={[styles.contentInner, { paddingBottom: Math.max(insets.bottom + 24, 36) }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Need help?</Text>
            <Text style={styles.heroBody}>
              Contact IMRC Racing N Repair, join the community, or reopen the app guide anytime.
            </Text>
          </View>

          <SupportCard
            title="Facebook Page"
            body="Message us, follow updates, and see IMRC announcements."
            actionLabel="Open Facebook"
            onPress={() => openUrl(FACEBOOK_URL)}
          />

          <SupportCard
            title="Discord"
            body="Join the IMRC community for setup help, race talk, and app support."
            actionLabel="Join Discord"
            onPress={() => openUrl(DISCORD_URL)}
          />

          <SupportCard
            title="Email Support"
            body={SUPPORT_EMAIL}
            actionLabel="Email Us"
            onPress={openEmail}
          />

          <SupportCard
            title="How to Use This App"
            body="Open the walkthrough again for Vehicles, Tracks, Setups, RaceDay, Cloud Sync, and Support."
            actionLabel="Open Guide"
            onPress={() => setGuideVisible(true)}
            accent
          />
        </ScrollView>

        <HowToUseAppModal
          visible={guideVisible}
          onClose={() => setGuideVisible(false)}
          title="How to Use IMRC Setup Manager 2.0"
        />
      </View>
    </SafeAreaView>
  );
}

function SupportCard({ title, body, actionLabel, onPress, accent = false }) {
  return (
    <View style={[styles.card, accent && styles.accentCard]}>
      <View style={styles.cardTextWrap}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody}>{body}</Text>
      </View>

      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.cardButton, pressed && styles.pressed]}
      >
        <Text style={styles.cardButtonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: '#090d14',
  },
  headerButton: {
    minWidth: 72,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PANEL,
    borderWidth: 1,
    borderColor: BORDER,
  },
  headerButtonHidden: {
    opacity: 0,
  },
  headerButtonText: {
    color: TEXT,
    fontSize: 13,
    fontWeight: '900',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: TEXT,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  headerUnderline: {
    marginTop: 5,
    width: 58,
    height: 3,
    borderRadius: 999,
    backgroundColor: SUPPORT_ACCENT,
  },
  headerButtonSpacer: {
    width: 72,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 14,
    paddingBottom: 24,
    gap: 11,
  },
  heroCard: {
    borderRadius: 20,
    padding: 15,
    backgroundColor: PANEL,
    borderWidth: 1,
    borderColor: BORDER,
  },
  heroTitle: {
    color: TEXT,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 5,
  },
  heroBody: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  card: {
    borderRadius: 18,
    padding: 13,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accentCard: {
    borderColor: 'rgba(56,189,248,0.35)',
    backgroundColor: 'rgba(56,189,248,0.08)',
  },
  cardTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
  },
  cardBody: {
    color: MUTED,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '650',
  },
  cardButton: {
    minWidth: 112,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SUPPORT_ACCENT,
    paddingHorizontal: 12,
  },
  cardButtonText: {
    color: '#03111a',
    fontSize: 12.5,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
});
