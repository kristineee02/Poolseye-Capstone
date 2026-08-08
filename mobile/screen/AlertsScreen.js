// PoolsEye — Dashboard (Home)
// Latest Alert → stats → Recent Alerts

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated, LayoutAnimation,
} from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { colors, radius, spacing, typography, shadow, touch } from '../theme/tokens';
import { alerts as initialAlerts } from '../data';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import ProfileHero from '../components/ProfileHero';

function getAlertMeta(alert) {
  const isAlarm = alert.type === 'alarm';
  return {
    isAlarm,
    accent: isAlarm ? colors.alarm : colors.warn,
    accentTint: isAlarm ? colors.alarmTint : colors.warnTint,
    accentBorder: isAlarm ? colors.alarmBorder : colors.warnBorder,
    accentMid: isAlarm ? colors.alarmMid : colors.warnMid,
    line: `${alert.zone} · ${alert.time} · ${isAlarm ? 'Needs response' : 'Check feed'}`,
    recentLine: `${alert.zone} · ${alert.time}`,
  };
}

function CodeIcon({ isAlarm, accent }) {
  return (
    <View style={[styles.codeIcon, { backgroundColor: accent }]} accessibilityLabel={isAlarm ? 'Alarm' : 'Warning'}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        {isAlarm ? (
          <>
            <Path
              d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              stroke="#FFFFFF"
              strokeWidth={1.85}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Line x1={12} y1={9} x2={12} y2={13} stroke="#FFFFFF" strokeWidth={1.85} strokeLinecap="round" />
            <Circle cx={12} cy={17} r={1.15} fill="#FFFFFF" />
          </>
        ) : (
          <>
            <Circle cx={12} cy={12} r={9} stroke="#FFFFFF" strokeWidth={1.85} />
            <Line x1={12} y1={8} x2={12} y2={12} stroke="#FFFFFF" strokeWidth={1.85} strokeLinecap="round" />
            <Circle cx={12} cy={16} r={1.15} fill="#FFFFFF" />
          </>
        )}
      </Svg>
    </View>
  );
}

