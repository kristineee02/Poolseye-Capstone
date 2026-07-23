// PoolsEye — ProfileScreen
// Centered profile card (avatar + role + shift stats) → notifs → session

import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { colors, radius, spacing, typography, shadow } from '../theme/tokens';
import { notificationSettings, lifeguard as defaultLifeguard } from '../data';
import {
  SectionLabel, Panel, PanelHead, Toggle,
} from '../components/Primitives';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';

function getInitials(name, fallback = 'LG') {
  if (!name || typeof name !== 'string') return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function roleShort(role) {
  if (!role) return 'Lifeguard';
  if (/primary/i.test(role)) return 'Primary';
  if (/backup/i.test(role)) return 'Backup';
  return 'Lifeguard';
}

function ProfileIdentity({ name, initials, roleLabel, online, stats }) {
  return (
    <View style={styles.identityCard}>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        {online ? <View style={styles.onlineBadge} /> : null}
      </View>

      <Text style={styles.identityName}>{name}</Text>

      <View style={styles.locationRow}>
        <Text style={styles.locationText}>{roleLabel}</Text>
      </View>

      <View style={styles.statsRow}>
        {stats.map((stat, i) => (
          <View
            key={stat.label}
            style={[styles.statCol, i < stats.length - 1 && styles.statColBorder]}
          >
            <Text style={styles.statLabel}>{stat.label}</Text>
            <View style={styles.statValueRow}>
              <View style={[styles.statIcon, { backgroundColor: stat.tint }]}>
                <Text style={[styles.statIconText, { color: stat.color }]}>{stat.icon}</Text>
              </View>
              <Text style={styles.statValue} numberOfLines={1}>{stat.value}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function NotifRow({ setting, value, onChange, isLast }) {
  return (
    <View style={[styles.notifRow, !isLast && styles.notifRowBorder]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.notifLabel}>{setting.label}</Text>
        <Text style={styles.notifDesc}>{setting.description}</Text>
      </View>
      <Toggle value={value} onToggle={(v) => onChange(setting.id, v)} />
    </View>
  );
}

function SessionActions({ onSignOutPress, onEndShiftPress }) {
  return (
    <View style={styles.actionsBlock}>
      <TouchableOpacity style={styles.actionBtn} onPress={onSignOutPress} activeOpacity={0.8}>
        <View style={[styles.actionIcon, { backgroundColor: colors.bgInset }]}>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>↩</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionLabel}>Sign out</Text>
          <Text style={styles.actionDesc}>Return to login screen</Text>
        </View>
        <Text style={styles.actionChevron}>›</Text>
      </TouchableOpacity>

      <View style={styles.actionRowBorder} />

      <TouchableOpacity style={styles.actionBtn} onPress={onEndShiftPress} activeOpacity={0.8}>
        <View style={[styles.actionIcon, { backgroundColor: colors.alarmTint }]}>
          <Text style={{ color: colors.alarm, fontSize: 14 }}>🚪</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.actionLabel, { color: colors.alarm }]}>End shift</Text>
          <Text style={styles.actionDesc}>Notify backup and go off duty</Text>
        </View>
        <Text style={[styles.actionChevron, { color: colors.alarm }]}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ProfileScreen() {
  const { tabBarClearance } = useLayoutInsets();
  const { user, signOut } = useAuth();
  const lifeguard = user || defaultLifeguard;
  const name = lifeguard.name || 'Lifeguard';
  const initials = lifeguard.initials || getInitials(name);
  const shiftStart = lifeguard.shiftStart || '—';
  const shiftEnd = lifeguard.shiftEnd || '—';
  const roleLabel = 'Lifeguard';

  const [settings, setSettings] = useState(
    notificationSettings.reduce((acc, s) => ({ ...acc, [s.id]: s.enabled }), {})
  );
  const [confirmKind, setConfirmKind] = useState(null);

  const handleToggle = (id, value) => {
    setSettings((prev) => ({ ...prev, [id]: value }));
  };

  const stats = [
    {
      label: 'Shift start',
      value: shiftStart,
      icon: '◷',
      color: colors.accentStrong,
      tint: colors.accentTint,
    },
    {
      label: 'Shift end',
      value: shiftEnd,
      icon: '◑',
      color: colors.warn,
      tint: colors.warnTint,
    },
    {
      label: 'Role',
      value: roleShort(lifeguard.role),
      icon: '✓',
      color: colors.safe,
      tint: colors.safeTint,
    },
  ];

  const isSignOut = confirmKind === 'signOut';
  const isEndShift = confirmKind === 'endShift';

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
        showsVerticalScrollIndicator={false}
      >
        <ProfileIdentity
          name={name}
          initials={initials}
          roleLabel={roleLabel}
          online
          stats={stats}
        />

        <SectionLabel>Notification preferences</SectionLabel>
        <Panel>
          <PanelHead
            title="Alert channels"
            right={
              <Text style={styles.enabledCount}>
                {Object.values(settings).filter(Boolean).length} of {notificationSettings.length} on
              </Text>
            }
          />
          {notificationSettings.map((s, i) => (
            <NotifRow
              key={s.id}
              setting={s}
              value={settings[s.id]}
              onChange={handleToggle}
              isLast={i === notificationSettings.length - 1}
            />
          ))}
        </Panel>

        <SectionLabel>Session</SectionLabel>
        <Panel>
          <SessionActions
            onSignOutPress={() => setConfirmKind('signOut')}
            onEndShiftPress={() => setConfirmKind('endShift')}
          />
        </Panel>

        <Text style={styles.footerText}>PoolsEye Lifeguard · v1.0.0</Text>
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <ConfirmModal
        visible={isSignOut}
        onClose={() => setConfirmKind(null)}
        title="Sign out"
        message="Leave the lifeguard app? You’ll need to sign in again to continue."
        confirmText="Sign out"
        cancelText="Cancel"
        isDangerous
        onConfirm={signOut}
      />

      <ConfirmModal
        visible={isEndShift}
        onClose={() => setConfirmKind(null)}
        title="End shift"
        message="Are you sure you want to end your shift? The backup lifeguard will be notified."
        confirmText="End shift"
        cancelText="Cancel"
        isDangerous
        onConfirm={signOut}
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
    padding: spacing.md,
    gap: 10,
  },

  identityCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingTop: 22,
    paddingBottom: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    ...shadow.sm,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 14,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accentTint,
    borderWidth: 3,
    borderColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.accentStrong,
    letterSpacing: 0.5,
  },
  onlineBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.safe,
    borderWidth: 3,
    borderColor: colors.bgPanel,
  },
  identityName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    marginBottom: 18,
  },
  locationText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: 14,
    paddingBottom: 10,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  statColBorder: {
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statValue: {
    fontSize: typography.sm,
    fontWeight: '800',
    color: colors.textPrimary,
    maxWidth: 72,
  },

  notifRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notifRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  notifLabel: {
    fontSize: typography.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  notifDesc: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  enabledCount: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  actionsBlock: {
    paddingVertical: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: typography.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  actionDesc: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionChevron: {
    fontSize: 20,
    color: colors.textTertiary,
  },
  actionRowBorder: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginLeft: spacing.md + 36 + 12,
  },
  footerText: {
    textAlign: 'center',
    fontSize: typography.xs,
    color: colors.textTertiary,
    marginTop: 8,
  },
});
