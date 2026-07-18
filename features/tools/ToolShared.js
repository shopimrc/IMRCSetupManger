// features/tools/ToolShared.js
// Compact IMRC-style dark UI pieces for Tools.

import React from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export const TOOL_GREEN = '#26d96d';
export const TOOL_GREEN_DARK = '#0f2d1d';
export const TOOL_BG = '#07090c';
export const TOOL_PANEL = '#0d1117';
export const TOOL_CARD = '#10161d';
export const TOOL_CARD_2 = '#141c24';
export const TOOL_LINE = 'rgba(38,217,109,0.30)';
export const TOOL_LINE_SOFT = 'rgba(255,255,255,0.08)';
export const TOOL_TEXT = '#f4fff8';
export const TOOL_MUTED = 'rgba(244,255,248,0.66)';
export const TOOL_WARN = '#ffd66b';
export const TOOL_RED = '#ff6868';

export function goBack(props) {
  if (typeof props?.onBack === 'function') props.onBack();
  else if (props?.router?.back) props.router.back();
  else if (props?.navigation?.goBack) props.navigation.goBack();
}

export function navigateTo(props, routeName) {
  if (typeof props?.onNavigate === 'function') props.onNavigate(routeName);
  else if (props?.router?.push) props.router.push(routeName);
  else if (props?.navigation?.navigate) props.navigation.navigate(routeName);
}

export function cleanNumber(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

export function fmt(value, places = 2, fallback = '—') {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n.toFixed(places).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

export function ToolScaffold({ title, subtitle, children, onBack, right, scroll = true, contentStyle }) {
  const insets = useSafeAreaInsets();
  const Container = scroll ? ScrollView : View;
  const [keyboardOpen, setKeyboardOpen] = React.useState(false);

  React.useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      setKeyboardOpen(true);
    });
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setKeyboardOpen(false);
    });
    return () => {
      try { showSub.remove(); } catch {}
      try { hideSub.remove(); } catch {}
    };
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
      >
        <View style={styles.headerOuter}>
          <View style={styles.headerAccent} />
          <View style={styles.header}>
            <Pressable style={({ pressed }) => [styles.backButton, pressed && styles.pressed]} onPress={onBack}>
              <Text style={styles.backText}>‹ Back</Text>
            </Pressable>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
            </View>
            <View style={styles.headerRight}>{right}</View>
          </View>
        </View>

        <Container
          style={styles.flex}
          contentContainerStyle={scroll ? [
            styles.content,
            { paddingBottom: Math.max(24, insets.bottom + 12) + (keyboardOpen ? 180 : 0) },
            contentStyle,
          ] : undefined}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </Container>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function ToolCard({ children, style, compact = false }) {
  return <View style={[styles.card, compact && styles.cardCompact, style]}>{children}</View>;
}

export function ToolSectionTitle({ children, right }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle} numberOfLines={1}>{children}</Text>
      {!!right && <Text style={styles.sectionRight} numberOfLines={1}>{right}</Text>}
    </View>
  );
}

export function ToolButton({ label, onPress, secondary = false, danger = false, disabled = false, style, textStyle }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        danger && styles.dangerButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText, danger && styles.dangerButtonText, disabled && styles.disabledText, textStyle]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function ToolTinyButton({ label, onPress, disabled = false, style }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [styles.tinyButton, disabled && styles.disabledButton, pressed && !disabled && styles.pressed, style]}
    >
      <Text style={[styles.tinyButtonText, disabled && styles.disabledText]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function ToolInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'decimal-pad',
  suffix,
  autoCapitalize = 'none',
  multiline = false,
}) {
  return (
    <View style={styles.inputWrap}>
      {!!label && <Text style={styles.label} numberOfLines={1}>{label}</Text>}
      <View style={[styles.inputRow, multiline && styles.inputRowMultiline]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(244,255,248,0.30)"
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          style={[styles.input, multiline && styles.inputMultiline]}
        />
        {!!suffix && <Text style={styles.suffix} numberOfLines={1}>{suffix}</Text>}
      </View>
    </View>
  );
}

export function Segmented({ options, value, onChange, style }) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.segment, selected && styles.segmentSelected, pressed && styles.segmentPressed]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]} numberOfLines={1}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ResultRow({ label, value, big = false, note, valueStyle }) {
  return (
    <View style={[styles.resultRow, big && styles.resultRowBig]}>
      <Text style={[styles.resultLabel, big && styles.resultBigLabel]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.resultValue, big && styles.resultBigValue, valueStyle]} numberOfLines={1}>{value}</Text>
      {!!note && <Text style={styles.resultNote}>{note}</Text>}
    </View>
  );
}

