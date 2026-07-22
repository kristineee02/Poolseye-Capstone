// PoolsEye — ZonesScreen
// Live geofence zone status for Yellow / Orange / Red (single CCTV)

import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { colors, radius, spacing, typography, shadow } from '../theme/tokens';
import { zones } from '../data';
import { Tag, SectionLabel, Mono } from '../components/Primitives';
import { useLayoutInsets } from '../hooks/useLayoutInsets';

const ZONE_CONFIG = {
  alarm: {
    bg:       colors.alarmTint,
    border:   colors.alarmBorder,
    stripe:   colors.alarm,
    iconBg:   'rgba(214,54,74,0.12)',
    iconText: colors.alarm,
    textDark: colors.alarmDark,
    textMid:  colors.alarmMid,
  },
  warn: {
    bg:       colors.warnTint,
    border:   colors.warnBorder,
    stripe:   colors.warn,
    iconBg:   'rgba(182,121,10,0.12)',
    iconText: colors.warn,
    textDark: '#5C3A00',
    textMid:  '#8A5A08',
  },
  safe: {
    bg:       colors.bgPanel,
    border:   colors.borderSubtle,
    stripe:   colors.safe,
    iconBg:   colors.safeTint,
    iconText: colors.safe,
    textDark: colors.textPrimary,
    textMid:  colors.textSecondary,
  },
};

function ZoneIcon({ status, config }) {
  const symbol = status === 'alarm' ? '⚠' : status === 'warn' ? '◉' : '✓';
  return (
    <View style={[styles.zoneIcon, { backgroundColor: config.iconBg }]}>
      <Text style={[styles.zoneIconSymbol, { color: config.iconText }]}>{symbol}</Text>
    </View>
  );
}

function ZoneCard({ zone }) {
  const config = ZONE_CONFIG[zone.status] || ZONE_CONFIG.safe;
  const tagType = zone.status === 'safe' ? 'safe' : zone.status === 'alarm' ? 'alarm' : 'warn';

  return (
    <View style={[styles.zoneCard, { backgroundColor: config.bg, borderColor: config.border }]}>
      <View style={[styles.zoneStripe, { backgroundColor: config.stripe }]} />
      <View style={styles.zoneInner}>
        <View style={styles.zoneHeader}>
          <ZoneIcon status={zone.status} config={config} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.zoneName, { color: config.textDark }]}>{zone.name}</Text>
            <Mono style={{ color: config.textMid, marginTop: 2 }}>
              {zone.typeLabel}
              {zone.threshold != null ? ` · threshold ${zone.threshold}m` : ''}
            </Mono>
          </View>
          <Tag type={tagType}>{zone.statusLabel}</Tag>
        </View>

        <Text style={[styles.zoneDetail, { color: config.textMid }]}>{zone.detail}</Text>
      </View>
    </View>
  );
}

function SummaryBar({ zones: zoneList }) {
  const counts = zoneList.reduce((acc, z) => {
    acc[z.status] = (acc[z.status] || 0) + 1;
    return acc;
  }, {});
  return (
    <View style={styles.summaryBar}>
      {[
        { label: 'Alarm', count: counts.alarm || 0, color: colors.alarm, bg: colors.alarmTint },
        { label: 'Warn',  count: counts.warn  || 0, color: colors.warn,  bg: colors.warnTint  },
        { label: 'Clear', count: counts.safe  || 0, color: colors.safe,  bg: colors.safeTint  },
      ].map((item) => (
        <View key={item.label} style={[styles.summaryItem, { backgroundColor: item.bg }]}>
          <Text style={[styles.summaryCount, { color: item.color }]}>{item.count}</Text>
          <Text style={[styles.summaryLabel, { color: item.color }]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ZonesScreen() {
  const { tabBarClearance } = useLayoutInsets();
  const [localZones] = useState(zones);
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? localZones : localZones.filter((z) => z.status === filter);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
      showsVerticalScrollIndicator={false}
    >
      <SummaryBar zones={localZones} />

      <View style={styles.filterRow}>
        {[
          { key: 'all',   label: 'All' },
          { key: 'alarm', label: 'Alarm' },
          { key: 'warn',  label: 'Warning' },
          { key: 'safe',  label: 'Clear' },
        ].map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <SectionLabel>
        {filter === 'all' ? `Geofence zones · ${localZones.length}` : `Filtered · ${filtered.length}`}
      </SectionLabel>
      {filtered.map((zone) => (
        <ZoneCard key={zone.id} zone={zone} />
      ))}

      <View style={styles.legend}>
        {[
          { color: '#E6B800', label: 'Yellow Zone — general warning' },
          { color: '#E67E22', label: 'Orange Boundary — transition line' },
          { color: '#D6364A', label: 'Red Zone — critical danger' },
        ].map((item) => (
          <View key={item.label} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  content: {
    padding: spacing.md,
    gap: 10,
  },
  summaryBar: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryItem: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  summaryCount: {
    fontSize: 20,
    fontWeight: '800',
  },
  summaryLabel: {
    fontSize: typography.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  filterChipActive: {
    backgroundColor: colors.accentTint,
    borderColor: colors.accent,
  },
  filterChipText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: colors.accentStrong,
  },
  zoneCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    ...shadow.sm,
  },
  zoneStripe: {
    width: 3,
  },
  zoneInner: {
    flex: 1,
    padding: 13,
    gap: 8,
  },
  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  zoneIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneIconSymbol: {
    fontSize: 14,
    fontWeight: '700',
  },
  zoneName: {
    fontSize: typography.base,
    fontWeight: '700',
  },
  zoneDetail: {
    fontSize: typography.sm,
    lineHeight: 18,
    fontWeight: '500',
  },
  legend: {
    marginTop: 6,
    gap: 6,
    paddingHorizontal: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: typography.xs,
    color: colors.textSecondary,
  },
});
