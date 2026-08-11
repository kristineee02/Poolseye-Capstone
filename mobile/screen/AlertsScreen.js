// PoolsEye — Home dashboard
// Header → Alarm card → Overview strip → Recent alerts

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, LayoutAnimation,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radius, spacing, typography, shadow } from '../theme/tokens';
import { alerts as initialAlerts } from '../data';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import ProfileHero from '../components/ProfileHero';
import ConfirmModal from '../components/ConfirmModal';

function getAlertMeta(alert) {
  const isAlarm = alert.type === 'alarm';
  return {
    isAlarm,
    accent: isAlarm ? colors.alarm : colors.warn,
    zoneColor: isAlarm ? colors.alarm : colors.warn,
    badge: isAlarm ? 'ALARM' : 'WARNING',
  };
}

function formatDisplayTime(time) {
  if (!time) return '';
  const match = String(time).match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (match) {
    return `${Number(match[1])}:${match[2]} ${match[3].toUpperCase()}`;
  }
  const parsed = new Date(`1970-01-01T${time}`);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  return time;
}

function ActiveAlertCard({ alert, onOpen, onAcknowledge, onDismiss }) {
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
      <TouchableOpacity onPress={() => onOpen(alert.id)} activeOpacity={0.9}>
        <View style={styles.activeTop}>
          <View style={[styles.alarmBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
            <Text style={[styles.alarmBadgeText, { color: m.accent }]}>{m.badge}</Text>
          </View>
          <Text style={[styles.activeTime, { color: m.accent }]}>
            {formatDisplayTime(alert.time)}
          </Text>
        </View>

        <Text style={styles.activeTitle} numberOfLines={2}>{alert.title}</Text>
        <Text style={styles.activeZone}>{alert.zone}</Text>
      </TouchableOpacity>

      <View style={styles.activeActions}>
        <TouchableOpacity
          style={[styles.ackBtn, { backgroundColor: m.accent }, ackShadow]}
          onPress={() => onAcknowledge(alert.id)}
          activeOpacity={0.85}
        >
          <Text style={styles.ackText}>Acknowledge</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dismissBtn, { borderColor: m.accent }]}
          onPress={() => onDismiss(alert.id)}
          activeOpacity={0.85}
        >
          <Text style={[styles.dismissText, { color: m.accent }]}>Dismiss</Text>
        </TouchableOpacity>
      </View>
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
          <Text style={styles.overviewLabel}>{s.label}</Text>
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
          {alert.zone} · {formatDisplayTime(alert.time)}
        </Text>
      </View>
      <ChevronRight />
    </TouchableOpacity>
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

export default function AlertsScreen({ onViewAllAlerts }) {
  const { tabBarClearance } = useLayoutInsets();
  const [activeAlerts, setActiveAlerts] = useState(initialAlerts);
  const [acknowledged, setAcknowledged] = useState({});
  const [openedIds, setOpenedIds] = useState({});
  const [selectedAlert, setSelectedAlert] = useState(null);

  const markOpened = (id) => {
    setOpenedIds((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  const removeAlert = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleAcknowledge = (id) => {
    const time = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    markOpened(id);
    setAcknowledged((prev) => ({ ...prev, [id]: time }));
    removeAlert(id);
  };

  const handleDismiss = (id) => {
    markOpened(id);
    removeAlert(id);
  };

  const openRecentAlert = (alert) => {
    markOpened(alert.id);
    setSelectedAlert(alert);
  };

  const closeRecentAlert = () => setSelectedAlert(null);

  const latest = activeAlerts[0] || null;
  const recent = activeAlerts.slice(0, 4);

  const stats = useMemo(() => {
    const alarms = activeAlerts.filter((a) => a.type === 'alarm').length;
    const warnings = activeAlerts.filter((a) => a.type === 'warn').length;
    const active = activeAlerts.length;
    const cleared = Object.keys(acknowledged).length;
    return [
      { key: 'intrusion', label: 'Intrusion', value: String(active), color: active > 0 ? colors.alarm : colors.textPrimary },
      { key: 'alarms', label: 'Alarms', value: String(alarms), color: alarms > 0 ? colors.alarm : colors.textPrimary },
      { key: 'warnings', label: 'Warnings', value: String(warnings), color: warnings > 0 ? colors.warn : colors.textPrimary },
      { key: 'ack', label: 'Acknowledge', value: String(cleared), color: colors.safe },
    ];
  }, [activeAlerts, acknowledged]);

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance + spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHero online />

        <ActiveAlertCard
          alert={latest}
          onOpen={markOpened}
          onAcknowledge={handleAcknowledge}
          onDismiss={handleDismiss}
        />

        <OverviewSection stats={stats} />

        <RecentAlertsSection
          alerts={recent}
          onViewAll={onViewAllAlerts}
          onOpenAlert={openRecentAlert}
        />
      </ScrollView>

      <ConfirmModal
        visible={Boolean(selectedAlert)}
        onClose={closeRecentAlert}
        title={selectedAlert?.title || 'Alert'}
        message={
          selectedAlert
            ? `${selectedAlert.zone} · ${formatDisplayTime(selectedAlert.time)}\n\n${selectedAlert.detail || selectedAlert.meta || ''}`
            : ''
        }
        actions={[
          {
            label: 'Close',
            tone: 'secondary',
            onPress: closeRecentAlert,
          },
          {
            label: 'View in All Alerts',
            tone: 'primary',
            onPress: () => {
              closeRecentAlert();
              onViewAllAlerts?.();
            },
          },
        ]}
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
