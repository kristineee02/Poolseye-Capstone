// PoolsEye — ProfileScreen
// Core only: notification preferences + session (sign out / end shift)

import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { notificationSettings } from '../data';
import {
  SectionLabel, Panel, PanelHead, Toggle,
} from '../components/Primitives';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';

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
  const { signOut } = useAuth();
  const [settings, setSettings] = useState(
    notificationSettings.reduce((acc, s) => ({ ...acc, [s.id]: s.enabled }), {})
  );
  const [confirmKind, setConfirmKind] = useState(null);

  const handleToggle = (id, value) => {
    setSettings((prev) => ({ ...prev, [id]: value }));
  };

  const isSignOut = confirmKind === 'signOut';
  const isEndShift = confirmKind === 'endShift';

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
        showsVerticalScrollIndicator={false}
      >
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
