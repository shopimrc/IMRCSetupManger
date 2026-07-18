// src/dashboard/components/RecentChangesCard.js
import { Text, TouchableOpacity, View } from 'react-native';
import { dashboardStyles as styles } from '../dashboard.styles';

const MAX_CHANGES_ON_DASHBOARD = 2;

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '--';
  return String(value);
}

function displayText(value, fallback = '--') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function normalizeRow(row = {}) {
  return {
    ...row,
    vehicleName: displayText(
      row.vehicleName || row.car || row.setupName || row.name,
      'Unknown Vehicle'
    ),
    fieldLabel: displayText(
      row.fieldLabel || row.label || row.what || row.fieldPath || row.field || row.path,
      'Change'
    ),
    beforeValue: displayValue(
      row.beforeValue ?? row.oldValue ?? row.fromValue ?? row.fromV ?? row.from
    ),
    afterValue: displayValue(
      row.afterValue ?? row.newValue ?? row.toValue ?? row.toV ?? row.to
    ),
  };
}

function groupLimitedRows(rows = []) {
  const visibleRows = rows.slice(0, MAX_CHANGES_ON_DASHBOARD).map(normalizeRow);
  const groups = [];
  const byVehicle = new Map();

  visibleRows.forEach((row) => {
    const key = row.vehicleName;

    if (!byVehicle.has(key)) {
      const group = {
        vehicleName: key,
        rows: [],
        newestTs: Number(row.ts || Date.parse(row.createdAt || '')) || 0,
      };
      byVehicle.set(key, group);
      groups.push(group);
    }

    const group = byVehicle.get(key);
    group.rows.push(row);
    group.newestTs = Math.max(
      group.newestTs,
      Number(row.ts || Date.parse(row.createdAt || '')) || 0
    );
  });

  return groups.sort((a, b) => Number(b.newestTs || 0) - Number(a.newestTs || 0));
}

export default function RecentChangesCard({ rows = [], onViewMore, style, titleStyle, rowStyle }) {
  const groups = groupLimitedRows(rows);
  const hasMore = rows.length > MAX_CHANGES_ON_DASHBOARD;

  return (
    <View style={[styles.recentCard, style]}>
      <View style={styles.recentHeaderRow}>
        <Text style={[styles.recentTitle, titleStyle]}>Recent Changes</Text>
        {hasMore ? (
          <TouchableOpacity onPress={onViewMore} activeOpacity={0.85}>
            <Text style={styles.viewMoreText}>View more</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!groups.length ? (
        <Text style={styles.recentEmpty}>No recent changes yet.</Text>
      ) : groups.map((group, groupIdx) => (
        <View
          key={`${group.vehicleName}-${groupIdx}`}
          style={[
            {
              paddingTop: groupIdx === 0 ? 0 : 5,
              marginTop: groupIdx === 0 ? 0 : 4,
              borderTopWidth: groupIdx === 0 ? 0 : 1,
              borderTopColor: 'rgba(255,255,255,0.08)',
            },
            rowStyle,
          ]}
        >
          <Text
            style={[
              styles.recentCar,
              {
                flex: 0,
                width: '100%',
                fontSize: 12,
                color: '#FFFFFF',
                marginBottom: 3,
              },
            ]}
            numberOfLines={1}
          >
            {group.vehicleName}
          </Text>

          {group.rows.map((r, idx) => (
            <View
              key={`${r.id || r.ts || r.createdAt || idx}`}
              style={{
                marginLeft: 12,
                paddingLeft: 8,
                borderLeftWidth: 2,
                borderLeftColor: 'rgba(34,197,94,0.42)',
                paddingVertical: 1,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  style={[
                    styles.recentWhat,
                    {
                      flex: 1,
                      fontSize: 11,
                      color: '#93C5FD',
                      fontWeight: '900',
                      paddingRight: 8,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {r.fieldLabel}
                </Text>

                <Text
                  style={[
                    styles.recentChangeValue,
                    {
                      flex: 0.95,
                      fontSize: 11,
                      color: '#6EE7B7',
                      textAlign: 'right',
                      fontWeight: '900',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {r.beforeValue} → {r.afterValue}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
