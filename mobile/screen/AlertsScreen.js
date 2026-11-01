import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, LayoutAnimation,
  RefreshControl,
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
import { acknowledgeMobileEvent, fetchMobileEvents, respondToMobileEvent, updateMobileEventStatus } from '../api/events';
import { formatEventTime, localMidnightTimestamp } from '../utils/dateTime';

const POLL_MS = 4000;
const ZONE_CATEGORIES = ['intrusion', 'deep-water', 'supervision'];

function getAlertMeta(alert) {
  const isAlarm = alert.type === 'alarm';
  return {
    isAlarm,
    accent: isAlarm ? colors.alarm : colors.warn,
    zoneColor: isAlarm ? colors.alarm : colors.warn,
    badge: isAlarm ? 'ALARM' : 'WARNING',
  };
}

function modalBadge(alert) {
  if (alert?.category === 'drowning') return 'CRITICAL ALERT';
  if (alert?.category === 'intrusion' || alert?.category === 'deep-water') return 'HIGH PRIORITY';
  if (alert?.category === 'supervision') return 'ATTENTION';
  return 'POOL ALERT';
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

function modalActionPalette(alert) {
  if (alert?.category === 'drowning') {
    return { color: colors.alarm, tint: colors.alarmTint, text: '#FFFFFF', secondaryText: colors.alarmDark };
  }
  if (alert?.category === 'intrusion') {
    return { color: colors.high, tint: colors.highTint, text: '#FFFFFF', secondaryText: colors.highDark };
  }
  if (alert?.category === 'deep-water') {
    return { color: colors.accent, tint: colors.accentTint, text: '#FFFFFF', secondaryText: colors.accentDeep };
  }
  if (alert?.category === 'supervision') {
    return { color: colors.warn, tint: colors.warnTint, text: colors.warnDark, secondaryText: colors.warnDark };
  }
  return { color: colors.accent, tint: colors.accentTint, text: '#FFFFFF', secondaryText: colors.accentDeep };
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
  return (CATEGORY_PRIORITY[a.category] ?? 9) - (CATEGORY_PRIORITY[b.category] ?? 9);
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

function ActiveAlertCard({ alert, busy, onOpen }) {
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
  const borderColor = m.isAlarm ? colors.alarmBorder : colors.warnBorder;
  const badgeBg = m.isAlarm ? colors.alarmTint : colors.warnTint;
  const badgeBorder = m.isAlarm ? colors.alarm : colors.warn;
  const ackShadow = m.isAlarm
    ? {
        shadowColor: colors.alarm,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
        elevation: 4,
      }
    : {
        shadowColor: colors.warn,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
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
        <Text style={styles.activeZone}>{alert.zone}</Text>
      </View>

      {alert.respondingAt ? (
        <Text style={[styles.handoffText, alert.respondingMine && { color: colors.safe }]}>
          {alert.respondingMine
            ? 'You are responding to this alert'
            : `${alert.responderName || 'Another lifeguard'} is responding`}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[
          styles.ackBtn,
          styles.respondBtn,
          { backgroundColor: alert.respondingMine ? colors.safe : m.accent },
          ackShadow,
        ]}
        onPress={() => onOpen(alert)}
        disabled={busy}
        activeOpacity={0.85}
      >
        <Text style={styles.ackText}>
          {busy ? 'Updating…' : alert.respondingMine ? 'Continue response' : alert.respondingAt ? 'View alert' : 'Respond now'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function OverviewSection({ stats }) {
  return (
    <View style={styles.overviewCard}>
      {stats.map((s, index) => (
        <View
          key={s.key}
          style={[styles.overviewCell, index < stats.length - 1 && styles.overviewCellGap]}
        >
          <Text style={[styles.overviewValue, { color: s.color }]}>{s.value}</Text>
          <Text style={styles.overviewLabel} numberOfLines={1} adjustsFontSizeToFit>{s.label}</Text>
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

function RecentAlertRow({ alert, onPress, showDivider }) {
  const m = getAlertMeta(alert);
  return (
    <TouchableOpacity
      style={[styles.recentRow, showDivider && styles.recentRowDivider]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.recentStripe, { backgroundColor: m.accent }]} />
      <View style={styles.recentCopy}>
        <Text style={styles.recentTitle} numberOfLines={1}>{alert.title}</Text>
        <Text style={styles.recentMeta} numberOfLines={1}>
          {alert.zone} · {formatEventTime(alert.time)}
        </Text>
      </View>
      <ChevronRight />
    </TouchableOpacity>
  );
}

function OpenAlertRow({ alert, onPress, showDivider }) {
  const m = getAlertMeta(alert);
  const status = responseStatusLabel(alert);
  const statusColor = !alert.respondingAt
    ? m.accent
    : alert.respondingMine
      ? colors.safe
      : colors.textSecondary;

  return (
    <TouchableOpacity
      style={[styles.recentRow, showDivider && styles.recentRowDivider]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.recentStripe, { backgroundColor: m.accent }]} />
      <View style={styles.recentCopy}>
        <Text style={styles.recentTitle} numberOfLines={1}>{alert.title}</Text>
        <Text style={styles.recentMeta} numberOfLines={1}>
          {alert.zone} · {formatEventTime(alert.time)}
        </Text>
        <Text style={[styles.openStatus, { color: statusColor }]} numberOfLines={1}>
          {status}
        </Text>
      </View>
      <ChevronRight />
    </TouchableOpacity>
  );
}

function OtherOpenAlertsSection({ alerts, onSelect }) {
  if (!alerts.length) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Other open alerts</Text>
        <Text style={styles.openCount}>{alerts.length}</Text>
      </View>
      <Text style={styles.sectionHint}>
        Open alerts that still need handling. Tap one to bring it to the top.
      </Text>
      <View style={styles.recentCard}>
        {alerts.map((alert, index) => (
          <OpenAlertRow
            key={alert.id}
            alert={alert}
            showDivider={index < alerts.length - 1}
            onPress={() => onSelect?.(alert)}
          />
        ))}
      </View>
    </View>
  );
}

function RecentAlertsSection({ alerts, onViewAll, onOpenAlert }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent alerts</Text>
        <TouchableOpacity onPress={onViewAll} hitSlop={8} activeOpacity={0.8}>
          <Text style={styles.viewAll}>View all</Text>
        </TouchableOpacity>
      </View>

      {alerts.length === 0 ? (
        <Text style={styles.emptyRecent}>No recent alerts in this session.</Text>
      ) : (
        <View style={styles.recentCard}>
          {alerts.map((alert, index) => (
            <RecentAlertRow
              key={alert.id}
              alert={alert}
              showDivider={index < alerts.length - 1}
              onPress={() => onOpenAlert?.(alert)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

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
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [ackCount, setAckCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(true);
  const [status, setStatus] = useState(null);
  const [responding, setResponding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pinnedId, setPinnedId] = useState(null);

  useEffect(() => {
    const focused = pickFocusedAlert(activeAlerts, focusAlert);
    if (focused) setPinnedId(focused.id);
  }, [focusAlert, activeAlerts]);

  const loadAlerts = useCallback(async () => {
    if (!token) return;
    const [pendingRes, recentRes] = await Promise.all([
      fetchMobileEvents(token, { alertsOnly: true, status: 'pending', limit: 50, ackSince: localMidnightTimestamp() }),
      fetchMobileEvents(token, { alertsOnly: true, status: 'all', limit: 8 }),
    ]);

    if (!pendingRes.ok) {
      setConnected(false);
      setError(pendingRes.error || 'Could not load alerts');
      setLoading(false);
      return;
    }

    setConnected(true);
    setError('');
    const nextActiveAlerts = pendingRes.events || [];
    setActiveAlerts(nextActiveAlerts);
    setAckCount(pendingRes.acknowledgedToday ?? 0);
    onPendingCountChange?.(pendingRes.pendingCount ?? pendingRes.events?.length ?? 0);

    if (recentRes.ok) {
      const nextRecentAlerts = recentRes.events || [];
      setRecentAlerts(nextRecentAlerts);
      if (nextActiveAlerts.length === 0 && nextRecentAlerts.length === 0) {
        setSelectedAlert(null);
      }
    }
    setLoading(false);
  }, [token, onPendingCountChange]);

  const retryLoad = () => {
    setLoading(true);
    loadAlerts();
  };

  useAutoRefresh(loadAlerts, POLL_MS, Boolean(token));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAlerts();
    setRefreshing(false);
  };

  const handleRespond = async (id) => {
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
    }
    await loadAlerts();
  };

  const handleAcknowledge = async (id) => {
    setResponding(true);
    const result = await acknowledgeMobileEvent(token, id);
    setResponding(false);
    if (!result.ok) {
      setStatus({ tone: 'error', title: 'Could not acknowledge', message: result.error || 'Failed to acknowledge this alert.' });
    }
    await loadAlerts();
  };

  const handleResolve = async (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
    setPinnedId((current) => (current === id ? null : current));
    const result = await updateMobileEventStatus(token, id, 'resolved');
    if (!result.ok) {
      setStatus({ tone: 'error', title: 'Could not acknowledge', message: result.error || 'Failed to acknowledge this alert.' });
      await loadAlerts();
      return;
    }
    onPendingCountChange?.(result.pendingCount);
    await loadAlerts();
  };

  const handleDismiss = async (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
    setPinnedId((current) => (current === id ? null : current));
    const result = await updateMobileEventStatus(token, id, 'dismissed');
    if (!result.ok) {
      setStatus({ tone: 'error', title: 'Could not dismiss', message: result.error || 'Failed to dismiss this alert.' });
      await loadAlerts();
      return;
    }
    onPendingCountChange?.(result.pendingCount);
    await loadAlerts();
  };

  const openRecentAlert = (alert) => {
    setSelectedAlert(alert);
  };

  const closeRecentAlert = () => setSelectedAlert(null);

  const primary = pickPrimaryAlert(activeAlerts, pinnedId);
  const otherOpenAlerts = activeAlerts.filter((item) => item.id !== primary?.id);
  const activeIds = new Set(activeAlerts.map((item) => item.id));
  // Active incidents are represented only by the single card above. Keep the
  // history list from repeating that same incident (or other pending alerts).
  const recent = recentAlerts.filter((item) => !activeIds.has(item.id)).slice(0, 4);

  useEffect(() => {
    if (pinnedId && !activeAlerts.some((alert) => alert.id === pinnedId)) {
      setPinnedId(null);
    }
  }, [activeAlerts, pinnedId]);

  const stats = useMemo(() => {
    const intrusion = activeAlerts.filter((a) => ZONE_CATEGORIES.includes(a.category)).length;
    const drowning = activeAlerts.filter((a) => a.category === 'drowning').length;
    const respondingCount = activeAlerts.filter((a) => a.respondingAt).length;
    return [
      { key: 'intrusion', label: 'Intrusion', value: String(intrusion), color: intrusion > 0 ? colors.alarm : colors.textPrimary },
      { key: 'drowning', label: 'Drowning', value: String(drowning), color: drowning > 0 ? colors.alarm : colors.textPrimary },
      { key: 'responding', label: 'Responding', value: String(respondingCount), color: respondingCount > 0 ? colors.warn : colors.textPrimary },
      { key: 'ack', label: 'Acknowledged', value: String(ackCount), color: colors.safe },
    ];
  }, [activeAlerts, ackCount]);

  const openActionAlert = (alert) => setSelectedAlert(alert);
  const viewAllFromModal = () => {
    setSelectedAlert(null);
    onViewAllAlerts?.();
  };
  const selectedActions = !selectedAlert
    ? []
    : selectedAlert.backendStatus !== 'pending'
      ? [
          { label: 'View details', tone: 'primary', onPress: viewAllFromModal },
          { label: 'Close', tone: 'secondary', onPress: closeRecentAlert },
        ]
      : selectedAlert.respondingAt && !selectedAlert.respondingMine
        ? [
            { label: 'View details', tone: 'primary', onPress: viewAllFromModal },
            { label: 'Close', tone: 'secondary', onPress: closeRecentAlert },
          ]
        : selectedAlert.respondingMine
          ? [
              { label: 'Resolve', tone: 'primary', onPress: () => { const id = selectedAlert.id; closeRecentAlert(); handleResolve(id); } },
              { label: 'False alarm', tone: 'danger', onPress: () => { const id = selectedAlert.id; closeRecentAlert(); handleDismiss(id); } },
              { label: 'View details', tone: 'secondary', onPress: viewAllFromModal },
              { label: 'Close', tone: 'secondary', onPress: closeRecentAlert },
            ]
          : [
              ...(!selectedAlert.acknowledgedAt ? [{
                label: 'Acknowledge', tone: 'secondary',
                onPress: () => { const id = selectedAlert.id; closeRecentAlert(); handleAcknowledge(id); },
              }] : []),
              {
                label: "I'm responding",
                tone: 'alert',
                onPress: () => { const id = selectedAlert.id; closeRecentAlert(); handleRespond(id); },
              },
              { label: 'View details', tone: 'secondary', onPress: viewAllFromModal },
              {
                label: 'False alarm', tone: 'secondary',
                onPress: () => { const id = selectedAlert.id; closeRecentAlert(); handleDismiss(id); },
              },
            ];
  const selectedPalette = modalActionPalette(selectedAlert);

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance + spacing.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        <ProfileHero online={connected} />

        {loading && !activeAlerts.length && !recentAlerts.length ? (
          <AlertsHomeSkeleton onRetry={retryLoad} />
        ) : error && !activeAlerts.length && !recentAlerts.length ? (
          <DataLoadError message={error} onRetry={retryLoad} />
        ) : (
          <>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <ActiveAlertCard
              alert={primary}
              busy={responding}
              onOpen={openActionAlert}
            />

            <OtherOpenAlertsSection alerts={otherOpenAlerts} onSelect={openActionAlert} />

            <OverviewSection stats={stats} />

            <RecentAlertsSection
              alerts={recent}
              onViewAll={onViewAllAlerts}
              onOpenAlert={openRecentAlert}
            />
          </>
        )}
      </ScrollView>

      <ConfirmModal
        visible={Boolean(selectedAlert)}
        onClose={closeRecentAlert}
        title={selectedAlert?.title || 'Alert'}
        tone={selectedAlert?.category === 'drowning' ? 'danger' : selectedAlert?.type === 'alarm' ? 'warning' : 'info'}
        icon={selectedAlert?.category === 'drowning' ? 'alertCircle' : 'bell'}
        badge={selectedAlert ? modalBadge(selectedAlert) : ''}
        subtitle={selectedAlert ? modalPerson(selectedAlert) : ''}
        meta={selectedAlert ? `${String(selectedAlert.zone || 'Pool').toUpperCase()} · ${formatEventTime(selectedAlert.time)}` : ''}
        description={selectedAlert ? modalDescription(selectedAlert) : ''}
        actions={selectedActions}
        stackedActions
        actionColor={selectedPalette.color}
        actionTint={selectedPalette.tint}
        actionTextColor={selectedPalette.text}
        actionSecondaryTextColor={selectedPalette.secondaryText}
      />
      <StatusModal
        visible={Boolean(status)}
        onClose={() => setStatus(null)}
        title={status?.title}
        message={status?.message}
        tone={status?.tone}
      />
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
  activeZone: {
    marginTop: 4,
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
  viewAll: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: colors.accent,
  },
  openCount: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    overflow: 'hidden',
    textAlign: 'center',
    fontSize: typography.sm,
    fontWeight: '800',
    color: colors.accent,
    backgroundColor: colors.accentTint || 'rgba(30, 111, 255, 0.12)',
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
  emptyRecent: {
    fontSize: typography.sm,
    color: colors.textTertiary,
    paddingVertical: 8,
  },
});
