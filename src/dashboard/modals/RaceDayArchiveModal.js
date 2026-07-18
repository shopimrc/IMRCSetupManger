// src/dashboard/modals/RaceDayArchiveModal.js
import { ScrollView, Text, TouchableOpacity, View, Modal } from 'react-native';
import { useSafeAreaLayout } from '../../layout/safeAreaLayout';
import { dashboardStyles as styles } from '../dashboard.styles';

const RACE_GREEN = '#22C55E';
const BLUE = '#2F8CFF';
const CARD_BG = '#111827';
const CARD_BORDER = 'rgba(47,140,255,0.55)';
const TEXT = '#FFFFFF';
const MUTED = '#94A3B8';

function fmtDate(ms) {
  const n = Number(ms || 0);
  if (!n) return '--';
  try {
    return new Date(n).toLocaleString([], {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '--';
  }
}

function textValue(v, fallback = '--') {
  if (v === null || v === undefined || v === '') return fallback;
  return String(v);
}

function groupChangesByVehicle(changes = []) {
  const groups = [];
  const map = new Map();

  changes.forEach((change) => {
    const vehicleName = textValue(change.vehicleName || change.car || change.setupName, 'Unknown Vehicle');
    if (!map.has(vehicleName)) {
      const group = { vehicleName, rows: [] };
      map.set(vehicleName, group);
      groups.push(group);
    }
    map.get(vehicleName).rows.push(change);
  });

  return groups;
}

function SectionTitle({ children }) {
  return (
    <Text style={{ color: TEXT, fontWeight: '900', fontSize: 15, marginTop: 12, marginBottom: 7 }}>
      {children}
    </Text>
  );
}

function EmptyText({ children }) {
  return <Text style={{ color: MUTED, fontWeight: '700', fontSize: 12 }}>{children}</Text>;
}

function ArchiveCard({ children, onPress, danger = false, rightBadge = null }) {
  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      activeOpacity={0.88}
      onPress={onPress}
      style={{
        backgroundColor: CARD_BG,
        borderColor: danger ? '#EF4444' : CARD_BORDER,
        borderWidth: 1,
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
        borderLeftWidth: 5,
        borderLeftColor: danger ? '#EF4444' : BLUE,
        minHeight: 68,
        justifyContent: 'center',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>{children}</View>
        {rightBadge ? (
          <View
            style={{
              minWidth: 68,
              borderWidth: 1,
              borderColor: BLUE,
              backgroundColor: 'rgba(47,140,255,0.18)',
              borderRadius: 11,
              paddingHorizontal: 8,
              paddingVertical: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {rightBadge}
          </View>
        ) : null}
      </View>
    </Wrapper>
  );
}

function BadgeText({ top, bottom }) {
  return (
    <>
      <Text style={{ color: '#BFD7FF', fontSize: 9, fontWeight: '900', textAlign: 'center' }}>{top}</Text>
      <Text style={{ color: TEXT, fontSize: 12, fontWeight: '900', textAlign: 'center', marginTop: 1 }}>{bottom}</Text>
    </>
  );
}

export default function RaceDayArchiveModal({
  visible,
  trackChoices = [],
  sessionChoices = [],
  selectedTrackId = '',
  detail = null,
  loading = false,
  onClose,
  onBack,
  onSelectTrack,
  onOpenSession,
  onCloseDetail,
}) {
  const { modalBackdropStyle, modalCardStyle } = useSafeAreaLayout({ edgeGap: 10, horizontalGap: 12 });
  const showingDetail = !!detail;
  const showingSessions = !!selectedTrackId && !showingDetail;

  const session = detail?.session || {};
  const notes = Array.isArray(detail?.notes) ? detail.notes : [];
  const changes = Array.isArray(detail?.changes) ? detail.changes : [];
  const runs = Array.isArray(detail?.runs) ? detail.runs : [];
  const comparisons = Array.isArray(detail?.comparisons) ? detail.comparisons : [];
  const changeGroups = groupChangesByVehicle(changes);

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={showingDetail ? onCloseDetail : onClose}>
      <View
        style={[
          styles.modalOverlay,
          { alignItems: 'center', justifyContent: 'center' },
          modalBackdropStyle,
        ]}
      >
        <View
          style={[
            styles.modalCard,
            modalCardStyle,
            {
              maxWidth: 520,
              alignSelf: 'center',
              borderRadius: 20,
              borderWidth: 1.5,
              borderColor: 'rgba(34,197,94,0.65)',
              backgroundColor: '#0B111C',
              padding: 14,
            },
          ]}
        >
          <Text style={[styles.modalTitle, { textAlign: 'center', color: TEXT }]}>
            {showingDetail ? 'RaceDay Archive' : showingSessions ? 'Select Event' : 'Select Track'}
          </Text>

          {loading ? (
            <Text style={[styles.modalSub, { textAlign: 'center' }]}>Loading RaceDay archive...</Text>
          ) : showingDetail ? (
            <>
              <Text style={[styles.modalSub, { textAlign: 'center', marginBottom: 8 }]}>
                {textValue(session.trackName || session.track?.name, 'Unknown Track')}
                {session.eventName || session.selectedEventName ? ` · ${session.eventName || session.selectedEventName}` : ''}
              </Text>

              {detail?.error ? (
                <View style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderColor: '#EF4444', borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 8 }}>
                  <Text style={{ color: '#FCA5A5', fontWeight: '900', fontSize: 12, textAlign: 'center' }}>{textValue(detail.error)}</Text>
                </View>
              ) : null}

              <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                <ArchiveCard
                  rightBadge={<BadgeText top="VEHICLES" bottom={String(Array.isArray(session.vehicleIds) ? session.vehicleIds.length : Number(session.vehicleCount || 0))} />}
                >
                  <Text style={{ color: TEXT, fontWeight: '900', fontSize: 14 }}>Session Details</Text>
                  <Text style={{ color: MUTED, fontSize: 11, fontWeight: '800', marginTop: 4 }}>Start: {fmtDate(session.startedAtMs || session.createdAtMs)}</Text>
                  <Text style={{ color: MUTED, fontSize: 11, fontWeight: '800' }}>End: {fmtDate(session.endedAtMs || session.updatedAtMs)}</Text>
                  <Text style={{ color: '#CBD5E1', fontSize: 11, fontWeight: '800' }} numberOfLines={1}>
                    LiveRC: {textValue(session.eventName || session.selectedEventName || session.liveRcEventName)}
                  </Text>
                </ArchiveCard>

                <SectionTitle>Current vs Event Setup</SectionTitle>
                {!comparisons.length ? <EmptyText>No setup comparison data found for this RaceDay.</EmptyText> : comparisons.map((c, idx) => (
                  <ArchiveCard key={c.id || idx} danger={!!c.changed}>
                    <Text style={{ color: TEXT, fontWeight: '900', fontSize: 12 }} numberOfLines={1}>{textValue(c.vehicleName)}</Text>
                    <Text style={{ color: '#93C5FD', fontWeight: '900', fontSize: 11, marginTop: 3 }} numberOfLines={1}>{textValue(c.fieldLabel)}</Text>
                    <Text style={{ color: c.changed ? '#FCA5A5' : '#6EE7B7', fontWeight: '900', fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      Event: {textValue(c.eventValue)}   Current: {textValue(c.currentValue)}
                    </Text>
                  </ArchiveCard>
                ))}

                <SectionTitle>Notes ({notes.length})</SectionTitle>
                {!notes.length ? <EmptyText>No notes saved for this RaceDay.</EmptyText> : notes.map((n, idx) => (
                  <ArchiveCard key={n.id || idx}>
                    <Text style={{ color: '#E5E7EB', fontSize: 12, fontWeight: '800' }}>{textValue(n.text || n.note || n.body)}</Text>
                    {!!n.createdAtMs && <Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{fmtDate(n.createdAtMs)}</Text>}
                  </ArchiveCard>
                ))}

                <SectionTitle>Setup Changes ({changes.length})</SectionTitle>
                {!changeGroups.length ? <EmptyText>No setup changes recorded for this RaceDay.</EmptyText> : changeGroups.map((group, idx) => (
                  <ArchiveCard key={`${group.vehicleName}-${idx}`}>
                    <Text style={{ color: TEXT, fontWeight: '900', fontSize: 12, marginBottom: 4 }}>{group.vehicleName}</Text>
                    {group.rows.map((c, cIdx) => (
                      <View
                        key={c.id || cIdx}
                        style={{
                          marginLeft: 8,
                          paddingLeft: 8,
                          borderLeftWidth: 2,
                          borderLeftColor: 'rgba(34,197,94,0.45)',
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ color: '#93C5FD', fontWeight: '900', fontSize: 11 }} numberOfLines={1}>{textValue(c.fieldLabel || c.label || c.fieldPath, 'Change')}</Text>
                        <Text style={{ color: '#6EE7B7', fontWeight: '900', fontSize: 11 }} numberOfLines={1}>{textValue(c.beforeValue)} → {textValue(c.afterValue)}</Text>
                      </View>
                    ))}
                  </ArchiveCard>
                ))}

                <SectionTitle>Race Runs / Results ({runs.length})</SectionTitle>
                {!runs.length ? <EmptyText>No synced race runs/results saved for this RaceDay.</EmptyText> : runs.map((r, idx) => (
                  <ArchiveCard key={r.id || idx}>
                    <Text style={{ color: TEXT, fontSize: 12, fontWeight: '900' }} numberOfLines={1}>{textValue(r.round || r.roundName || r.raceName || r.name, 'Race Run')}</Text>
                    <Text style={{ color: '#CBD5E1', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                      {textValue(r.className || r.class || r.raceClass, 'Class')} · Pos {textValue(r.position || r.pos)} · {textValue(r.laps)} / {textValue(r.time)}
                    </Text>
                    {!!(r.fastLap || r.fastestLap) && <Text style={{ color: '#6EE7B7', fontSize: 11, fontWeight: '800' }}>Fast: {r.fastLap || r.fastestLap}</Text>}
                  </ArchiveCard>
                ))}
              </ScrollView>

              <View style={styles.sessionActions}>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonBlue, { flex: 1 }]} onPress={onCloseDetail} activeOpacity={0.9}>
                  <Text style={styles.modalButtonText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, { flex: 1 }]} onPress={onClose} activeOpacity={0.9}>
                  <Text style={styles.modalButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : showingSessions ? (
            <>
              <Text style={[styles.modalSub, { textAlign: 'center', marginBottom: 8 }]}>Select the ended RaceDay event to review.</Text>
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {sessionChoices.map((s) => (
                  <ArchiveCard
                    key={s.id || s.sessionId || s.raceDayId}
                    onPress={() => onOpenSession?.(s)}
                    rightBadge={<BadgeText top="RUNS" bottom={String(Number(s.runsCount || 0))} />}
                  >
                    <Text style={styles.sessionTitle} numberOfLines={1}>{textValue(s.eventName || s.selectedEventName, 'RaceDay Event')}</Text>
                    <Text style={styles.sessionMeta} numberOfLines={2}>{fmtDate(s.endedAtMs || s.updatedAtMs || s.startedAtMs)}</Text>
                    <Text style={styles.sessionMeta} numberOfLines={1}>Vehicles {Number(s.vehicleCount || s.vehicleIds?.length || 0)} · Notes {Number(s.notesCount || 0)} · Changes {Number(s.changesCount || 0)}</Text>
                  </ArchiveCard>
                ))}
              </ScrollView>
              <View style={styles.sessionActions}>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonBlue, { flex: 1 }]} onPress={onBack} activeOpacity={0.9}>
                  <Text style={styles.modalButtonText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, { flex: 1 }]} onPress={onClose} activeOpacity={0.9}>
                  <Text style={styles.modalButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.modalSub, { textAlign: 'center', marginBottom: 8 }]}>Select a track with ended RaceDay events.</Text>
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {!trackChoices.length ? <EmptyText>No ended RaceDay sessions found yet.</EmptyText> : trackChoices.map((t) => (
                  <ArchiveCard
                    key={t.trackId}
                    onPress={() => onSelectTrack?.(t.trackId)}
                    rightBadge={<BadgeText top="EVENTS" bottom={String(t.sessions?.length || 0)} />}
                  >
                    <Text style={[styles.sessionTitle, { letterSpacing: 1.8 }]} numberOfLines={1}>{textValue(t.trackLabel, 'Unknown Track')}</Text>
                    <Text style={styles.sessionMeta}>{t.sessions?.length || 0} ended event(s)</Text>
                  </ArchiveCard>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.modalButton} onPress={onClose} activeOpacity={0.9}>
                <Text style={styles.modalButtonText}>Close</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
