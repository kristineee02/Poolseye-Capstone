// PoolsEye — ProfileScreen

import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { colors, radius, spacing, typography, shadow, touch } from '../theme/tokens';
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

function ProfileIdentity({ name, initials, roleLabel, online }) {
  return (
    <View style={styles.identityCard}>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        {online ? <View style={styles.onlineBadge} /> : null}
      </View>

      <Text style={styles.identityName}>{name}</Text>
      <Text style={styles.roleText}>{roleLabel}</Text>
    </View>
  );
}

function NotifRow({ setting, value, onChange, isLast }) {
  return (
    <View style={[styles.notifRow, !isLast && styles.notifRowBorder]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.notifLabel}>{setting.label}</Text>
        <Text style={styles.notifDesc}>{setting.description}</Text>
      </View>
      <Toggle value={value} onToggle={(v) => onChange(setting.id, v)} />
    </View>
  );
}

function SignOutAction({ onPress }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.actionIcon, { backgroundColor: colors.alarmTint }]}>
        <Text style={{ color: colors.alarm, fontSize: 15, fontWeight: '700' }}>↩</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionLabel, { color: colors.alarm }]}>Sign out</Text>
      </View>
      <Text style={[styles.actionChevron, { color: colors.alarm }]}>›</Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { tabBarClearance } = useLayoutInsets();
  const { user, signOut } = useAuth();
  const lifeguard = user || defaultLifeguard;
  const name = lifeguard.name || 'Lifeguard';
  const initials = lifeguard.initials || getInitials(name);

  const [settings, setSettings] = useState(
    notificationSettings.reduce((acc, s) => ({ ...acc, [s.id]: s.enabled }), {})
  );
  const [showSignOut, setShowSignOut] = useState(false);

  const handleToggle = (id, value) => {
    setSettings((prev) => ({ ...prev, [id]: value }));
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance + spacing.sm }]}
        showsVerticalScrollIndicator={false}
      >
        <ProfileIdentity
          name={name}
          initials={initials}
          roleLabel="Lifeguard"
          online
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
          <SignOutAction onPress={() => setShowSignOut(true)} />
        </Panel>
      </ScrollView>

      <ConfirmModal
        visible={showSignOut}
        onClose={() => setShowSignOut(false)}
        title="Sign out"
        message="Leave the lifeguard app? You’ll need to sign in again to continue."
        confirmText="Sign out"
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 10,
  },

  identityCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: spacing.md,
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
    borderColor: colors.accentHighlight,
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
    fontSize: typography.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  roleText: {
    marginTop: 6,
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },

  notifRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    minHeight: touch.comfortable,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notifRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  notifLabel: {
    fontSize: typography.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  notifDesc: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 18,
  },
  enabledCount: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    minHeight: touch.comfortable,
    paddingVertical: 14,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: typography.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  actionChevron: {
    fontSize: 22,
    color: colors.textTertiary,
    fontWeight: '500',
  },
});
