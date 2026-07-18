import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaLayout } from '../../../src/layout/safeAreaLayout';
import {
  clearSetupsMigrationProgress,
  subscribeSetupsMigrationProgress,
} from '../lib/setupMigrationProgress';

const PURPLE = '#8B5CF6';
const GREEN = '#22C55E';
const RED = '#EF4444';
const BG = '#050608';
const CARD = '#11131A';
const BORDER = '#2A2F3A';
const TEXT = '#F8FAFC';
const MUTED = '#A8B0C2';

function phaseLabel(phase) {
  const p = String(phase || '').toLowerCase();
  if (p === 'downloaded' || p === 'downloading') return 'Downloaded';
  if (p === 'migrating' || p === 'migrated' || p === 'checked') return 'Migrating';
  if (p === 'uploading' || p === 'uploaded') return 'Uploading';
  if (p === 'done') return 'Complete';
  if (p === 'error') return 'Needs Attention';
  return 'Preparing';
}

function Step({ label, active, done }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: done ? GREEN : active ? PURPLE : BORDER,
          backgroundColor: done ? GREEN : active ? 'rgba(139,92,246,0.28)' : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {done ? <Text style={{ color: BG, fontSize: 10, fontWeight: '900' }}>✓</Text> : null}
      </View>
      <Text style={{ color: active || done ? TEXT : MUTED, fontSize: 10, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

export default function SetupsMigrationProgressPopup() {
  const [progress, setProgress] = useState(null);

  useEffect(() => subscribeSetupsMigrationProgress(setProgress), []);

  const phase = String(progress?.phase || '').toLowerCase();
  const visible = !!progress?.active;
  const isDone = phase === 'done';
  const isError = phase === 'error';
  const showSpinner = visible && !isDone && !isError;

  const stepState = useMemo(() => {
    const downloadDone = ['downloaded', 'migrating', 'migrated', 'checked', 'uploading', 'uploaded', 'done'].includes(phase);
    const migrateDone = ['migrated', 'checked', 'uploading', 'uploaded', 'done'].includes(phase);
    const uploadDone = ['uploaded', 'done'].includes(phase);
    return {
      downloadDone,
      migrateDone,
      uploadDone,
      downloading: ['starting', 'downloading', 'downloaded'].includes(phase),
      migrating: ['migrating', 'migrated', 'checked'].includes(phase),
      uploading: ['uploading', 'uploaded'].includes(phase),
    };
  }, [phase]);

  const counts = progress?.counts || {};
  const { modalBackdropStyle, modalCardStyle } = useSafeAreaLayout({ edgeGap: 10, horizontalGap: 12 });

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={clearSetupsMigrationProgress}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.58)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          ...modalBackdropStyle,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 390,
            ...modalCardStyle,
            backgroundColor: CARD,
            borderColor: isError ? RED : PURPLE,
            borderWidth: 1,
            borderRadius: 20,
            padding: 16,
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 16,
            elevation: 8,
          }}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 15,
                backgroundColor: isDone ? 'rgba(34,197,94,0.16)' : 'rgba(139,92,246,0.16)',
                borderWidth: 1,
                borderColor: isDone ? GREEN : isError ? RED : PURPLE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {showSpinner ? <ActivityIndicator color={PURPLE} /> : <Text style={{ color: isError ? RED : isDone ? GREEN : PURPLE, fontWeight: '900', fontSize: 18 }}>{isError ? '!' : '✓'}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: PURPLE, fontSize: 10, letterSpacing: 1.4, fontWeight: '900' }}>IMRC SETUP MANAGER</Text>
              <Text style={{ color: TEXT, fontSize: 19, fontWeight: '900', marginTop: 2 }}>{phaseLabel(phase)}</Text>
            </View>
          </View>

          <Text style={{ color: MUTED, fontSize: 13, lineHeight: 18, marginTop: 12 }}>
            {progress?.message || 'Preparing setup migration...'}
          </Text>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <Step label="Download" active={stepState.downloading} done={stepState.downloadDone} />
            <Step label="Migrate" active={stepState.migrating} done={stepState.migrateDone} />
            <Step label="Upload" active={stepState.uploading} done={stepState.uploadDone} />
          </View>

          <View
            style={{
              marginTop: 14,
              padding: 10,
              borderRadius: 14,
              backgroundColor: '#090B10',
              borderWidth: 1,
              borderColor: BORDER,
              gap: 4,
            }}
          >
            <Text style={{ color: TEXT, fontSize: 12, fontWeight: '800' }}>
              Setups: {Number(progress?.migratedSetups ?? counts.setups ?? 0)}
            </Text>
            <Text style={{ color: MUTED, fontSize: 11, fontWeight: '700' }}>
              History versions: {Number(counts.setupVersions ?? progress?.historyKeys ?? 0)} · Tracks: {Number(counts.tracks ?? 0)} · Cars: {Number(counts.vehicles ?? 0)}
            </Text>
            {!!progress?.detail ? <Text style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>{String(progress.detail)}</Text> : null}
          </View>

          {isError ? (
            <Pressable
              onPress={clearSetupsMigrationProgress}
              style={{
                marginTop: 14,
                alignSelf: 'flex-end',
                backgroundColor: PURPLE,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 14,
              }}
            >
              <Text style={{ color: TEXT, fontSize: 13, fontWeight: '900' }}>OK</Text>
            </Pressable>
          ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