export function InfoText({ children, warning = false, style, numberOfLines }) {
  return <Text style={[styles.infoText, warning && styles.infoWarning, style]} numberOfLines={numberOfLines}>{children}</Text>;
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: TOOL_BG },
  headerOuter: {
    backgroundColor: TOOL_PANEL,
    borderBottomWidth: 1,
    borderBottomColor: TOOL_LINE_SOFT,
  },
  headerAccent: {
    height: 2,
    backgroundColor: TOOL_GREEN,
    opacity: 0.95,
  },
  header: {
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOOL_PANEL,
  },
  backButton: {
    width: 70,
    minHeight: 34,
    borderRadius: 11,
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: 'rgba(38,217,109,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(38,217,109,0.16)',
  },
  backText: {
    color: TOOL_GREEN,
    fontSize: 13,
    fontWeight: '900',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  title: {
    color: TOOL_TEXT,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.1,
  },
  subtitle: {
    color: TOOL_MUTED,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 0,
  },
  headerRight: {
    width: 70,
    alignItems: 'flex-end',
  },
  content: {
    paddingHorizontal: 10,
    paddingTop: 9,
    gap: 8,
  },
  card: {
    backgroundColor: TOOL_CARD,
    borderColor: TOOL_LINE_SOFT,
    borderWidth: 1,
    borderRadius: 13,
    padding: 9,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  cardCompact: {
    padding: 8,
    borderRadius: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  sectionTitle: {
    flex: 1,
    color: TOOL_TEXT,
    fontWeight: '900',
    fontSize: 14,
  },
  sectionRight: {
    color: TOOL_GREEN,
    fontWeight: '900',
    fontSize: 11,
  },
  button: {
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: TOOL_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  secondaryButton: {
    backgroundColor: 'rgba(38,217,109,0.10)',
    borderColor: TOOL_LINE,
  },
  dangerButton: {
    backgroundColor: 'rgba(255,94,94,0.13)',
    borderColor: 'rgba(255,94,94,0.33)',
  },
  disabledButton: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.90 },
  buttonText: {
    color: '#04110a',
    fontWeight: '900',
    fontSize: 13,
  },
  secondaryButtonText: { color: TOOL_GREEN },
  dangerButtonText: { color: '#ff8585' },
  disabledText: { color: TOOL_MUTED },
  tinyButton: {
    minHeight: 30,
    borderRadius: 10,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(38,217,109,0.10)',
    borderWidth: 1,
    borderColor: TOOL_LINE,
  },
  tinyButtonText: {
    color: TOOL_GREEN,
    fontWeight: '900',
    fontSize: 12,
  },
  inputWrap: { marginBottom: 7 },
  label: {
    color: TOOL_MUTED,
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },
  inputRow: {
    minHeight: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(244,255,248,0.13)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
  },
  inputRowMultiline: {
    alignItems: 'flex-start',
    minHeight: 58,
    paddingTop: 5,
  },
  input: {
    flex: 1,
    color: TOOL_TEXT,
    fontWeight: '800',
    fontSize: 15,
    paddingVertical: 6,
  },
  inputMultiline: { minHeight: 46, textAlignVertical: 'top' },
  suffix: {
    color: TOOL_MUTED,
    fontWeight: '900',
    marginLeft: 6,
    fontSize: 12,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(244,255,248,0.10)',
    padding: 2,
    marginBottom: 7,
    gap: 2,
  },
  segment: {
    flex: 1,
    minHeight: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  segmentSelected: { backgroundColor: TOOL_GREEN },
  segmentPressed: { opacity: 0.86 },
  segmentText: {
    color: TOOL_MUTED,
    fontWeight: '900',
    fontSize: 11,
  },
  segmentTextSelected: { color: '#04110a' },
  resultRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(244,255,248,0.07)',
  },
  resultRowBig: { paddingVertical: 7 },
  resultLabel: {
    color: TOOL_MUTED,
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  resultValue: {
    color: TOOL_TEXT,
    fontSize: 16,
    fontWeight: '900',
  },
  resultBigLabel: { color: TOOL_GREEN },
  resultBigValue: {
    color: TOOL_GREEN,
    fontSize: 26,
    letterSpacing: -0.25,
  },
  resultNote: {
    color: TOOL_MUTED,
    fontWeight: '700',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  infoText: {
    color: TOOL_MUTED,
    fontWeight: '700',
    lineHeight: 15,
    fontSize: 11,
  },
  infoWarning: { color: TOOL_WARN },
});
