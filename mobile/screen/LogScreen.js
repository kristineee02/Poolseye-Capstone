import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, FlatList, ScrollView, StyleSheet, TouchableOpacity, Modal, Pressable,
  RefreshControl, ActivityIndicator, Platform,
} from 'react-native';
import { Text } from '../components/Typography';
import Svg, { Circle, Line } from 'react-native-svg';
import { colors, radius, spacing, typography, shadow, touch } from '../theme/tokens';
import { Tag } from '../components/Primitives';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useAuth } from '../context/AuthContext';
import { fetchMobileEvents, getMobileAlertStreamUrl, updateMobileEventStatus } from '../api/events';
import { AlertListSkeleton, DataLoadError } from '../components/Skeleton';
import ConfirmModal from '../components/ConfirmModal';
import StatusModal from '../components/StatusModal';
import { respondToMobileEvent } from '../api/events';
import { formatEventTime } from '../utils/dateTime';
import { HISTORY_FILTERS, historyFilterParams } from '../utils/historyFilters';
import { responderFirstName } from '../utils/activeAlerts';

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
    && a.eventName === b.eventName
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
    label: 'MEDIUM',
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
  if (event.category === 'intrusion') return 'High Priority';
  if (event.category === 'deep-water') return 'Medium Priority';
  if (event.category === 'supervision') return 'Attention';
  return 'Pool Alert';
}

const STATUS_TAG = {
  new: { type: 'warn', label: 'Pending' },
  ack: { type: 'safe', label: 'Resolved' },
};

function FilterDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = HISTORY_FILTERS.find((filter) => filter.key === value) || HISTORY_FILTERS[0];

  return (
    <>
      <TouchableOpacity
        style={styles.filterBtn}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Filter: ${current.label}`}
      >
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Line x1="4" y1="7" x2="20" y2="7" stroke={value === 'all' ? colors.textSecondary : colors.accent} strokeWidth="1.8" strokeLinecap="round" />
          <Circle cx="9" cy="7" r="2" fill={colors.bgPanel} stroke={value === 'all' ? colors.textSecondary : colors.accent} strokeWidth="1.8" />
          <Line x1="4" y1="17" x2="20" y2="17" stroke={value === 'all' ? colors.textSecondary : colors.accent} strokeWidth="1.8" strokeLinecap="round" />
          <Circle cx="15" cy="17" r="2" fill={colors.bgPanel} stroke={value === 'all' ? colors.textSecondary : colors.accent} strokeWidth="1.8" />
        </Svg>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.menuCard} onPress={(e) => e.stopPropagation?.()}>
            <Text style={styles.menuTitle}>Filter Event History</Text>
            <ScrollView style={styles.menuList} showsVerticalScrollIndicator={false}>
              {HISTORY_FILTERS.map((filter, index) => {
                const active = filter.key === value;
                const showGroup = index > 0 && filter.group !== HISTORY_FILTERS[index - 1].group;
                return (
                  <React.Fragment key={filter.key}>
                    {showGroup ? <Text style={styles.menuGroup}>{filter.group}</Text> : null}
                    <TouchableOpacity
                      style={[styles.menuItem, active && styles.menuItemActive]}
                      onPress={() => {
                        onChange(filter.key);
                        setOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.menuItemText, active && styles.menuItemTextActive]}>
                        {filter.label}
                      </Text>
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </ScrollView>
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
    ? { type: 'warn', label: 'Needs Response' }
    : event.backendStatus === 'responding'
      ? { type: event.respondingMine ? 'safe' : 'warn', label: event.respondingMine ? "You're responding" : `${responderFirstName(event)} is responding` }
    : event.backendStatus === 'dismissed'
      ? { type: 'info', label: 'False Alarm' }
      : STATUS_TAG.ack;
  const closedTime = event.closedAt
    ? formatEventTime(event.closedAt)
    : '';
  const outcome = ['pending', 'responding'].includes(event.backendStatus)
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
  const [section, setSection] = useState('incoming');
  const [activeEvents, setActiveEvents] = useState([]);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [totalHistoryCount, setTotalHistoryCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [respondingId, setRespondingId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [closePrompt, setClosePrompt] = useState(null);
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
        status: 'active',
        limit: ACTIVE_ALERT_LIMIT,
      }),
      fetchMobileEvents(token, {
        alertsOnly: true,
        status: 'closed',
        limit: HISTORY_PAGE_SIZE,
        offset: 0,
        ...historyFilterParams(historyFilter),
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
  }, [token, onPendingCountChange, historyFilter]);

  const retryLoad = useCallback(() => {
    setLoading(true);
    loadEvents();
  }, [loadEvents]);

  useAutoRefresh(loadEvents, POLL_MS, Boolean(token), getMobileAlertStreamUrl(token));

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
      ...historyFilterParams(historyFilter),
    });
    if (result.ok) {
      setHistoryEvents((previous) => appendHistoryPage(previous, result.events || []));
      setTotalHistoryCount(result.totalCount);
    } else {
      setError(result.error || 'Could not load more alert history');
    }
    setLoadingMore(false);
  }, [section, loadingMore, hasMoreHistory, token, historyCursorTs, historyCursorId, historyFilter]);

  const openAlert = useCallback((event) => setSelectedAlert(event), []);
  const closeAlert = useCallback(() => setSelectedAlert(null), []);
  const respondToSelectedAlert = useCallback(async () => {
    const id = selectedAlert?.id;
    if (!id || respondingId === id) return;
    setRespondingId(id);
    const result = await respondToMobileEvent(token, id);
    setRespondingId(null);
    if (!result.ok) {
      if (result.event) setSelectedAlert(result.event);
      setStatusMessage({
        tone: 'error',
        title: 'Could not respond',
        message: result.error || 'Failed to claim this alert.',
      });
    } else if (result.event) {
      // Keep the incident open so the responder can immediately choose the
      // outcome from the active-alert modal.
      setSelectedAlert(result.event);
    }
    await loadEvents();
  }, [selectedAlert, respondingId, token, loadEvents]);

  const requestResolve = useCallback(() => {
    if (!selectedAlert) return;
    setClosePrompt({ id: selectedAlert.id });
    closeAlert();
  }, [selectedAlert, closeAlert]);
  const cancelClose = useCallback(() => {
    setClosePrompt(null);
  }, []);
  const confirmClose = useCallback(async () => {
    if (!closePrompt) return;
    const prompt = closePrompt;
    cancelClose();
    const result = await updateMobileEventStatus(token, prompt.id, 'resolved');
    if (!result.ok) {
      setStatusMessage({ tone: 'error', title: 'Could not close incident', message: result.error || 'The incident could not be updated.' });
    }
    await loadEvents();
  }, [closePrompt, cancelClose, token, loadEvents]);
  const dismissSelectedAlert = useCallback(async () => {
    if (!selectedAlert) return;
    const { id } = selectedAlert;
    closeAlert();
    const result = await updateMobileEventStatus(token, id, 'dismissed');
    if (!result.ok) {
      setStatusMessage({ tone: 'error', title: 'Could not mark false alarm', message: result.error || 'The incident could not be updated.' });
    }
    await loadEvents();
  }, [selectedAlert, closeAlert, token, loadEvents]);

  const displayedEvents = useMemo(
    () => (section === 'incoming' ? activeEvents : historyEvents),
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
  const showIncoming = useCallback(() => setSection('incoming'), []);
  const showHistory = useCallback(() => setSection('history'), []);
  const changeHistoryFilter = useCallback((nextFilter) => {
    setHistoryEvents([]);
    setTotalHistoryCount(0);
    setLoading(true);
    setHistoryFilter(nextFilter);
  }, []);
  const refreshControl = useMemo(() => (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
  ), [refreshing, onRefresh]);
  const emptyComponent = useMemo(() => {
    if (loading) return <AlertListSkeleton onRetry={retryLoad} />;
    if (error) return <DataLoadError message={error} onRetry={retryLoad} />;
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {section === 'incoming' ? 'No active alerts' : 'No matching history'}
        </Text>
        <Text style={styles.emptySub}>
          {section === 'incoming'
            ? 'Open incidents and their current responder will appear here automatically.'
            : 'Try another event, outcome, or date filter.'}
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
    if (respondingId === selectedAlert.id) {
      return [{ label: 'Claiming alert...', tone: 'secondary', onPress: () => {} }];
    }
    if (selectedAlert.backendStatus === 'pending') {
      return [
        { label: 'Respond Now', tone: 'alert', onPress: respondToSelectedAlert },
        { label: 'Resolve Incident', tone: 'primary', onPress: requestResolve },
        { label: 'Mark as False Alarm', tone: 'secondary', onPress: dismissSelectedAlert },
      ];
    }
    if (selectedAlert.backendStatus === 'responding' && selectedAlert.respondingMine) {
      return [
        { label: 'Resolve Incident', tone: 'primary', onPress: requestResolve },
        { label: 'Mark as False Alarm', tone: 'secondary', onPress: dismissSelectedAlert },
      ];
    }
    if (selectedAlert.backendStatus === 'responding') {
      return [{ label: 'Close', tone: 'secondary', onPress: closeAlert }];
    }
    return [{ label: 'Close', tone: 'secondary', onPress: closeAlert }];
  }, [selectedAlert, respondingId, respondToSelectedAlert, requestResolve, dismissSelectedAlert, closeAlert]);

  return (
    <View style={styles.container}>
      <View style={styles.segmented}>
        <TouchableOpacity
          style={[styles.segmentButton, section === 'incoming' && styles.segmentButtonActive]}
          onPress={showIncoming}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, section === 'incoming' && styles.segmentTextActive]}>
            Active
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
        <View style={styles.historyToolbar}>
          <Text style={styles.resultText}>
            {totalHistoryCount} result{totalHistoryCount !== 1 ? 's' : ''}
          </Text>
          <FilterDropdown value={historyFilter} onChange={changeHistoryFilter} />
        </View>
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
      <ConfirmModal
        visible={Boolean(closePrompt)}
        onClose={cancelClose}
        title="Resolve this incident?"
        message="Confirm that you assessed the situation and the area is safe."
        actions={[
          { label: 'Cancel', tone: 'secondary', onPress: cancelClose },
          {
            label: 'Confirm Resolution',
            tone: 'primary',
            onPress: confirmClose,
          },
        ]}
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
    backgroundColor: colors.bgPanel,
    borderRadius: radius.full,
    padding: 3,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow.sm,
  },
  segmentButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.accent,
  },
  segmentText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  resultText: {
    fontSize: typography.sm,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  historyToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  errorText: {
    fontSize: typography.sm,
    color: colors.alarm,
    fontWeight: '600',
    marginBottom: 8,
  },
  filterBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow.sm,
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
    maxHeight: '82%',
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
  menuList: {
    flexGrow: 0,
  },
  menuGroup: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
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
