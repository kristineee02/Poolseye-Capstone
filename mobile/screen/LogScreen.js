import React, { useCallback, useMemo, useState } from 'react';
import {
  View, FlatList, StyleSheet, TouchableOpacity, Modal, Pressable,
  RefreshControl,
} from 'react-native';
import { Text } from '../components/Typography';
import { colors, radius, spacing, typography, shadow, touch } from '../theme/tokens';
import { Tag } from '../components/Primitives';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useAuth } from '../context/AuthContext';
import { fetchMobileEvents } from '../api/events';
import { AlertListSkeleton, DataLoadError } from '../components/Skeleton';

const POLL_MS = 5000;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'ack', label: 'Acknowledged' },
  { key: 'drowning', label: 'Drowning' },
  { key: 'intrusion', label: 'Intrusion' },
  { key: 'deep-water', label: 'Deep-Water' },
  { key: 'supervision', label: 'Supervision' },
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
  high: {
    accent: colors.high,
    bg: colors.highTint,
    border: colors.highBorder,
    title: colors.highDark,
    meta: colors.highMid,
    label: 'HIGH',
    tag: 'warn',
  },
  deep: {
    accent: colors.accent,
    bg: colors.accentTint,
    border: colors.accentHighlight,
    title: colors.accentDeep,
    meta: colors.accent,
    label: 'HIGH',
    tag: 'info',
  },
};

function alertVisual(event) {
  if (event.category === 'drowning') return { ...TYPE_CONFIG.alarm, label: 'CRITICAL' };
  if (event.category === 'intrusion') return TYPE_CONFIG.high;
  if (event.category === 'deep-water') return TYPE_CONFIG.deep;
  if (event.category === 'supervision') return { ...TYPE_CONFIG.warn, label: 'ATTENTION' };
  if (event.category === 'yellow') return TYPE_CONFIG.info;
  return TYPE_CONFIG[event.type] || TYPE_CONFIG.info;
}

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
          <Pressable style={styles.menuCard} onPress={(e) => e.stopPropagation?.()}>
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
                  activeOpacity={0.7}
                >
                  <Text style={[styles.menuItemText, active && styles.menuItemTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function AlertCard({ event }) {
  const cfg = alertVisual(event);
  const status = event.backendStatus === 'pending'
    ? { type: 'warn', label: 'Active' }
    : event.backendStatus === 'dismissed'
      ? { type: 'info', label: 'False alarm' }
      : STATUS_TAG.ack;

  return (
    <View style={styles.card}>
      <View style={[styles.stripe, { backgroundColor: cfg.accent }]} />

      <View style={styles.cardInner}>
        <View style={styles.cardTop}>
          <View style={[styles.dot, { backgroundColor: cfg.accent }]} />
          <Text style={styles.cardTitle} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={styles.cardTime}>{event.time}</Text>
        </View>

        <Text style={styles.cardMeta} numberOfLines={2}>
          {event.meta}
        </Text>

        {event.respondingAt ? (
          <Text style={styles.responderText} numberOfLines={1}>
            {event.respondingMine ? 'You are responding' : `${event.responderName || 'A lifeguard'} responding`}
          </Text>
        ) : null}

        <View style={styles.cardTags}>
          <Tag type={cfg.tag}>{cfg.label}</Tag>
          <Tag type={status.type}>{status.label}</Tag>
        </View>
      </View>
    </View>
  );
}

export default function LogScreen({ onPendingCountChange }) {
  const { tabBarClearance } = useLayoutInsets();
  const { token } = useAuth();
  const [section, setSection] = useState('active');
  const [events, setEvents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    if (!token) return;
    const result = await fetchMobileEvents(token, {
      alertsOnly: true,
      status: 'all',
      limit: 80,
    });
    if (!result.ok) {
      setError(result.error || 'Could not load alerts');
      setLoading(false);
      return;
    }
    setError('');
    setEvents(result.events || []);
    onPendingCountChange?.(result.pendingCount || 0);
    setLoading(false);
  }, [token, onPendingCountChange]);

  const retryLoad = () => {
    setLoading(true);
    loadEvents();
  };

  useAutoRefresh(loadEvents, POLL_MS, Boolean(token));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  const activeCount = events.filter((event) => event.backendStatus === 'pending').length;
  const filtered = useMemo(() => events.filter((event) => (
    section === 'active' ? event.backendStatus === 'pending' : event.backendStatus !== 'pending'
  )), [events, section]);

  return (
    <View style={styles.container}>
      <View style={styles.segmented}>
        <TouchableOpacity
          style={[styles.segmentButton, section === 'active' && styles.segmentButtonActive]}
          onPress={() => setSection('active')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, section === 'active' && styles.segmentTextActive]}>
            Active ({activeCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentButton, section === 'history' && styles.segmentButtonActive]}
          onPress={() => setSection('history')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, section === 'history' && styles.segmentTextActive]}>History</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.resultText}>{filtered.length} alert{filtered.length !== 1 ? 's' : ''}</Text>

      {error && events.length ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AlertCard event={item} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarClearance + spacing.sm }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          loading ? (
            <AlertListSkeleton onRetry={retryLoad} />
          ) : error ? (
            <DataLoadError message={error} onRetry={retryLoad} />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {section === 'active' ? 'No active alerts' : 'No alert history yet'}
              </Text>
              <Text style={styles.emptySub}>
                {section === 'active'
                  ? 'New incidents will appear here automatically.'
                  : 'Resolved and false-alarm incidents will appear here.'}
              </Text>
            </View>
          )
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
    gap: 12,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.accentTint,
    borderRadius: radius.full,
    padding: 4,
    marginBottom: 12,
  },
  segmentButton: {
    flex: 1,
    minHeight: touch.min,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.bgPanel,
    ...shadow.sm,
  },
  segmentText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: colors.accent,
    fontWeight: '800',
  },
  resultText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  errorText: {
    fontSize: typography.sm,
    color: colors.alarm,
    fontWeight: '600',
    marginBottom: 8,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: touch.min,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
    paddingHorizontal: spacing.xl,
  },
  menuCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow.md,
  },
  menuTitle: {
    fontSize: typography.xs,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  menuItem: {
    minHeight: touch.min,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
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

  listContent: {
    gap: 10,
    paddingBottom: 8,
  },

  card: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
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
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 6,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  cardTitle: {
    flex: 1,
    fontSize: typography.sm,
    fontWeight: '700',
    lineHeight: 18,
    color: colors.textPrimary,
  },
  cardTime: {
    fontSize: 10,
    fontWeight: '600',
    flexShrink: 0,
    marginTop: 1,
    color: colors.textSecondary,
  },
  cardMeta: {
    fontSize: typography.xs,
    lineHeight: 16,
    paddingLeft: 15,
    color: colors.textSecondary,
  },
  cardTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingLeft: 15,
  },
  responderText: {
    fontSize: typography.xs,
    color: colors.safe,
    fontWeight: '700',
    paddingLeft: 15,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 56,
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
    lineHeight: 18,
  },
});
