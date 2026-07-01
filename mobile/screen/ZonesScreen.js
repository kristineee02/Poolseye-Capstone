// PoolsEye — ZonesScreen
// Live geofence zone status: one card per zone with status, camera,
// proximity threshold, and a camera feed status indicator.

import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { colors, radius, spacing, typography, shadow } from '../theme/tokens';
import { zones, cameras } from '../data';
import { Tag, SectionLabel, Panel, PanelHead, StatusDot, Mono } from '../components/Primitives';
import { useLayoutInsets } from '../hooks/useLayoutInsets';

// ── Zone status config ────────────────────────────────────────────────────────
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

// ── Zone icon (shield / triangle / check) ─────────────────────────────────────
function ZoneIcon({ status, config }) {
  const symbol = status === 'alarm' ? '⚠' : status === 'warn' ? '◉' : '✓';
  return (
    <View style={[styles.zoneIcon, { backgroundColor: config.iconBg }]}>
      <Text style={[styles.zoneIconSymbol, { color: config.iconText }]}>{symbol}</Text>
    </View>
  );
}

// ── Zone card ─────────────────────────────────────────────────────────────────
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
              {zone.camera} · threshold {zone.threshold}m
            </Mono>
          </View>
          <Tag type={tagType}>{zone.statusLabel}</Tag>
        </View>

        <Text style={[styles.zoneDetail, { color: config.textMid }]}>{zone.detail}</Text>

        {/* Metadata row */}
        <View style={styles.zoneMeta}>
          <View style={styles.zoneMetaItem}>
            <Text style={styles.zoneMetaLabel}>Standby active</Text>
            <Text style={[styles.zoneMetaValue, { color: zone.activeDuringStandby ? colors.safe : colors.textTertiary }]}>
              {zone.activeDuringStandby ? 'Yes' : 'No'}
            </Text>
          </View>
          <View style={styles.zoneMetaItem}>
            <Text style={styles.zoneMetaLabel}>Camera</Text>
            <Text style={styles.zoneMetaValue}>{zone.camera}</Text>
          </View>
          <View style={styles.zoneMetaItem}>
            <Text style={styles.zoneMetaLabel}>Proximity</Text>
            <Text style={styles.zoneMetaValue}>{zone.threshold}m</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Camera feed row ───────────────────────────────────────────────────────────
function CameraRow({ camera, isLast }) {
  const statusColor = { online: colors.safe, standby: colors.warn, offline: colors.alarm }[camera.status] || colors.textTertiary;
  const statusLabel = { online: 'Online', standby: 'Standby', offline: 'Offline' }[camera.status];
  return (
    <View style={[styles.cameraRow, !isLast && styles.cameraRowBorder]}>
      <View style={[styles.cameraIndicator, { backgroundColor: statusColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.cameraName}>{camera.id} · {camera.name}</Text>
        <Mono style={{ marginTop: 2 }}>
          {camera.fps > 0 ? `${camera.fps} FPS · inference active` : 'Standby · awaiting PIR trigger'}
        </Mono>
      </View>
      <View style={[styles.cameraStatusPill, { backgroundColor: statusColor + '22', borderColor: statusColor + '44' }]}>
        <Text style={[styles.cameraStatusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
    </View>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────
function SummaryBar({ zones }) {
  const counts = zones.reduce((acc, z) => {
    acc[z.status] = (acc[z.status] || 0) + 1;
    return acc;
  }, {});
  return (
    <View style={styles.summaryBar}>
      {[
        { label: 'Alarm', count: counts.alarm || 0, color: colors.alarm, bg: colors.alarmTint },
        { label: 'Motion', count: counts.warn  || 0, color: colors.warn,  bg: colors.warnTint  },
        { label: 'Clear', count: counts.safe   || 0, color: colors.safe,  bg: colors.safeTint  },
      ].map(item => (
        <View key={item.label} style={[styles.summaryItem, { backgroundColor: item.bg }]}>
          <Text style={[styles.summaryCount, { color: item.color }]}>{item.count}</Text>
          <Text style={[styles.summaryLabel, { color: item.color }]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ZonesScreen() {
  const { tabBarClearance } = useLayoutInsets();
  const [localZones] = useState(zones);
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? localZones : localZones.filter(z => z.status === filter);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Summary counts */}
      <SummaryBar zones={localZones} />

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {[
          { key: 'all',   label: 'All zones' },
          { key: 'alarm', label: 'Alarm' },
          { key: 'warn',  label: 'Motion' },
          { key: 'safe',  label: 'Clear' },
        ].map(f => (
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

      {/* Zone cards */}
      <SectionLabel>
        {filter === 'all' ? `All zones · ${localZones.length}` : `Filtered · ${filtered.length}`}
      </SectionLabel>
      {filtered.map(zone => (
        <ZoneCard key={zone.id} zone={zone} />
      ))}

      {/* Camera status panel */}
      <SectionLabel>Camera feeds</SectionLabel>
      <Panel>
        <PanelHead title="Connected cameras" />
        {cameras.map((cam, i) => (
          <CameraRow key={cam.id} camera={cam} isLast={i === cameras.length - 1} />
        ))}
      </Panel>

      {/* Legend */}
      <View style={styles.legend}>
        {[
          { color: colors.alarm, label: 'Alarm — immediate response required' },
          { color: colors.warn,  label: 'Motion — camera inference active'    },
          { color: colors.safe,  label: 'Clear — geofence unbreached'         },
        ].map(item => (
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

  // Summary bar
  summaryBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 2,
  },
  summaryItem: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  summaryCount: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  summaryLabel: {
    fontSize: typography.xs,
    fontWeight: '600',
  },

  // Filters
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  filterChipActive: {
    backgroundColor: colors.accentTint,
    borderColor: '#BFE8EE',
  },
  filterChipText: {
    fontSize: typography.sm,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.accentStrong,
    fontWeight: '700',
  },

  // Zone card
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
    gap: 10,
  },
  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  zoneIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  zoneIconSymbol: {
    fontSize: 16,
    fontWeight: '700',
  },
  zoneName: {
    fontSize: typography.base,
    fontWeight: '700',
  },
  zoneDetail: {
    fontSize: typography.sm,
    lineHeight: 18,
  },
  zoneMeta: {
    flexDirection: 'row',
    gap: 0,
    backgroundColor: colors.bgInset,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  zoneMetaItem: {
    flex: 1,
    padding: 8,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle,
  },
  zoneMetaLabel: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    fontWeight: '500',
    marginBottom: 2,
  },
  zoneMetaValue: {
    fontSize: typography.sm,
    color: colors.textPrimary,
    fontWeight: '600',
  },

  // Camera rows
  cameraRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cameraRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  cameraIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  cameraName: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cameraStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  cameraStatusText: {
    fontSize: typography.xs,
    fontWeight: '600',
  },

  // Legend
  legend: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    gap: 8,
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
    flexShrink: 0,
  },
  legendText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
});