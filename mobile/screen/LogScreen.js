// PoolsEye — LogScreen (All Alerts)
// Card design: tinted panels + left stripe + type/status tags (content unchanged).

import React, { useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Modal, Pressable,
} from 'react-native';
import { colors, radius, spacing, typography, shadow } from '../theme/tokens';
import { events } from '../data';
import { Tag } from '../components/Primitives';
import { useLayoutInsets } from '../hooks/useLayoutInsets';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'ack', label: 'Acknowledged' },
  { key: 'drowning', label: 'Drowning' },
  { key: 'intrusion', label: 'Intrusion' },
  { key: 'deep-water', label: 'Deep-Water' },
  { key: 'child', label: 'Child' },
];

const TYPE_CONFIG = {
  alarm: {
    accent: colors.alarm,
    bg: colors.alarmTint,
    border: colors.alarmBorder,
    title: colors.alarmDark,
    meta: colors.alarmMid,
    label: 'ALARM',
    tag: 'alarm',
  },
  warn: {
    accent: colors.warn,
    bg: colors.warnTint,
    border: colors.warnBorder,
    title: colors.warnDark,
    meta: colors.warnMid,
    label: 'WARN',
    tag: 'warn',
  },
  info: {
    accent: colors.textTertiary,
    bg: colors.bgPanel,
    border: colors.borderSubtle,
    title: colors.textPrimary,
    meta: colors.textSecondary,
    label: 'INFO',
    tag: 'info',
  },
  safe: {
    accent: colors.safe,
    bg: colors.safeTint,
    border: colors.safeBorder,
    title: colors.textPrimary,
    meta: colors.textSecondary,
    label: 'SAFE',
    tag: 'safe',
  },
};

const STATUS_TAG = {
  new: { type: 'warn', label: 'Pending' },
  ack: { type: 'safe', label: 'Resolved' },
};

function matchesFilter(event, filter) {
  if (filter === 'all') return true;
  if (filter === 'new' || filter === 'ack') return event.status === filter;
  return event.category === filter;
}

function FilterDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = FILTERS.find((f) => f.key === value) || FILTERS[0];

  return (
    <>
      <TouchableOpacity
        style={styles.filterBtn}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Filter: ${current.label}`}
      >
        <Text style={styles.filterBtnText}>Filter: {current.label}</Text>
        <Text style={styles.filterChevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setOpen(false)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Filter alerts</Text>
            {FILTERS.map((f) => {
              const active = f.key === value;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.menuItem, active && styles.menuItemActive]}
                  onPress={() => {
                    onChange(f.key);
                    setOpen(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.menuItemText, active && styles.menuItemTextActive]}>
                    {f.label}
                  </Text>
                  {active ? <Text style={styles.menuCheck}>✓</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function AlertCard({ event }) {
  const cfg = TYPE_CONFIG[event.type] || TYPE_CONFIG.info;
  const status = STATUS_TAG[event.status] || STATUS_TAG.ack;

  return (
    <View style={[styles.card, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <View style={[styles.stripe, { backgroundColor: cfg.accent }]} />

      <View style={styles.cardInner}>
        <View style={styles.cardTop}>
          <View style={[styles.dot, { backgroundColor: cfg.accent }]} />
          <Text style={[styles.cardTitle, { color: cfg.title }]} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={[styles.cardTime, { color: cfg.meta }]}>{event.time}</Text>
        </View>

        <Text style={[styles.cardMeta, { color: cfg.meta }]} numberOfLines={2}>
          {event.meta}
        </Text>

        <View style={styles.cardTags}>
          <Tag type={cfg.tag}>{cfg.label}</Tag>
          <Tag type={status.type}>{status.label}</Tag>
        </View>
      </View>
    </View>
  );
}

export default function LogScreen() {
  const { tabBarClearance } = useLayoutInsets();
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(
    () => events.filter((e) => matchesFilter(e, filter)),
    [filter],
  );

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.resultText}>
          {filtered.length} alert{filtered.length !== 1 ? 's' : ''}
        </Text>
        <FilterDropdown value={filter} onChange={setFilter} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AlertCard event={item} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarClearance }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No alerts match this filter</Text>
            <Text style={styles.emptySub}>Try another option in the filter dropdown.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
    paddingHorizontal: spacing.md,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  resultText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow.sm,
  },
  filterBtnText: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  filterChevron: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '700',
  },

  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  menuCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow.md,
  },
  menuTitle: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  menuItemActive: {
    backgroundColor: colors.accentTint,
  },
  menuItemText: {
    fontSize: typography.md,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  menuItemTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  menuCheck: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 14,
  },

  listContent: {
    gap: 10,
    paddingBottom: 8,
  },

  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    ...shadow.sm,
  },
  stripe: {
    width: 4,
  },
  cardInner: {
    flex: 1,
    padding: 13,
    gap: 8,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  cardTitle: {
    flex: 1,
    fontSize: typography.base,
    fontWeight: '700',
    lineHeight: 19,
  },
  cardTime: {
    fontSize: typography.xs,
    fontWeight: '600',
    flexShrink: 0,
    marginTop: 2,
  },
  cardMeta: {
    fontSize: typography.sm,
    lineHeight: 18,
    paddingLeft: 18,
  },
  cardTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingLeft: 18,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
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
