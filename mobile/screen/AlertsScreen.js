import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, LayoutAnimation,
  RefreshControl, TextInput,
} from 'react-native';
import { Text } from '../components/Typography';
import Svg, { Path } from 'react-native-svg';
import { colors, radius, spacing, typography, shadow } from '../theme/tokens';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import ProfileHero from '../components/ProfileHero';
import ConfirmModal from '../components/ConfirmModal';
import StatusModal from '../components/StatusModal';
import { AlertsHomeSkeleton, DataLoadError } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { fetchMobileEvents, getMobileAlertStreamUrl, respondToMobileEvent, updateMobileEventStatus } from '../api/events';
import { formatEventTime, localMidnightTimestamp } from '../utils/dateTime';

const POLL_MS = 4000;
const ZONE_CATEGORIES = ['intrusion', 'deep-water', 'supervision'];
function getAlertMeta(alert) {
  if (alert.category === 'intrusion') {
    return {
      accent: colors.geofenceRed,
      tint: colors.geofenceRedTint,
      border: colors.geofenceRedBorder,
      dark: colors.geofenceRedDark,
      buttonText: '#FFFFFF',
      badge: 'RED ZONE',
    };
  }
  if (alert.category === 'deep-water') {
    return {
      accent: colors.geofenceOrange,
      tint: colors.geofenceOrangeTint,
      border: colors.geofenceOrangeBorder,
      dark: colors.geofenceOrangeDark,
      buttonText: '#FFFFFF',
      badge: 'ORANGE ZONE',
    };
  }
  if (alert.category === 'supervision') {
    return {
      accent: colors.geofenceYellow,
      tint: colors.geofenceYellowTint,
      border: colors.geofenceYellowBorder,
      dark: colors.geofenceYellowDark,
      buttonText: colors.geofenceYellowDark,
      badge: 'YELLOW ZONE',
    };
  }

  const isAlarm = alert.category === 'drowning' || alert.type === 'alarm';
  return {
    accent: isAlarm ? colors.alarm : colors.warn,
    tint: isAlarm ? colors.alarmTint : colors.warnTint,
    border: isAlarm ? colors.alarmBorder : colors.warnBorder,
    dark: isAlarm ? colors.alarmDark : colors.warnDark,
    buttonText: isAlarm ? '#FFFFFF' : colors.warnDark,
    badge: isAlarm ? 'ALARM' : 'WARNING',
  };
}

function modalBadge(alert) {
  if (alert?.category === 'drowning') return 'Critical Alert';
  if (alert?.category === 'intrusion') return 'High Priority';
  if (alert?.category === 'deep-water') return 'Medium Priority';
  if (alert?.category === 'supervision') return 'Attention';
  return 'Pool Alert';
}

function modalPerson(alert) {
  const ids = alert?.personIds || [];
  if ((alert?.affectedCount || ids.length) > 1) {
    return `${alert.affectedCount || ids.length} affected swimmers`;
  }
  const id = alert?.personId ?? ids[0];
  return id != null ? `Person #${String(id).padStart(2, '0')}` : 'Affected swimmer';
}

function modalDescription(alert) {
  if (alert?.category === 'drowning') return 'A person is showing possible drowning behavior.';
  if (alert?.category === 'supervision') {
    const count = alert.affectedCount || alert.personIds?.length || 1;
    return `${count} swimmer${count === 1 ? '' : 's'} detected without supervision in this zone.`;
  }
  if (alert?.category === 'intrusion') return 'A swimmer entered the restricted red zone.';
  if (alert?.category === 'deep-water') return 'A swimmer entered the deep-water area.';
  return alert?.detail || alert?.meta || 'Review this pool alert.';
}

function modalFlowDescription(alert) {
  if (alert?.respondingMine) {
    return 'You are responding to this incident. Mark it as resolved once the area is safe.';
  }
  if (alert?.respondingAt) {
    return `${alert.responderName || 'Another lifeguard'} is responding to this incident.`;
  }
  return modalDescription(alert);
}