function LatestAlertCard({ alert, unread, onOpen, onAcknowledge, onDismiss }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!unread) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [unread, pulse]);

  if (!alert) {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Latest Alert</Text>
        <View style={styles.allClearBox}>
          <View style={styles.allClearDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.allClearTitle}>All clear</Text>
            <Text style={styles.allClearSub}>No active alerts right now</Text>
          </View>
        </View>
      </View>
    );
  }

  const m = getAlertMeta(alert);

  return (
    <View
      style={[
        styles.sectionCard,
        unread && {
          backgroundColor: m.accentTint,
          borderColor: m.accentBorder,
        },
      ]}
    >
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Latest Alert</Text>
        {unread ? (
          <Animated.View style={[styles.unreadDot, { opacity: pulse }]} accessibilityLabel="Unacknowledged" />
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.latestBody}
        onPress={() => onOpen(alert.id)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={unread ? 'Open new alert' : 'Alert details'}
      >
        <CodeIcon isAlarm={m.isAlarm} accent={m.accent} />
        <View style={styles.latestCopy}>
          <Text style={[styles.latestTitle, unread && styles.unreadTitle]} numberOfLines={2}>
            {alert.title}
          </Text>
          <Text style={styles.latestMeta}>{m.line}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: m.accent }]}
          onPress={() => onAcknowledge(alert.id)}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>
            {m.isAlarm ? 'Acknowledge & respond' : 'Acknowledge'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: m.accentBorder }]}
          onPress={() => onDismiss(alert.id)}
          activeOpacity={0.85}
        >
          <Text style={[styles.secondaryBtnText, { color: m.accentMid }]}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StatsGrid({ stats }) {
  return (
    <View style={styles.statsGrid}>
      {stats.map((s) => (
        <View key={s.label} style={styles.statCard}>
          <Text style={styles.statLabel}>{s.label}</Text>
          <Text style={[styles.statValue, s.emphasize && { color: colors.alarm }]}>
            {s.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function RecentAlertRow({ alert, isLast }) {
  const m = getAlertMeta(alert);
  return (
    <View style={[styles.recentRow, !isLast && styles.recentRowBorder]}>
      <CodeIcon isAlarm={m.isAlarm} accent={m.accent} />
      <View style={styles.recentCopy}>
        <Text style={styles.recentTitle} numberOfLines={1}>{alert.title}</Text>
        <Text style={styles.recentMeta} numberOfLines={1}>{m.recentLine}</Text>
      </View>
    </View>
  );
}

function RecentAlertsCard({ alerts }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Recent Alerts</Text>
      </View>

      {alerts.length === 0 ? (
        <Text style={styles.emptyRecent}>No recent alerts in this session.</Text>
      ) : (
        alerts.map((alert, i) => (
          <RecentAlertRow
            key={alert.id}
            alert={alert}
            isLast={i === alerts.length - 1}
          />
        ))
      )}
    </View>
  );
}

export default function AlertsScreen() {
  const { tabBarClearance } = useLayoutInsets();
  const [activeAlerts, setActiveAlerts] = useState(initialAlerts);
  const [acknowledged, setAcknowledged] = useState({});
  const [openedIds, setOpenedIds] = useState({});

  const markOpened = (id) => {
    setOpenedIds((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  const removeAlert = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleAcknowledge = (id) => {
    const time = new Date().toLocaleTimeString('en-US');
    markOpened(id);
    setAcknowledged((prev) => ({ ...prev, [id]: time }));
    removeAlert(id);
  };

  const handleDismiss = (id) => {
    markOpened(id);
    removeAlert(id);
  };

  const latest = activeAlerts[0] || null;
  const recent = activeAlerts.slice(0, 4);
  const latestUnread = latest ? !openedIds[latest.id] : false;

  const stats = useMemo(() => {
    const intrusion = activeAlerts.filter((a) => a.type === 'alarm').length;
    const warning = activeAlerts.filter((a) => a.type === 'warn').length;
    const redZone = activeAlerts.filter((a) => (a.zone || '').toLowerCase().includes('red')).length;
    const ackCount = Object.keys(acknowledged).length;
    return [
      { label: 'Intrusion', value: String(intrusion), emphasize: intrusion > 0 },
      { label: 'Warning', value: String(warning), emphasize: false },
      { label: 'Red Zone', value: String(redZone), emphasize: redZone > 0 },
      { label: 'Acknowledged', value: String(ackCount), emphasize: false },
    ];
  }, [activeAlerts, acknowledged]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance + spacing.sm }]}
      showsVerticalScrollIndicator={false}
    >
      <ProfileHero online />

      <LatestAlertCard
        alert={latest}
        unread={latestUnread}
        onOpen={markOpened}
        onAcknowledge={handleAcknowledge}
        onDismiss={handleDismiss}
      />

      <StatsGrid stats={stats} />

      <RecentAlertsCard alerts={recent} />
    </ScrollView>
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
    gap: spacing.md,
  },

  sectionCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    ...shadow.sm,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: typography.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },

  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    flexShrink: 0,
  },
  unreadTitle: {
    fontWeight: '800',
  },

  codeIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  latestBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    minHeight: touch.min,
  },
  latestCopy: {
    flex: 1,
    minWidth: 0,
  },
  latestTitle: {
    fontSize: typography.md,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 21,
  },
  latestMeta: {
    marginTop: 4,
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
    lineHeight: 18,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    minHeight: touch.comfortable,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: typography.base,
    fontWeight: '700',
  },
  secondaryBtn: {
    minHeight: touch.comfortable,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPanel,
  },
  secondaryBtnText: {
    fontSize: typography.base,
    fontWeight: '600',
  },

  allClearBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  allClearDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.safe,
  },
  allClearTitle: {
    fontSize: typography.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  allClearSub: {
    marginTop: 2,
    fontSize: typography.sm,
    color: colors.textSecondary,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  statCard: {
    width: '48.5%',
    backgroundColor: colors.bgPanel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: 16,
    paddingHorizontal: 14,
    ...shadow.sm,
  },
  statLabel: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 8,
  },
  statValue: {
    fontSize: typography.kpi,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.6,
  },

  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    minHeight: touch.min,
  },
  recentRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  recentCopy: {
    flex: 1,
    minWidth: 0,
  },
  recentTitle: {
    fontSize: typography.base,
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
