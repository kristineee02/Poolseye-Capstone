// PoolsEye — Dashboard (AlertsScreen)
// Layout: Latest Alert → 2×2 stats → Recent Alerts (PoolsEye light theme)

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { colors, radius, spacing, typography, shadow } from '../theme/tokens';
import { alerts as initialAlerts } from '../data';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import ProfileHero from '../components/ProfileHero';

function getAlertMeta(alert) {
  const isAlarm = alert.type === 'alarm';
  return {
    isAlarm,
    priority: isAlarm ? 'HIGH' : 'MED',
    accent: isAlarm ? colors.alarm : colors.warn,
    accentTint: isAlarm ? colors.alarmTint : colors.warnTint,
    accentBorder: isAlarm ? colors.alarmBorder : colors.warnBorder,
    accentDark: isAlarm ? colors.alarmDark : colors.warnDark,
    accentMid: isAlarm ? colors.alarmMid : colors.warnMid,
    line: `${alert.zone} · ${alert.time} · ${isAlarm ? 'Needs response' : 'Check feed'}`,
    recentLine: `${alert.zone} · ${alert.time} · ${isAlarm ? 'HIGH' : 'MED'}`,
  };
}

function PriorityBadge({ label, accent, accentTint }) {
  return (
    <View style={[styles.badge, { backgroundColor: accentTint, borderColor: accent + '44' }]}>
      <Text style={[styles.badgeText, { color: accent }]}>{label}</Text>
    </View>
  );
}

/** Intrusion = alert triangle · Warning = alert circle */
function CodeIcon({ isAlarm, accent, code }) {
  const alarm = typeof isAlarm === 'boolean' ? isAlarm : code === 'ALM';
  return (
    <View style={[styles.codeIcon, { backgroundColor: accent }]} accessibilityLabel={alarm ? 'Alarm' : 'Warning'}>
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        {alarm ? (
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
            <Circle
              cx={12}
              cy={12}
              r={9}
              stroke="#FFFFFF"
              strokeWidth={1.85}
            />
            <Line x1={12} y1={8} x2={12} y2={12} stroke="#FFFFFF" strokeWidth={1.85} strokeLinecap="round" />
            <Circle cx={12} cy={16} r={1.15} fill="#FFFFFF" />
          </>
        )}
      </Svg>
    </View>
  );
}

function LatestAlertCard({ alert, onAcknowledge, onDismiss }) {
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
    <View style={styles.sectionCard}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Latest Alert</Text>
        <View style={styles.badgeRow}>
          <PriorityBadge label={m.priority} accent={m.accent} accentTint={m.accentTint} />
          <PriorityBadge label="NEW" accent={m.accent} accentTint={m.accentTint} />
        </View>
      </View>

      <View style={styles.latestBody}>
        <CodeIcon isAlarm={m.isAlarm} accent={m.accent} />
        <View style={styles.latestCopy}>
          <Text style={styles.latestTitle} numberOfLines={2}>{alert.title}</Text>
          <Text style={styles.latestMeta}>{m.line}</Text>
        </View>
      </View>

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
      <View style={styles.recentBadges}>
        <PriorityBadge label={m.priority} accent={m.accent} accentTint={m.accentTint} />
        <PriorityBadge label="NEW" accent={m.accent} accentTint={m.accentTint} />
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

  const handleAcknowledge = (id) => {
    const time = new Date().toLocaleTimeString('en-US');
    setAcknowledged((prev) => ({ ...prev, [id]: time }));
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleDismiss = (id) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const latest = activeAlerts[0] || null;
  const recent = activeAlerts.slice(0, 4);

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
      contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
      showsVerticalScrollIndicator={false}
    >
      <ProfileHero online />

      <LatestAlertCard
        alert={latest}
        onAcknowledge={handleAcknowledge}
        onDismiss={handleDismiss}
      />

      <StatsGrid stats={stats} />

      <RecentAlertsCard alerts={recent} />

      <View style={{ height: spacing.sm }} />
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
    gap: 14,
  },

  sectionCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 16,
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
  },

  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  codeIcon: {
    width: 48,
    height: 48,
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
  },
  latestCopy: {
    flex: 1,
    minWidth: 0,
  },
  latestTitle: {
    fontSize: typography.md,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  latestMeta: {
    marginTop: 4,
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPanel,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  allClearBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
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
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },

  viewAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgRaised,
  },
  viewAllText: {
    fontSize: typography.xs,
    fontWeight: '700',
    color: colors.accentStrong,
  },

  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  recentRowBorder: {
    borderBottomWidth: 1,
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
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  recentBadges: {
    gap: 4,
    alignItems: 'flex-end',
  },
  emptyRecent: {
    fontSize: typography.sm,
    color: colors.textTertiary,
    paddingVertical: 8,
  },
});