function modalActionPalette(alert) {
  const meta = getAlertMeta(alert || {});
  return {
    color: meta.accent,
    tint: meta.tint,
    text: meta.buttonText,
    secondaryText: meta.dark,
  };
}

function responseStatusLabel(alert) {
  if (!alert?.respondingAt) return 'Needs response';
  if (alert.respondingMine) return 'You are responding';
  return `${alert.responderName || 'A lifeguard'} is responding`;
}

const CATEGORY_PRIORITY = {
  drowning: 0,
  intrusion: 1,
  'deep-water': 2,
  supervision: 3,
};

function byCategoryPriority(a, b) {
  const priorityDifference = Number(a.priority || 9) - Number(b.priority || 9);
  if (priorityDifference) return priorityDifference;
  const categoryDifference = (CATEGORY_PRIORITY[a.category] ?? 9) - (CATEGORY_PRIORITY[b.category] ?? 9);
  if (categoryDifference) return categoryDifference;
  return Number(b.ts || 0) - Number(a.ts || 0);
}

/** Prefer drowning, then the alert this lifeguard can still act on. */
function pickPrimaryAlert(alerts, pinnedId) {
  if (!alerts.length) return null;
  const ranked = [...alerts].sort(byCategoryPriority);
  const drowning = ranked.filter((alert) => alert.category === 'drowning');
  const pool = drowning.length ? drowning : ranked;

  const pinned = pinnedId ? pool.find((alert) => alert.id === pinnedId) : null;
  if (pinned && (!pinned.respondingAt || pinned.respondingMine)) return pinned;

  const mine = pool.find((alert) => alert.respondingMine);
  if (mine) return mine;

  const unclaimed = pool.find((alert) => !alert.respondingAt);
  if (unclaimed) return unclaimed;

  if (pinned) return pinned;
  return pool[0];
}

function sameActiveAlert(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const aPersonIds = a.personIds || [];
  const bPersonIds = b.personIds || [];
  return a.id === b.id
    && a.type === b.type
    && a.title === b.title
    && a.detail === b.detail
    && a.meta === b.meta
    && a.time === b.time
    && a.zone === b.zone
    && a.category === b.category
    && a.backendStatus === b.backendStatus
    && a.personId === b.personId
    && a.affectedCount === b.affectedCount
    && a.occurrenceCount === b.occurrenceCount
    && a.respondingAt === b.respondingAt
    && a.respondingMine === b.respondingMine
    && a.responderName === b.responderName
    && aPersonIds.length === bPersonIds.length
    && aPersonIds.every((id, index) => id === bPersonIds[index]);
}

function reconcileActiveAlerts(previous, incoming) {
  const previousById = new Map(previous.map((alert) => [alert.id, alert]));
  const next = incoming.map((alert) => {
    const existing = previousById.get(alert.id);
    return sameActiveAlert(existing, alert) ? existing : alert;
  });
  return next.length === previous.length && next.every((alert, index) => alert === previous[index])
    ? previous
    : next;
}

