import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, FlatList, StyleSheet, TouchableOpacity, Modal, Pressable,
  RefreshControl, ActivityIndicator, Platform,
} from 'react-native';
import { Text } from '../components/Typography';
import { colors, radius, spacing, typography, shadow, touch } from '../theme/tokens';
import { Tag } from '../components/Primitives';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useAuth } from '../context/AuthContext';
import { fetchMobileEvents } from '../api/events';
import { AlertListSkeleton, DataLoadError } from '../components/Skeleton';
import ConfirmModal from '../components/ConfirmModal';
import StatusModal from '../components/StatusModal';
import { respondToMobileEvent } from '../api/events';

const POLL_MS = 5000;
const ACTIVE_ALERT_LIMIT = 100;
const HISTORY_PAGE_SIZE = 30;
const MAINTAIN_VISIBLE_POSITION = { minIndexForVisible: 0 };

const keyExtractor = (item) => String(item.id);

function sameRenderedEvent(a, b) {
  return a === b || Boolean(a && b
    && a.id === b.id
    && a.type === b.type
    && a.category === b.category
    && a.title === b.title
    && a.time === b.time
    && a.meta === b.meta
    && a.backendStatus === b.backendStatus
    && a.respondingAt === b.respondingAt
    && a.respondingMine === b.respondingMine
    && a.responderName === b.responderName
    && a.closedAt === b.closedAt
    && a.closedByName === b.closedByName
    && a.priority === b.priority
    && a.occurrenceCount === b.occurrenceCount);
}

function sortActiveAlerts(events) {
  return [...events].sort((a, b) => (
    Number(a.priority || 9) - Number(b.priority || 9)
    || Number(b.ts || 0) - Number(a.ts || 0)
  ));
}

function reconcilePage(previous, incoming) {
  const previousById = new Map(previous.map((event) => [event.id, event]));
  const next = incoming.map((event) => {
    const existing = previousById.get(event.id);
    return sameRenderedEvent(existing, event) ? existing : event;
  });
  return next.length === previous.length && next.every((event, index) => event === previous[index])
    ? previous
    : next;
}

function reconcileHistoryHead(previous, incoming) {
  const previousById = new Map(previous.map((event) => [event.id, event]));
  const incomingIds = new Set(incoming.map((event) => event.id));
  const stableHead = incoming.map((event) => {
    const existing = previousById.get(event.id);
    return sameRenderedEvent(existing, event) ? existing : event;
  });
  const targetLength = Math.max(HISTORY_PAGE_SIZE, previous.length);
  const next = [
    ...stableHead,
    ...previous.filter((event) => !incomingIds.has(event.id)),
  ].slice(0, targetLength);
  return next.length === previous.length && next.every((event, index) => event === previous[index])
    ? previous
    : next;
}

function appendHistoryPage(previous, incoming) {
  const previousIds = new Set(previous.map((event) => event.id));
  const unique = incoming.filter((event) => !previousIds.has(event.id));
  return unique.length ? [...previous, ...unique] : previous;
}

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
    accent: colors.geofenceOrange,
    bg: colors.geofenceOrangeTint,
    border: colors.geofenceOrangeBorder,
    title: colors.geofenceOrangeDark,
    meta: colors.geofenceOrange,
    label: 'HIGH',
    tag: 'info',
  },
};

function alertVisual(event) {
  if (event.category === 'drowning') return { ...TYPE_CONFIG.alarm, label: 'CRITICAL' };
  if (event.category === 'intrusion') return TYPE_CONFIG.alarm;
  if (event.category === 'deep-water') return TYPE_CONFIG.deep;
  if (event.category === 'supervision') return { ...TYPE_CONFIG.warn, label: 'ATTENTION' };
  if (event.category === 'yellow') return TYPE_CONFIG.info;
  return TYPE_CONFIG[event.type] || TYPE_CONFIG.info;
}

function alertPerson(event) {
  if (event.affectedCount > 1) return `${event.affectedCount} affected swimmers`;
  return event.personId != null
    ? `Person #${String(event.personId).padStart(2, '0')}`
    : 'Affected swimmer';
}

function alertDescription(event) {
  if (event.category === 'drowning') return 'A person is showing possible drowning behavior.';
  if (event.category === 'intrusion') return 'A swimmer entered the restricted red zone.';
  if (event.category === 'deep-water') return 'A swimmer entered the deep-water area.';
  if (event.category === 'supervision') {
    return `${event.affectedCount || 1} swimmer${event.affectedCount === 1 ? '' : 's'} detected without supervision.`;
  }
  return event.detail || event.meta || 'Review this pool alert.';
}

