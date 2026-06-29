// PoolsEye — AlertsScreen
// The primary lifeguard screen: shows active alarms with pulsing indicator,
// KPI summary, and quick-action acknowledge/dismiss flow.

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated, Easing, Alert,
} from 'react-native';
import { colors, radius, spacing, typography, shadow } from '../theme/tokens';
import { alerts as initialAlerts } from '../data';
import { Tag, SectionLabel, Panel, PanelHead, ConfidenceBar, Button, Mono } from '../components/Primitives';

// ── Pulse animation ───────────────────────────────────────────────────────────
function PulseDot({ color = colors.alarm }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 2.2, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(opacity, { toValue: 0,   duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={styles.pulseWrap}>
      <Animated.View style={[styles.pulseRing, { backgroundColor: color, transform: [{ scale }], opacity }]} />
      <View style={[styles.pulseDot, { backgroundColor: color }]} />
    </View>
  );
}

// ── Active alarm card ─────────────────────────────────────────────────────────
function AlarmCard({ alert, onAcknowledge, onDismiss }) {
  const isAlarm = alert.type === 'alarm';
  const bg     = isAlarm ? colors.alarmTint : colors.warnTint;
  const border = isAlarm ? colors.alarmBorder : colors.warnBorder;
  const accent = isAlarm ? colors.alarm : colors.warn;
  const dark   = isAlarm ? colors.alarmDark : '#5C3A00';
  const mid    = isAlarm ? colors.alarmMid  : '#8A5A08';

  return (
    <View style={[styles.alarmCard, { backgroundColor: bg, borderColor: border }]}>
      {/* Left accent stripe */}
      <View style={[styles.alarmStripe, { backgroundColor: accent }]} />

      <View style={styles.alarmInner}>
        {/* Header row */}
        <View style={styles.alarmHeader}>
          <PulseDot color={accent} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.alarmTitle, { color: dark }]}>{alert.title}</Text>
            <Mono style={{ color: mid, marginTop: 2 }}>{alert.meta}</Mono>
          </View>
          <Mono style={[styles.alarmTime, { color: mid }]}>{alert.time}</Mono>
        </View>

        {/* Detail box */}
        <View style={[styles.alarmDetail, { backgroundColor: isAlarm ? 'rgba(214,54,74,0.08)' : 'rgba(182,121,10,0.08)' }]}>
          <Text style={[styles.alarmDetailText, { color: dark }]}>{alert.detail}</Text>
          {alert.confidence !== null && (
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.alarmDetailLabel, { color: mid }]}>
                ML confidence: {Math.round(alert.confidence * 100)}%
              </Text>
              <ConfidenceBar value={alert.confidence} color={accent} />
            </View>
          )}
        </View>

        {/* Camera + zone chips */}
        <View style={styles.alarmChips}>
          <View style={[styles.chip, { backgroundColor: isAlarm ? 'rgba(214,54,74,0.1)' : 'rgba(182,121,10,0.1)' }]}>
            <Text style={[styles.chipText, { color: dark }]}>{alert.camera}</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: isAlarm ? 'rgba(214,54,74,0.1)' : 'rgba(182,121,10,0.1)' }]}>
            <Text style={[styles.chipText, { color: dark }]}>{alert.zone}</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: isAlarm ? 'rgba(214,54,74,0.1)' : 'rgba(182,121,10,0.1)' }]}>
            <Text style={[styles.chipText, { color: dark }]}>{alert.date}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.alarmActions}>
          <TouchableOpacity
            style={[styles.ackBtn, { backgroundColor: accent }]}
            onPress={() => onAcknowledge(alert.id)}
            activeOpacity={0.82}
          >
            <Text style={styles.ackBtnText}>
              {isAlarm ? 'Acknowledge & respond' : 'Acknowledge'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dismissBtn, { borderColor: border }]}
            onPress={() => onDismiss(alert.id)}
            activeOpacity={0.82}
          >
            <Text style={[styles.dismissBtnText, { color: mid }]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Acknowledged banner ───────────────────────────────────────────────────────
function AckBanner({ time }) {
  return (
    <View style={styles.ackBanner}>
      <View style={styles.ackCheck}>
        <Text style={styles.ackCheckMark}>✓</Text>
      </View>
      <View>
        <Text style={styles.ackBannerTitle}>Alarm acknowledged</Text>
        <Mono style={{ color: colors.safe, marginTop: 2 }}>Response logged · {time}</Mono>
      </View>
    </View>
  );
}

// ── KPI stat card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, barFill, barColor }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: barColor }]}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
      <View style={styles.statBarTrack}>
        <View style={[styles.statBarFill, { width: `${barFill}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function AlertsScreen() {
  const [activeAlerts, setActiveAlerts] = useState(initialAlerts);
  const [acknowledged, setAcknowledged] = useState({}); // id → time string

  const handleAcknowledge = (id) => {
    const time = new Date().toLocaleTimeString('en-US');
    setAcknowledged(prev => ({ ...prev, [id]: time }));
    setActiveAlerts(prev => prev.filter(a => a.id !== id));
  };

  const handleDismiss = (id) => {
    Alert.alert(
      'Dismiss alert',
      'Mark this alert as dismissed without responding?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          style: 'destructive',
          onPress: () => setActiveAlerts(prev => prev.filter(a => a.id !== id)),
        },
      ]
    );
  };

  const hasActive = activeAlerts.length > 0;
  const ackKeys   = Object.keys(acknowledged);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Active alarms */}
      {hasActive && <SectionLabel>Active alerts — {activeAlerts.length}</SectionLabel>}
      {activeAlerts.map(alert => (
        <AlarmCard
          key={alert.id}
          alert={alert}
          onAcknowledge={handleAcknowledge}
          onDismiss={handleDismiss}
        />
      ))}

      {/* Acknowledged banners */}
      {ackKeys.length > 0 && (
        <>
          <SectionLabel>Acknowledged this session</SectionLabel>
          {ackKeys.map(id => (
            <AckBanner key={id} time={acknowledged[id]} />
          ))}
        </>
      )}

      {/* All clear state */}
      {!hasActive && ackKeys.length === 0 && (
        <View style={styles.allClear}>
          <View style={styles.allClearDot} />
          <Text style={styles.allClearTitle}>All clear</Text>
          <Text style={styles.allClearSub}>No active alerts. All zones are being monitored.</Text>
        </View>
      )}

      {/* KPI summary */}
      <SectionLabel>Today's summary</SectionLabel>
      <View style={styles.statGrid}>
        <StatCard
          label="Active alerts"
          value={String(activeAlerts.length)}
          sub="Requires response"
          barFill={activeAlerts.length > 0 ? 20 : 0}
          barColor={activeAlerts.length > 0 ? colors.alarm : colors.textTertiary}
        />
        <StatCard
          label="Resolved today"
          value="7"
          sub="Since 06:00 AM"
          barFill={70}
          barColor={colors.safe}
        />
        <StatCard
          label="Cameras online"
          value="3/3"
          sub="All feeds active"
          barFill={100}
          barColor={colors.accent}
        />
        <StatCard
          label="Avg confidence"
          value="91%"
          sub="ML detection"
          barFill={91}
          barColor={colors.accent}
        />
      </View>

      {/* Notification rules panel */}
      <SectionLabel>Active notification rules</SectionLabel>
      <Panel>
        <PanelHead title="Escalation rules" />
        {[
          {
            label: 'Unsupervised intrusion',
            desc:  'Push alert + ESP32 buzzer · immediate',
            type:  'alarm',
          },
          {
            label: 'Unacknowledged 60s',
            desc:  'Escalate to backup lifeguard',
            type:  'warn',
          },
          {
            label: 'PIR only (no human)',
            desc:  'Log only, no notification',
            type:  'safe',
          },
        ].map((rule, i) => (
          <View key={i} style={[styles.ruleRow, i > 0 && styles.ruleRowBorder]}>
            <Tag type={rule.type}>{rule.type === 'alarm' ? 'ALARM' : rule.type === 'warn' ? 'WARN' : 'SAFE'}</Tag>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.ruleLabel}>{rule.label}</Text>
              <Text style={styles.ruleDesc}>{rule.desc}</Text>
            </View>
          </View>
        ))}
      </Panel>

      <View style={{ height: spacing.xl }} />
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
    gap: 10,
  },

  // Alarm card
  alarmCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    ...shadow.sm,
  },
  alarmStripe: {
    width: 3,
  },
  alarmInner: {
    flex: 1,
    padding: 13,
    gap: 10,
  },
  alarmHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  alarmTitle: {
    fontSize: typography.base,
    fontWeight: '700',
    lineHeight: 19,
  },
  alarmTime: {
    fontSize: typography.xs,
    marginLeft: 8,
    flexShrink: 0,
  },
  alarmDetail: {
    borderRadius: radius.sm,
    padding: 10,
  },
  alarmDetailText: {
    fontSize: typography.sm,
    lineHeight: 18,
    fontWeight: '500',
  },
  alarmDetailLabel: {
    fontSize: typography.xs,
    marginBottom: 4,
    fontWeight: '500',
  },
  alarmChips: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  chipText: {
    fontSize: typography.xs,
    fontWeight: '600',
    fontFamily: 'Courier',
  },
  alarmActions: {
    flexDirection: 'row',
    gap: 8,
  },
  ackBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  ackBtnText: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '700',
  },
  dismissBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  dismissBtnText: {
    fontSize: 12.5,
    fontWeight: '500',
  },

  // Pulse
  pulseWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  pulseRing: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // Ack banner
  ackBanner: {
    backgroundColor: colors.safeTint,
    borderWidth: 1,
    borderColor: colors.safeBorder,
    borderRadius: radius.lg,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ackCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.safe,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ackCheckMark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  ackBannerTitle: {
    fontSize: typography.base,
    fontWeight: '700',
    color: '#135C41',
  },

  // All clear
  allClear: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  allClearDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.safeTint,
    borderWidth: 2,
    borderColor: colors.safe,
  },
  allClearTitle: {
    fontSize: typography.xl,
    fontWeight: '700',
    color: colors.safe,
  },
  allClearSub: {
    fontSize: typography.base,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 240,
  },

  // Stat grid
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: 12,
    width: '48%',
    ...shadow.sm,
  },
  statLabel: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Courier',
    color: colors.textPrimary,
  },
  statSub: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  statBarTrack: {
    height: 3,
    backgroundColor: colors.bgInset,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  statBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Rules
  ruleRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ruleRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  ruleLabel: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  ruleDesc: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});