const ActiveAlertCard = React.memo(function ActiveAlertCard({ alert, busy, onRespond, onResolve, onDismiss }) {
  if (!alert) {
    return (
      <View style={styles.clearCard}>
        <View style={styles.clearDot} />
        <View style={{ flex: 1 }}>
          <Text style={styles.clearTitle}>All clear</Text>
          <Text style={styles.clearSub}>No active alerts right now</Text>
        </View>
      </View>
    );
  }

  const m = getAlertMeta(alert);
  const borderColor = m.border;
  const badgeBg = m.tint;
  const badgeBorder = m.accent;
  const ackShadow = {
    shadowColor: m.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.26,
    shadowRadius: 10,
    elevation: 4,
  };

  return (
    <View style={[styles.activeCard, { borderColor }]}>
      <View>
        <View style={styles.activeTop}>
          <View style={[styles.alarmBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
            <Text style={[styles.alarmBadgeText, { color: m.accent }]}>{m.badge}</Text>
          </View>
          <Text style={[styles.activeTime, { color: m.accent }]}>
            {formatEventTime(alert.time)}
          </Text>
        </View>

        <Text style={styles.activeTitle} numberOfLines={2}>{alert.title}</Text>
        <Text style={styles.activePerson}>{modalPerson(alert)}</Text>
        <Text style={styles.activeDescription}>{modalDescription(alert)}</Text>
        {alert.occurrenceCount > 1 ? (
          <Text style={styles.groupedDetection}>
            Grouped from {alert.occurrenceCount} matching detections
          </Text>
        ) : null}
        <Text style={styles.activeZone}>{alert.zone}</Text>
      </View>

      {alert.respondingAt ? (
        <Text style={[styles.handoffText, alert.respondingMine && { color: colors.safe }]}>
          {alert.respondingMine
            ? 'You are responding to this alert'
            : `${alert.responderName || 'Another lifeguard'} is responding`}
        </Text>
      ) : null}
      {alert.respondingMine ? (
        <View style={styles.activeActions}>
          <TouchableOpacity
            style={[styles.ackBtn, { backgroundColor: colors.safe }]}
            onPress={() => onResolve(alert.id)}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={styles.ackText}>Mark as Resolved</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dismissBtn, { borderColor: m.accent }]}
            onPress={() => onDismiss(alert.id)}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={[styles.dismissText, { color: m.accent }]}>False Alarm</Text>
          </TouchableOpacity>
        </View>
      ) : !alert.respondingAt ? (
        <TouchableOpacity
          style={[
            styles.ackBtn,
            styles.respondBtn,
            { backgroundColor: m.accent },
            ackShadow,
          ]}
          onPress={() => onRespond(alert.id)}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Text style={[styles.ackText, { color: m.buttonText }]}>
            {busy ? 'Updating…' : 'Respond now'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

function OverviewSection({ stats }) {
  return (
    <View style={styles.overviewCard}>
      {stats.map((stat, index) => (
        <View
          key={stat.key}
          style={[styles.overviewCell, index < stats.length - 1 && styles.overviewCellGap]}
        >
          <Text style={[styles.overviewValue, { color: stat.color }]}>{stat.value}</Text>
          <Text style={styles.overviewLabel} numberOfLines={1} adjustsFontSizeToFit>
            {stat.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ChevronRight({ color = colors.textTertiary, size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 6l6 6-6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const OpenAlertRow = React.memo(function OpenAlertRow({ alert, onSelect, showDivider }) {
  const m = getAlertMeta(alert);
  const status = responseStatusLabel(alert);
  const handlePress = useCallback(() => onSelect?.(alert), [alert, onSelect]);
  const statusColor = !alert.respondingAt
    ? m.accent
    : alert.respondingMine
      ? colors.safe
      : colors.textSecondary;

  return (
    <TouchableOpacity
      style={[styles.recentRow, showDivider && styles.recentRowDivider]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={[styles.recentStripe, { backgroundColor: m.accent }]} />
      <View style={styles.recentCopy}>
        <Text style={styles.recentTitle} numberOfLines={1}>{alert.title}</Text>
        <Text style={styles.recentMeta} numberOfLines={1}>
          {alert.zone} · {formatEventTime(alert.time)}
          {alert.occurrenceCount > 1 ? ` · ${alert.occurrenceCount} detections` : ''}
        </Text>
        <Text style={[styles.openStatus, { color: statusColor }]} numberOfLines={1}>
          {status}
        </Text>
      </View>
      <ChevronRight />
    </TouchableOpacity>
  );
});

const RecentAlertsSection = React.memo(function RecentAlertsSection({
  alerts,
  onSelect,
  onViewAll,
}) {
  if (!alerts.length) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent alerts</Text>
        <TouchableOpacity
          style={styles.viewAllButton}
          onPress={onViewAll}
          hitSlop={8}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="View all alerts"
        >
          <Text style={styles.viewAllText}>View all</Text>
          <ChevronRight color={colors.accent} size={14} />
        </TouchableOpacity>
      </View>
      <Text style={styles.sectionHint}>
        Latest open alerts that still need handling.
      </Text>
      <View style={styles.recentCard}>
        {alerts.map((alert, index) => (
          <OpenAlertRow
            key={alert.id}
            alert={alert}
            showDivider={index < alerts.length - 1}
            onSelect={onSelect}
          />
        ))}
      </View>
    </View>
  );
});

function pickFocusedAlert(alerts, focus) {
  const ids = [focus?.eventId, ...(Array.isArray(focus?.eventIds) ? focus.eventIds : [])].filter(Boolean);
  for (const id of ids) {
    const found = alerts.find((alert) => alert.id === id);
    if (found) return found;
  }
  return null;
}

export default function AlertsScreen({ onViewAllAlerts, onPendingCountChange, focusAlert }) {
  const { tabBarClearance } = useLayoutInsets();
  const { token } = useAuth();
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [ackCount, setAckCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(true);
  const [status, setStatus] = useState(null);
  const [responding, setResponding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pinnedId, setPinnedId] = useState(null);
  const [closePrompt, setClosePrompt] = useState(null);
  const [falseAlarmReason, setFalseAlarmReason] = useState('');
  const loadRequestId = useRef(0);
  const closingAlertIds = useRef(new Set());

  useEffect(() => {
    const focused = pickFocusedAlert(activeAlerts, focusAlert);
    if (focused) setPinnedId(focused.id);
  }, [focusAlert, activeAlerts]);

  const loadAlerts = useCallback(async () => {
    if (!token) return;
    const requestId = ++loadRequestId.current;
    const pendingRes = await fetchMobileEvents(token, {
      alertsOnly: true,
      status: 'pending',
      limit: 50,
      ackSince: localMidnightTimestamp(),
    });

    // A slower, older poll must never restore alerts that a newer refresh
    // already removed after they were resolved or marked as false alarms.
    if (requestId !== loadRequestId.current) return;

    if (!pendingRes.ok) {
      setConnected(false);
      setError(pendingRes.error || 'Could not load alerts');
      setLoading(false);
      return;
    }

    setConnected(true);
    setError('');
    const nextActiveAlerts = (pendingRes.events || [])
      .filter((alert) => (
        alert.backendStatus === 'pending' && !closingAlertIds.current.has(alert.id)
      ))
      .sort(byCategoryPriority);
    setActiveAlerts((current) => reconcileActiveAlerts(current, nextActiveAlerts));
    setAckCount(pendingRes.acknowledgedToday ?? 0);
    setSelectedAlert((current) => {
      if (!current) return null;
      const matching = nextActiveAlerts.find((alert) => alert.id === current.id) || null;
      return sameActiveAlert(current, matching) ? current : matching;
    });
    onPendingCountChange?.(pendingRes.pendingCount ?? pendingRes.events?.length ?? 0);
    setLoading(false);
  }, [token, onPendingCountChange]);

  const retryLoad = useCallback(() => {
    setLoading(true);
    loadAlerts();
  }, [loadAlerts]);

  useAutoRefresh(loadAlerts, POLL_MS, Boolean(token), getMobileAlertStreamUrl(token));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAlerts();
    setRefreshing(false);
  }, [loadAlerts]);

  const handleRespond = useCallback(async (id) => {
    setResponding(true);
    const result = await respondToMobileEvent(token, id);
    setResponding(false);
    if (!result.ok) {
      const taken = result.event?.respondingAt && !result.event?.respondingMine;
      if (taken) {
        // No popup — Home shows "{name} is responding" and jumps to the next open alert.
        setPinnedId(null);
      } else {
        setStatus({ tone: 'error', title: 'Could not respond', message: result.error || 'Failed to claim this alert.' });
      }
    } else {
      setPinnedId(id);
      if (result.event) {
        setActiveAlerts((prev) => prev.map((alert) => (alert.id === id ? result.event : alert)));
      }
    }
    await loadAlerts();
  }, [token, loadAlerts]);

  const handleResolve = useCallback(async (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    closingAlertIds.current.add(id);
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
    setPinnedId((current) => (current === id ? null : current));
    const result = await updateMobileEventStatus(token, id, 'resolved');
    if (!result.ok) {
      closingAlertIds.current.delete(id);
      setStatus({ tone: 'error', title: 'Could not resolve', message: result.error || 'Failed to resolve this alert.' });
      await loadAlerts();
      return;
    }
    onPendingCountChange?.(result.pendingCount);
    await loadAlerts();
    closingAlertIds.current.delete(id);
  }, [token, loadAlerts, onPendingCountChange]);

  const handleDismiss = useCallback(async (id, reason) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    closingAlertIds.current.add(id);
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
    setPinnedId((current) => (current === id ? null : current));
    const result = await updateMobileEventStatus(token, id, 'dismissed', reason);
    if (!result.ok) {
      closingAlertIds.current.delete(id);
      setStatus({ tone: 'error', title: 'Could not dismiss', message: result.error || 'Failed to dismiss this alert.' });
      await loadAlerts();
      return;
    }
    onPendingCountChange?.(result.pendingCount);
    await loadAlerts();
    closingAlertIds.current.delete(id);
  }, [token, loadAlerts, onPendingCountChange]);

  const closeAlertModal = useCallback(() => setSelectedAlert(null), []);
  const requestClose = useCallback((id, type) => {
    setSelectedAlert(null);
    setFalseAlarmReason('');
    setClosePrompt({ id, type });
  }, []);
  const cancelClose = useCallback(() => {
    setClosePrompt(null);
    setFalseAlarmReason('');
  }, []);
  const confirmClose = useCallback(() => {
    if (!closePrompt) return;
    if (closePrompt.type === 'dismissed' && !falseAlarmReason.trim()) {
      setStatus({ tone: 'error', title: 'Reason required', message: 'Enter why this detection was a false alarm.' });
      return;
    }
    const { id, type } = closePrompt;
    cancelClose();
    if (type === 'dismissed') handleDismiss(id, falseAlarmReason.trim());
    else handleResolve(id);
  }, [closePrompt, falseAlarmReason, cancelClose, handleDismiss, handleResolve]);

  const primary = useMemo(() => pickPrimaryAlert(activeAlerts, pinnedId), [activeAlerts, pinnedId]);
  const otherOpenAlerts = useMemo(
    () => activeAlerts.filter((item) => item.id !== primary?.id),
    [activeAlerts, primary?.id]
  );
  const recentAlerts = useMemo(() => otherOpenAlerts.slice(0, 5), [otherOpenAlerts]);
  const stats = useMemo(() => {
    const intrusion = activeAlerts
      .filter((alert) => ZONE_CATEGORIES.includes(alert.category))
      .reduce((total, alert) => total + Math.max(1, Number(alert.occurrenceCount) || 1), 0);
    const drowning = activeAlerts
      .filter((alert) => alert.category === 'drowning')
      .reduce((total, alert) => total + Math.max(1, Number(alert.occurrenceCount) || 1), 0);
    const respondingCount = activeAlerts.filter((alert) => alert.respondingAt).length;

    return [
      { key: 'intrusion', label: 'Intrusion', value: String(intrusion), color: intrusion > 0 ? colors.alarm : colors.textPrimary },
      { key: 'drowning', label: 'Drowning', value: String(drowning), color: drowning > 0 ? colors.alarm : colors.textPrimary },
      { key: 'responding', label: 'Responding', value: String(respondingCount), color: respondingCount > 0 ? colors.warn : colors.textPrimary },
      { key: 'ack', label: 'Acknowledged', value: String(ackCount), color: colors.safe },
    ];
  }, [activeAlerts, ackCount]);

  useEffect(() => {
    if (pinnedId && !activeAlerts.some((alert) => alert.id === pinnedId)) {
      setPinnedId(null);
    }
  }, [activeAlerts, pinnedId]);

  const openActionAlert = useCallback((alert) => setSelectedAlert(alert), []);
  const selectedActions = useMemo(() => {
    if (!selectedAlert) return [];
    if (selectedAlert.backendStatus !== 'pending'
      || (selectedAlert.respondingAt && !selectedAlert.respondingMine)) {
      return [{ label: 'Close', tone: 'secondary', onPress: closeAlertModal }];
    }
    if (selectedAlert.respondingMine) {
      return [
        {
          label: 'Mark as Resolved',
          tone: 'primary',
          onPress: () => requestClose(selectedAlert.id, 'resolved'),
        },
        {
          label: 'False Alarm',
          tone: 'secondary',
          onPress: () => requestClose(selectedAlert.id, 'dismissed'),
        },
      ];
    }
    return [{
      label: 'Respond Now',
      tone: 'alert',
      onPress: () => { const id = selectedAlert.id; closeAlertModal(); handleRespond(id); },
    }];
  }, [selectedAlert, closeAlertModal, handleRespond, requestClose]);
  const selectedPalette = useMemo(() => modalActionPalette(selectedAlert), [selectedAlert]);
  const contentStyle = useMemo(
    () => [styles.content, { paddingBottom: tabBarClearance + spacing.md }],
    [tabBarClearance]
  );
  const refreshControl = useMemo(() => (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
  ), [refreshing, onRefresh]);

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        <ProfileHero online={connected} />

        {loading && !activeAlerts.length ? (
          <AlertsHomeSkeleton onRetry={retryLoad} />
        ) : error && !activeAlerts.length ? (
          <DataLoadError message={error} onRetry={retryLoad} />
        ) : (
          <>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <ActiveAlertCard
              alert={primary}
              busy={responding}
              onRespond={handleRespond}
              onResolve={(id) => requestClose(id, 'resolved')}
              onDismiss={(id) => requestClose(id, 'dismissed')}
            />

            <OverviewSection stats={stats} />

            <RecentAlertsSection
              alerts={recentAlerts}
              onSelect={openActionAlert}
              onViewAll={onViewAllAlerts}
            />
          </>
        )}
      </ScrollView>

      <ConfirmModal
        visible={Boolean(selectedAlert)}
        onClose={closeAlertModal}
        title={selectedAlert?.title || 'Alert'}
        tone={selectedAlert?.category === 'drowning' ? 'danger' : selectedAlert?.type === 'alarm' ? 'warning' : 'info'}
        icon="siren"
        badge={selectedAlert ? modalBadge(selectedAlert) : ''}
        subtitle={selectedAlert ? modalPerson(selectedAlert) : ''}
        meta={selectedAlert ? `${String(selectedAlert.zone || 'Pool').toUpperCase()} · ${formatEventTime(selectedAlert.time)}` : ''}
        description={selectedAlert ? modalFlowDescription(selectedAlert) : ''}
        actions={selectedActions}
        stackedActions
        actionColor={selectedPalette.color}
        actionTint={selectedPalette.tint}
        actionTextColor={selectedPalette.text}
        actionSecondaryTextColor={selectedPalette.secondaryText}
        accentColor={selectedPalette.color}
        accentTint={selectedPalette.tint}
        presentation="incident"
      />
      <StatusModal
        visible={Boolean(status)}
        onClose={() => setStatus(null)}
        title={status?.title}
        message={status?.message}
        tone={status?.tone}
      />
      <ConfirmModal
        visible={Boolean(closePrompt)}
        onClose={cancelClose}
        title={closePrompt?.type === 'dismissed' ? 'Mark as false alarm?' : 'Resolve this incident?'}
        message={closePrompt?.type === 'dismissed'
          ? 'This closes the incident and saves the reason to Event History.'
          : 'Confirm that you assessed the situation and the area is now safe.'}
        tone={closePrompt?.type === 'dismissed' ? 'warning' : 'info'}
        actions={[
          { label: 'Cancel', tone: 'secondary', onPress: cancelClose },
          { label: closePrompt?.type === 'dismissed' ? 'Confirm False Alarm' : 'Confirm Resolution', tone: 'primary', onPress: confirmClose },
        ]}
      >
        {closePrompt?.type === 'dismissed' ? (
          <TextInput
            style={styles.reasonInput}
            value={falseAlarmReason}
            onChangeText={setFalseAlarmReason}
            placeholder="False-alarm reason (required)"
            multiline
            maxLength={300}
          />
        ) : null}
      </ConfirmModal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 18,
  },

  errorText: {
    fontSize: typography.sm,
    color: colors.alarm,
    fontWeight: '600',
  },
  reasonInput: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    backgroundColor: colors.bgPanel,
    textAlignVertical: 'top',
  },

  clearCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    ...shadow.sm,
  },
  clearDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.safe,
  },
  clearTitle: {
    fontSize: typography.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  clearSub: {
    marginTop: 2,
    fontSize: typography.sm,
    color: colors.textSecondary,
  },

  activeCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 16,
    ...shadow.sm,
  },
  activeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  alarmBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  alarmBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  activeTime: {
    fontSize: typography.sm,
    fontWeight: '700',
  },
  activeTitle: {
    fontSize: typography.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  activePerson: {
    marginTop: 6,
    fontSize: typography.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  activeDescription: {
    marginTop: 6,
    fontSize: typography.sm,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  groupedDetection: {
    marginTop: 6,
    fontSize: typography.xs,
    fontWeight: '700',
    color: colors.textTertiary,
  },
  activeZone: {
    marginTop: 8,
    marginBottom: 16,
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  activeActions: {
    flexDirection: 'row',
    gap: 10,
  },
  respondBtn: {
    flex: 1.55,
    alignSelf: 'stretch',
  },
  handoffText: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  handoffHint: {
    fontSize: typography.xs,
    fontWeight: '500',
    color: colors.textTertiary,
    marginBottom: 4,
  },
  ackBtn: {
    flex: 1.55,
    minHeight: 52,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ackText: {
    color: '#FFFFFF',
    fontSize: typography.md,
    fontWeight: '700',
  },
  dismissBtn: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPanel,
    borderWidth: 1.5,
  },
  dismissText: {
    fontSize: typography.md,
    fontWeight: '700',
  },

  overviewCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.bgPanel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: 16,
    paddingHorizontal: 8,
    ...shadow.sm,
  },
  overviewCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  overviewCellGap: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.borderSubtle,
  },
  overviewValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  overviewLabel: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  viewAllText: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: colors.accent,
  },
  viewAllButton: {
    minHeight: 32,
    paddingLeft: 10,
    paddingRight: 7,
    borderRadius: radius.full,
    backgroundColor: colors.accentTint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  sectionHint: {
    marginTop: -4,
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  openStatus: {
    marginTop: 4,
    fontSize: typography.xs,
    fontWeight: '700',
  },

  recentCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 14,
    minHeight: 56,
  },
  recentRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  recentStripe: {
    width: 4,
    alignSelf: 'stretch',
    marginRight: 12,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  recentCopy: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 2,
  },
  recentTitle: {
    fontSize: typography.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  recentMeta: {
    marginTop: 3,
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