function priorityBadge(event) {
  if (event.category === 'drowning') return 'Critical Alert';
  if (event.category === 'intrusion' || event.category === 'deep-water') return 'High Priority';
  if (event.category === 'supervision') return 'Attention';
  return 'Pool Alert';
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

const AlertCard = React.memo(function AlertCard({ event, onSelect }) {
  const cfg = alertVisual(event);
  const handlePress = useCallback(() => onSelect(event), [event, onSelect]);
  const status = event.backendStatus === 'pending'
    ? event.respondingAt
      ? { type: 'safe', label: event.respondingMine ? 'You Responding' : 'Response Assigned' }
      : { type: 'warn', label: 'Needs Response' }
    : event.backendStatus === 'dismissed'
      ? { type: 'info', label: 'False Alarm' }
      : STATUS_TAG.ack;
  const closedTime = event.closedAt
    ? new Date(event.closedAt * 1000).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : '';
  const outcome = event.backendStatus === 'pending'
    ? ''
    : `${event.backendStatus === 'dismissed' ? 'Marked as False Alarm' : 'Resolved'}`
      + `${event.closedByName ? ` by ${event.closedByName}` : ''}`
      + `${closedTime ? ` · ${closedTime}` : ''}`;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Open ${event.title}`}
    >
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

        {event.occurrenceCount > 1 ? (
          <Text style={styles.groupedDetectionText} numberOfLines={1}>
            Grouped · {event.occurrenceCount} matching detections
          </Text>
        ) : null}

        {outcome ? (
          <Text
            style={[
              styles.outcomeText,
              { color: event.backendStatus === 'resolved' ? colors.safe : colors.textSecondary },
            ]}
            numberOfLines={2}
          >
            {outcome}
          </Text>
        ) : null}

        <View style={styles.cardTags}>
          <Tag type={cfg.tag}>{cfg.label}</Tag>
          <Tag type={status.type}>{status.label}</Tag>
        </View>
      </View>
    </TouchableOpacity>
  );
}, (previous, next) => (
  previous.onSelect === next.onSelect && sameRenderedEvent(previous.event, next.event)
));

export default function LogScreen({ onPendingCountChange }) {
  const { tabBarClearance } = useLayoutInsets();
  const { token } = useAuth();
  const [section, setSection] = useState('active');
  const [activeEvents, setActiveEvents] = useState([]);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [totalHistoryCount, setTotalHistoryCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const loadRequestId = useRef(0);
  const hasMoreHistory = historyEvents.length < totalHistoryCount;
  const historyCursorTs = historyEvents[historyEvents.length - 1]?.ts;
  const historyCursorId = historyEvents[historyEvents.length - 1]?.id;

  const loadEvents = useCallback(async () => {
    if (!token) return;
    const requestId = ++loadRequestId.current;
    const [activeResult, historyResult] = await Promise.all([
      fetchMobileEvents(token, {
        alertsOnly: true,
        status: 'pending',
        limit: ACTIVE_ALERT_LIMIT,
      }),
      fetchMobileEvents(token, {
        alertsOnly: true,
        status: 'closed',
        limit: HISTORY_PAGE_SIZE,
        offset: 0,
      }),
    ]);
    if (requestId !== loadRequestId.current) return;

    if (!activeResult.ok || !historyResult.ok) {
      setError(activeResult.error || historyResult.error || 'Could not load alerts');
      setLoading(false);
      return;
    }
    setError('');
    setActiveEvents((previous) => reconcilePage(
      previous,
      sortActiveAlerts(activeResult.events || [])
    ));
    setHistoryEvents((previous) => reconcileHistoryHead(previous, historyResult.events || []));
    setTotalHistoryCount(historyResult.totalCount);
    onPendingCountChange?.(activeResult.pendingCount || 0);
    setLoading(false);
  }, [token, onPendingCountChange]);

  const retryLoad = useCallback(() => {
    setLoading(true);
    loadEvents();
  }, [loadEvents]);

  useAutoRefresh(loadEvents, POLL_MS, Boolean(token));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  }, [loadEvents]);

  const loadMoreHistory = useCallback(async () => {
    if (section !== 'history' || loadingMore || !hasMoreHistory || !token) return;
    setLoadingMore(true);
    const result = await fetchMobileEvents(token, {
      alertsOnly: true,
      status: 'closed',
      limit: HISTORY_PAGE_SIZE,
      beforeTs: historyCursorTs,
      beforeId: historyCursorId,
    });
    if (result.ok) {
      setHistoryEvents((previous) => appendHistoryPage(previous, result.events || []));
      setTotalHistoryCount(result.totalCount);
    } else {
      setError(result.error || 'Could not load more alert history');
    }
    setLoadingMore(false);
  }, [section, loadingMore, hasMoreHistory, token, historyCursorTs, historyCursorId]);

  const openAlert = useCallback((event) => setSelectedAlert(event), []);
  const closeAlert = useCallback(() => setSelectedAlert(null), []);
  const respondToSelectedAlert = useCallback(async () => {
    const id = selectedAlert?.id;
    if (!id) return;
    closeAlert();
    const result = await respondToMobileEvent(token, id);
    if (!result.ok) {
      setStatusMessage({
        tone: 'error',
        title: 'Could not respond',
        message: result.error || 'Failed to claim this alert.',
      });
    }
    await loadEvents();
  }, [selectedAlert, closeAlert, token, loadEvents]);

  const displayedEvents = useMemo(
    () => (section === 'active' ? activeEvents : historyEvents),
    [section, activeEvents, historyEvents]
  );
  const listContentStyle = useMemo(
    () => [styles.listContent, { paddingBottom: tabBarClearance + spacing.sm }],
    [tabBarClearance]
  );
  const renderItem = useCallback(
    ({ item }) => <AlertCard event={item} onSelect={openAlert} />,
    [openAlert]
  );
  const showActive = useCallback(() => setSection('active'), []);
  const showHistory = useCallback(() => setSection('history'), []);
  const refreshControl = useMemo(() => (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
  ), [refreshing, onRefresh]);
  const emptyComponent = useMemo(() => {
    if (loading) return <AlertListSkeleton onRetry={retryLoad} />;
    if (error) return <DataLoadError message={error} onRetry={retryLoad} />;
    return (
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
    );
  }, [loading, error, retryLoad, section]);
  const footerComponent = useMemo(() => (
    section === 'history' && loadingMore
      ? <ActivityIndicator color={colors.accent} style={styles.listFooter} />
      : null
  ), [section, loadingMore]);
  const selectedVisual = useMemo(
    () => alertVisual(selectedAlert || {}),
    [selectedAlert]
  );
  const selectedActions = useMemo(() => {
    if (!selectedAlert) return [];
    if (selectedAlert.backendStatus === 'pending' && !selectedAlert.respondingAt) {
      return [{ label: 'Respond Now', tone: 'alert', onPress: respondToSelectedAlert }];
    }
    return [{ label: 'Close', tone: 'secondary', onPress: closeAlert }];
  }, [selectedAlert, respondToSelectedAlert, closeAlert]);

  return (
    <View style={styles.container}>
      <View style={styles.segmented}>
        <TouchableOpacity
          style={[styles.segmentButton, section === 'active' && styles.segmentButtonActive]}
          onPress={showActive}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, section === 'active' && styles.segmentTextActive]}>
            Active ({activeEvents.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentButton, section === 'history' && styles.segmentButtonActive]}
          onPress={showHistory}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, section === 'history' && styles.segmentTextActive]}>History</Text>
        </TouchableOpacity>
      </View>

      {section === 'history' ? (
        <Text style={styles.resultText}>
          {displayedEvents.length}{hasMoreHistory ? '+' : ''} history alert{displayedEvents.length !== 1 ? 's' : ''}
        </Text>
      ) : null}

      {error && displayedEvents.length ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={displayedEvents}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        ListEmptyComponent={emptyComponent}
        ListFooterComponent={footerComponent}
        onEndReached={section === 'history' ? loadMoreHistory : undefined}
        onEndReachedThreshold={0.35}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        maintainVisibleContentPosition={MAINTAIN_VISIBLE_POSITION}
      />

      <ConfirmModal
        visible={Boolean(selectedAlert)}
        onClose={closeAlert}
        title={selectedAlert?.title || 'Alert'}
        tone={selectedAlert?.category === 'drowning' ? 'danger' : 'warning'}
        icon="siren"
        badge={selectedAlert ? priorityBadge(selectedAlert) : ''}
        subtitle={selectedAlert ? alertPerson(selectedAlert) : ''}
        meta={selectedAlert ? `${String(selectedAlert.zone || 'Pool').toUpperCase()} · ${selectedAlert.time}` : ''}
        description={selectedAlert ? alertDescription(selectedAlert) : ''}
        actions={selectedActions}
        stackedActions
        actionColor={selectedVisual.accent}
        actionTint={selectedVisual.bg}
        actionTextColor={selectedAlert?.category === 'supervision' ? colors.warnDark : '#FFFFFF'}
        actionSecondaryTextColor={selectedVisual.title}
        accentColor={selectedVisual.accent}
        accentTint={selectedVisual.bg}
        presentation="incident"
      />
      <StatusModal
        visible={Boolean(statusMessage)}
        onClose={() => setStatusMessage(null)}
        title={statusMessage?.title}
        message={statusMessage?.message}
        tone={statusMessage?.tone}
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
  listFooter: {
    paddingVertical: 18,
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
  groupedDetectionText: {
    fontSize: typography.xs,
    lineHeight: 16,
    paddingLeft: 15,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  cardTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingLeft: 15,
  },
  outcomeText: {
    fontSize: typography.xs,
    lineHeight: 16,
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
