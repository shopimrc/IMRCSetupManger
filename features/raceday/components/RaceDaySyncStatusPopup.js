import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import RaceDayPopup from './RaceDayPopup';
import { raceDayColors, raceDayStyles } from '../styles/raceDayStyles';

function getProgressKey(update = {}) {
  return String(update.vehicleId || update.vehicleName || update.key || update.phase || 'sync');
}

export function mergeSyncProgress(previous = [], update = {}) {
  const key = getProgressKey(update);
  const nextItem = {
    ...(previous.find((item) => getProgressKey(item) === key) || {}),
    ...update,
    key,
    updatedAt: update.updatedAt || new Date().toISOString(),
  };

  const found = previous.some((item) => getProgressKey(item) === key);
  if (!found) return [...previous, nextItem];
  return previous.map((item) => (getProgressKey(item) === key ? nextItem : item));
}

function getStatusColor(status = '') {
  if (status === 'done' || status === 'matched' || status === 'complete') return raceDayColors.accent;
  if (status === 'failed' || status === 'error') return raceDayColors.danger;
  return raceDayColors.blue;
}

function getStatusLabel(item = {}) {
  if (item.status === 'done' || item.status === 'matched' || item.status === 'complete') return 'OK';
  if (item.status === 'failed' || item.status === 'error') return 'Check';
  return 'Syncing';
}

function cleanDriverDisplay(value = '') {
  return String(value || '')
    .replace(/^\s*#?\d+\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function SyncProgressRow({ item }) {
  const statusColor = getStatusColor(item.status);
  const isWorking = item.status === 'working' || item.status === 'starting';
  const driverName = cleanDriverDisplay(item.driverName || item.nickname || item.fullName || '');
  const racesComplete = Number.isFinite(item.racesComplete) ? item.racesComplete : (Number.isFinite(item.runsFound) ? item.runsFound : 0);

  return (
    <View style={raceDayStyles.syncProgressCardCompact}>
      <View style={[raceDayStyles.cardAccent, { backgroundColor: statusColor }]} />
      <View style={raceDayStyles.rowBetween}>
        <View style={raceDayStyles.flex1}>
          <Text style={raceDayStyles.cardTitle} numberOfLines={1}>{item.vehicleName || 'Vehicle'}</Text>
        </View>
        <View style={[raceDayStyles.syncStatusPill, { borderColor: statusColor }]}> 
          {isWorking ? <ActivityIndicator size="small" /> : <Text style={[raceDayStyles.syncStatusPillText, { color: statusColor }]}>{getStatusLabel(item)}</Text>}
        </View>
      </View>

      <View style={raceDayStyles.syncMetaGridCompact}>
        <View style={raceDayStyles.syncMetaBoxCompact}>
          <Text style={raceDayStyles.statLabel}>DRIVER</Text>
          <Text style={raceDayStyles.syncMetaValue} numberOfLines={1}>{driverName || 'Not matched'}</Text>
        </View>
        <View style={raceDayStyles.syncMetaBoxCompact}>
          <Text style={raceDayStyles.statLabel}>CLASS</Text>
          <Text style={raceDayStyles.syncMetaValue} numberOfLines={1}>{item.className || 'Not matched'}</Text>
        </View>
        <View style={raceDayStyles.syncMetaBoxCompact}>
          <Text style={raceDayStyles.statLabel}>RACES COMPLETE</Text>
          <Text style={raceDayStyles.syncMetaValue}>{racesComplete}</Text>
        </View>
      </View>
    </View>
  );
}

export function RaceDaySyncStatusList({ items = [] }) {
  if (!items.length) {
    return (
      <View style={raceDayStyles.empty}>
        <Text style={raceDayStyles.emptyText}>Waiting to start LiveRC sync.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {items.map((item) => <SyncProgressRow key={getProgressKey(item)} item={item} />)}
    </View>
  );
}

export default function RaceDaySyncStatusPopup({
  visible,
  syncing = false,
  progress = [],
  summary = '',
  onClose,
}) {
  const statusText = summary || (syncing ? '' : 'Complete.');

  return (
    <RaceDayPopup
      visible={visible}
      title="LiveRC Sync"
      onClose={onClose}
      centered
      showScrollIndicator
      contentContainerStyle={{ paddingBottom: 20 }}
    >
      {statusText ? <Text style={raceDayStyles.syncCompleteText}>{statusText}</Text> : null}
      <RaceDaySyncStatusList items={progress} />
      {!syncing ? (
        <TouchableOpacity style={[raceDayStyles.primaryButton, { marginTop: 12 }]} onPress={onClose} activeOpacity={0.82}>
          <Text style={raceDayStyles.primaryButtonText}>Done</Text>
        </TouchableOpacity>
      ) : null}
    </RaceDayPopup>
  );
}

export { RaceDaySyncStatusPopup };
