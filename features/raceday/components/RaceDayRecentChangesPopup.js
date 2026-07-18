import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import RaceDayPopup from './RaceDayPopup';
import { getRaceDayNotesBundle } from '../lib/raceDayNotesStorage';
import { getVehicleDisplayName, normalizeId } from '../lib/raceDayModel';
import { raceDayColors, raceDayStyles } from '../styles/raceDayStyles';

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function displayValue(value) {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function ChangeRow({ change }) {
  return (
    <View style={localStyles.changeRow}>
      <View style={raceDayStyles.rowBetween}>
        <Text style={localStyles.changeField} numberOfLines={1}>{change.fieldLabel || change.fieldPath || 'Setup Change'}</Text>
        <Text style={localStyles.changeTime} numberOfLines={1}>{formatTime(change.createdAt)}</Text>
      </View>

      {change.setupName ? <Text style={localStyles.setupName} numberOfLines={1}>{change.setupName}</Text> : null}

      <View style={localStyles.valueRow}>
        <Text style={localStyles.oldValue} numberOfLines={2}>{displayValue(change.oldValue)}</Text>
        <Text style={localStyles.arrow}>→</Text>
        <Text style={localStyles.newValue} numberOfLines={2}>{displayValue(change.newValue)}</Text>
      </View>
    </View>
  );
}

function VehicleChangeSection({ vehicleName, changes = [] }) {
  return (
    <View style={localStyles.vehicleCard}>
      <View style={localStyles.accent} />
      <View style={raceDayStyles.rowBetween}>
        <Text style={localStyles.vehicleTitle} numberOfLines={1}>{vehicleName || 'Vehicle'}</Text>
        <Text style={raceDayStyles.cardMetaRight}>{changes.length} change{changes.length === 1 ? '' : 's'}</Text>
      </View>
      <View style={localStyles.changesWrap}>
        {changes.map((change) => <ChangeRow key={change.id || `${change.fieldPath}_${change.createdAt}`} change={change} />)}
      </View>
    </View>
  );
}

export default function RaceDayRecentChangesPopup({ visible, raceDay, vehicles = [], onClose }) {
  const raceDayId = raceDay?.id || raceDay?.raceDayId;
  const [loading, setLoading] = useState(false);
  const [changes, setChanges] = useState([]);

  const vehicleNameMap = useMemo(() => {
    const map = new Map();
    vehicles.forEach((vehicle) => {
      const id = normalizeId(vehicle.id || vehicle.vehicleId);
      if (id) map.set(id, getVehicleDisplayName(vehicle));
    });
    return map;
  }, [vehicles]);

  const groupedChanges = useMemo(() => {
    const grouped = new Map();
    changes.forEach((change) => {
      const id = normalizeId(change.vehicleId) || 'unknown';
      const vehicleName = vehicleNameMap.get(id) || change.vehicleName || 'Vehicle';
      if (!grouped.has(id)) grouped.set(id, { vehicleId: id, vehicleName, changes: [] });
      grouped.get(id).changes.push(change);
    });
    return Array.from(grouped.values());
  }, [changes, vehicleNameMap]);

  const load = useCallback(async () => {
    if (!visible || !raceDayId) return;
    setLoading(true);
    try {
      const bundle = await getRaceDayNotesBundle(raceDayId);
      setChanges(bundle.changes || []);
    } finally {
      setLoading(false);
    }
  }, [visible, raceDayId]);

  useEffect(() => { load(); }, [load]);

  return (
    <RaceDayPopup
      visible={visible}
      title="Recent Changes"
      subtitle="Setup changes by vehicle"
      onClose={onClose}
      centered
      showScrollIndicator
      contentContainerStyle={localStyles.body}
    >
      {loading ? (
        <View style={raceDayStyles.empty}><ActivityIndicator /></View>
      ) : groupedChanges.length ? (
        <>
          <View style={localStyles.summaryRow}>
            <Text style={localStyles.summaryText}>{changes.length} total setup change{changes.length === 1 ? '' : 's'}</Text>
            <Text style={raceDayStyles.cardMetaRight}>{groupedChanges.length} vehicle{groupedChanges.length === 1 ? '' : 's'}</Text>
          </View>
          {groupedChanges.map((group) => (
            <VehicleChangeSection key={group.vehicleId} vehicleName={group.vehicleName} changes={group.changes} />
          ))}
        </>
      ) : (
        <View style={localStyles.emptyBox}>
          <Text style={raceDayStyles.emptyText}>No setup changes have been recorded for this RaceDay yet.</Text>
          <Text style={raceDayStyles.cardSub}>Changes will show here after the Setups save logic calls the RaceDay setup change recorder while RaceDay is active.</Text>
        </View>
      )}
    </RaceDayPopup>
  );
}

export { RaceDayRecentChangesPopup };

const localStyles = StyleSheet.create({
  body: {
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 2,
  },
  summaryText: {
    color: raceDayColors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  vehicleCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: raceDayColors.card,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    borderRadius: 15,
    padding: 11,
    paddingLeft: 15,
    marginBottom: 8,
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: raceDayColors.accent,
  },
  vehicleTitle: {
    color: raceDayColors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  changesWrap: {
    marginTop: 8,
    gap: 7,
  },
  changeRow: {
    backgroundColor: raceDayColors.cardAlt,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    borderRadius: 12,
    padding: 9,
  },
  changeField: {
    flex: 1,
    color: raceDayColors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  changeTime: {
    color: raceDayColors.faint,
    fontSize: 10,
    fontWeight: '800',
  },
  setupName: {
    color: raceDayColors.muted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 7,
  },
  oldValue: {
    flex: 1,
    color: '#FCA5A5',
    fontSize: 11,
    fontWeight: '800',
    backgroundColor: raceDayColors.dangerSoft,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  arrow: {
    color: raceDayColors.faint,
    fontSize: 12,
    fontWeight: '900',
  },
  newValue: {
    flex: 1,
    color: '#86EFAC',
    fontSize: 11,
    fontWeight: '800',
    backgroundColor: raceDayColors.accentSoft,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  emptyBox: {
    backgroundColor: raceDayColors.card,
    borderWidth: 1,
    borderColor: raceDayColors.border,
    borderRadius: 15,
    padding: 14,
    alignItems: 'center',
  },
});
