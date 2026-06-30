// PoolsEye — LogScreen
// Full chronological event log matching the web HistoryPage/EventLogPanel.
// Supports filter by type, shows confidence bars, and groups by date.

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  SectionList,
} from 'react-native';
import { colors, radius, spacing, typography, shadow } from '../theme/tokens';
import { events } from '../data';
import { Tag, SectionLabel, Panel, PanelHead, ConfidenceBar, Mono } from '../components/Primitives';

// ── Event type config ─────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  alarm: { dot: colors.alarm, tagType: 'alarm', symbol: '⚠' },
  warn:  { dot: colors.warn,  tagType: 'warn',  symbol: '◉' },
  safe:  { dot: colors.safe,  tagType: 'safe',  symbol: '✓' },
  info:  { dot: colors.textTertiary, tagType: 'info', symbol: 'ℹ' },
};

const STATUS_TAG = {
  resolved:  { type: 'safe',  label: 'Resolved'  },
  pending:   { type: 'warn',  label: 'Pending'   },
  dismissed: { type: 'info',  label: 'Dismissed' },
};

// ── Single event row ──────────────────────────────────────────────────────────
function EventRow({ event, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const cfg    = TYPE_CONFIG[event.type] || TYPE_CONFIG.info;
  const stag   = STATUS_TAG[event.status] || STATUS_TAG.dismissed;

  return (
    <TouchableOpacity
      style={[styles.eventRow, !isLast && styles.eventRowBorder]}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.8}
    >
      {/* Type dot */}
      <View style={[styles.eventDot, { backgroundColor: cfg.dot }]} />

      <View style={{ flex: 1 }}>
        {/* Main row */}
        <View style={styles.eventMain}>
          <Text style={styles.eventTitle} numberOfLines={expanded ? undefined : 2}>
            {event.title}
          </Text>
          <Mono style={styles.eventTime}>{event.time}</Mono>
        </View>

        {/* Meta */}
        <Mono style={[styles.eventMeta, { marginTop: 3 }]}>{event.meta}</Mono>

        {/* Expanded detail */}
        {expanded && (
          <View style={styles.eventExpanded}>
            {event.confidence !== null && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.expandedLabel}>
                  ML confidence: {Math.round(event.confidence * 100)}%
                </Text>
                <ConfidenceBar
                  value={event.confidence}
                  color={event.type === 'alarm' ? colors.alarm : event.type === 'warn' ? colors.warn : colors.safe}
                />
              </View>
            )}
            <View style={styles.expandedTags}>
              <Tag type={cfg.tagType}>{event.type.toUpperCase()}</Tag>
              <Tag type={stag.type}>{stag.label}</Tag>
            </View>
          </View>
        )}
      </View>

      {/* Status tag (right side) */}
      <Tag type={stag.type}>{stag.label}</Tag>
    </TouchableOpacity>
  );
}

// ── Date section header ───────────────────────────────────────────────────────
function DateHeader({ date }) {
  return (
    <View style={styles.dateHeader}>
      <Text style={styles.dateHeaderText}>{date}</Text>
      <View style={styles.dateHeaderLine} />
    </View>
  );
}

// ── Filter chips ──────────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'all',   label: 'All'    },
  { key: 'alarm', label: 'Alarm'  },
  { key: 'warn',  label: 'Motion' },
  { key: 'safe',  label: 'Safe'   },
  { key: 'info',  label: 'System' },
];

function FilterChips({ active, onSelect }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      {FILTERS.map(f => (
        <TouchableOpacity
          key={f.key}
          style={[styles.filterChip, active === f.key && styles.filterChipActive]}
          onPress={() => onSelect(f.key)}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterChipText, active === f.key && styles.filterChipTextActive]}>
            {f.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────
function StatsStrip({ events }) {
  const counts = events.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});
  return (
    <View style={styles.statsStrip}>
      {[
        { label: 'Alarms', count: counts.alarm || 0, color: colors.alarm },
        { label: 'Warnings', count: counts.warn || 0, color: colors.warn  },
        { label: 'Safe',   count: counts.safe  || 0, color: colors.safe  },
        { label: 'System', count: counts.info  || 0, color: colors.textTertiary },
      ].map(s => (
        <View key={s.label} style={styles.statItem}>
          <Text style={[styles.statCount, { color: s.color }]}>{s.count}</Text>
          <Text style={styles.statItemLabel}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function LogScreen() {
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() =>
    filter === 'all' ? events : events.filter(e => e.type === filter),
    [filter]
  );

  // Group by date
  const sections = useMemo(() => {
    const map = {};
    filtered.forEach(e => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return Object.entries(map).map(([date, data]) => ({ title: date, data }));
  }, [filtered]);

  return (
    <View style={styles.container}>
      {/* Filters — pinned above list */}
      <View style={styles.headerArea}>
        <StatsStrip events={events} />
        <FilterChips active={filter} onSelect={setFilter} />
        <View style={styles.resultCount}>
          <Text style={styles.resultCountText}>
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            {filter !== 'all' ? ` · filtered by ${filter}` : ' · all types'}
          </Text>
        </View>
      </View>

      {/* Event list grouped by date */}
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderItem={({ item, index, section }) => (
          <EventRow
            event={item}
            isLast={index === section.data.length - 1}
          />
        )}
        renderSectionHeader={({ section }) => (
          <DateHeader date={section.title} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={<View style={{ height: spacing.xl }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No events match this filter</Text>
            <Text style={styles.emptySub}>Try selecting a different event type above.</Text>
          </View>
        }
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  headerArea: {
    backgroundColor: colors.bgPanel,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingBottom: 10,
  },

  // Stats strip
  statsStrip: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: 0,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle,
    paddingVertical: 4,
  },
  statCount: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  statItemLabel: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },

  // Filters
  filterRow: {
    paddingHorizontal: spacing.md,
    gap: 6,
    paddingBottom: 2,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.bgInset,
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
  resultCount: {
    paddingHorizontal: spacing.md,
    paddingTop: 8,
  },
  resultCountText: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    fontFamily: 'Courier',
  },

  // List
  listContent: {
    padding: spacing.md,
  },

  // Date header
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    marginTop: 10,
  },
  dateHeaderText: {
    fontSize: typography.xs,
    fontWeight: '700',
    color: colors.textTertiary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  dateHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderSubtle,
  },

  // Event row
  eventRow: {
    backgroundColor: colors.bgPanel,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 0,
  },
  eventRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  eventMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventTitle: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 17,
  },
  eventTime: {
    flexShrink: 0,
    fontSize: typography.xs,
    color: colors.textTertiary,
    marginTop: 1,
  },
  eventMeta: {
    fontSize: typography.xs,
    color: colors.textTertiary,
  },

  // Expanded
  eventExpanded: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  expandedLabel: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: 4,
  },
  expandedTags: {
    flexDirection: 'row',
    gap: 6,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: typography.base,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptySub: {
    fontSize: typography.sm,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});