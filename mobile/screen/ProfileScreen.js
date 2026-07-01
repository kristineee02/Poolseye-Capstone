// PoolsEye — ProfileScreen
// Lifeguard profile: duty info, notification preferences (toggles),
// escalation contact roster, and session actions.

import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { colors, radius, spacing, typography, shadow } from '../theme/tokens';
import { guard, contacts, notificationSettings, site } from '../data';
import {
  Tag, SectionLabel, Panel, PanelHead,
  Avatar, Divider, Toggle, Mono, Button,
} from '../components/Primitives';
import { useLayoutInsets } from '../hooks/useLayoutInsets';

// ── Guard header card ─────────────────────────────────────────────────────────
function GuardCard() {
  return (
    <View style={styles.guardCard}>
      <Avatar initials={guard.initials} size={52} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.guardName}>{guard.name}</Text>
        <Text style={styles.guardRole}>{guard.role}</Text>
        <View style={styles.guardShift}>
          <View style={[styles.shiftDot, { backgroundColor: colors.safe }]} />
          <Mono style={{ color: colors.textSecondary }}>
            Shift: {guard.shiftStart} – {guard.shiftEnd}
          </Mono>
        </View>
      </View>
      <View style={styles.onDutyBadge}>
        <Text style={styles.onDutyText}>ON DUTY</Text>
      </View>
    </View>
  );
}

// ── Notification toggle row ───────────────────────────────────────────────────
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

// ── Contact roster card ───────────────────────────────────────────────────────
function ContactRow({ contact, isLast }) {
  const avatarColors = [
    { bg: colors.accentTint, text: colors.accentStrong },
    { bg: colors.safeTint,   text: colors.safe          },
    { bg: colors.warnTint,   text: colors.warn           },
  ];
  const c = avatarColors[contact.id.split('-')[1] - 1] || avatarColors[0];

  return (
    <View style={[styles.contactRow, !isLast && styles.contactRowBorder]}>
      <Avatar initials={contact.initials} size={36} color={c.text} bg={c.bg} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <View style={styles.contactNameRow}>
          <Text style={styles.contactName}>{contact.name}</Text>
          {contact.isPrimary && <Tag type="accent">Primary</Tag>}
        </View>
        <Text style={styles.contactRole}>{contact.role}</Text>
        <View style={styles.channelRow}>
          {contact.channels.map(ch => (
            <View key={ch} style={styles.channelChip}>
              <Text style={styles.channelText}>{ch}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Site info panel ───────────────────────────────────────────────────────────
function SiteInfo() {
  return (
    <Panel>
      <PanelHead title="Site information" />
      {[
        { k: 'Site name',   v: site.name          },
        { k: 'Mode',        v: site.mode          },
        { k: 'Edge node',   v: 'Orange Pi Zero 3' },
        { k: 'MQTT broker', v: 'Local · 12ms'     },
        { k: 'Cameras',     v: '3 connected'       },
        { k: 'Sensors',     v: '1 PIR · 1 IR'     },
      ].map((row, i, arr) => (
        <View key={row.k} style={[styles.infoRow, i < arr.length - 1 && styles.infoRowBorder]}>
          <Text style={styles.infoKey}>{row.k}</Text>
          <Mono style={styles.infoValue}>{row.v}</Mono>
        </View>
      ))}
    </Panel>
  );
}

// ── Session actions ───────────────────────────────────────────────────────────
function SessionActions() {
  const handleEndShift = () => {
    Alert.alert(
      'End shift',
      'Are you sure you want to end your shift? The backup lifeguard will be notified.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End shift', style: 'destructive', onPress: () => {} },
      ]
    );
  };

  const handleTestNotif = () => {
    Alert.alert('Test sent', 'A test push notification was sent to this device.');
  };

  return (
    <View style={styles.actionsBlock}>
      <TouchableOpacity style={styles.actionBtn} onPress={handleTestNotif} activeOpacity={0.8}>
        <View style={[styles.actionIcon, { backgroundColor: colors.accentTint }]}>
          <Text style={{ color: colors.accentStrong, fontSize: 14 }}>🔔</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionLabel}>Send test notification</Text>
          <Text style={styles.actionDesc}>Verify push delivery to this device</Text>
        </View>
        <Text style={styles.actionChevron}>›</Text>
      </TouchableOpacity>

      <View style={styles.actionRowBorder} />

      <TouchableOpacity style={styles.actionBtn} onPress={() => {}} activeOpacity={0.8}>
        <View style={[styles.actionIcon, { backgroundColor: colors.bgInset }]}>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>📋</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionLabel}>Export shift log</Text>
          <Text style={styles.actionDesc}>PDF summary of today's events</Text>
        </View>
        <Text style={styles.actionChevron}>›</Text>
      </TouchableOpacity>

      <View style={styles.actionRowBorder} />

      <TouchableOpacity style={styles.actionBtn} onPress={handleEndShift} activeOpacity={0.8}>
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

// ── App version footer ────────────────────────────────────────────────────────
function Footer() {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>PoolsEye Lifeguard · v1.0.0</Text>
      <Text style={styles.footerText}>Offline / local-only mode · edge node active</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { tabBarClearance } = useLayoutInsets();
  const [settings, setSettings] = useState(
    notificationSettings.reduce((acc, s) => ({ ...acc, [s.id]: s.enabled }), {})
  );

  const handleToggle = (id, value) => {
    setSettings(prev => ({ ...prev, [id]: value }));
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Guard info */}
      <GuardCard />

      {/* Notification settings */}
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

      {/* Escalation contacts */}
      <SectionLabel>Notification roster</SectionLabel>
      <Panel>
        <PanelHead
          title="Escalation contacts"
          right={<Text style={styles.viewAll}>Edit roster</Text>}
        />
        {contacts.map((c, i) => (
          <ContactRow key={c.id} contact={c} isLast={i === contacts.length - 1} />
        ))}
      </Panel>

      {/* Site info */}
      <SectionLabel>System</SectionLabel>
      <SiteInfo />

      {/* Session actions */}
      <SectionLabel>Session</SectionLabel>
      <Panel>
        <SessionActions />
      </Panel>

      <Footer />
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

  // Guard card
  guardCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.sm,
  },
  guardName: {
    fontSize: typography.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  guardRole: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  guardShift: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  shiftDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  onDutyBadge: {
    backgroundColor: colors.safeTint,
    borderWidth: 1,
    borderColor: colors.safeBorder,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  onDutyText: {
    fontSize: typography.xs,
    fontWeight: '700',
    color: colors.safe,
    letterSpacing: 0.5,
  },

  // Notif rows
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
    fontSize: typography.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  notifDesc: {
    fontSize: typography.xs,
    color: colors.textSecondary,
  },
  enabledCount: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    fontFamily: 'Courier',
  },

  // Contacts
  contactRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  contactRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  contactName: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  contactRole: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    marginBottom: 5,
  },
  channelRow: {
    flexDirection: 'row',
    gap: 5,
  },
  channelChip: {
    backgroundColor: colors.bgInset,
    borderRadius: radius.sm,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  channelText: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  // Site info rows
  infoRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  infoKey: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: typography.sm,
    color: colors.textPrimary,
    textAlign: 'right',
  },

  // Session actions
  actionsBlock: {
    overflow: 'hidden',
  },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionRowBorder: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginLeft: spacing.md + 36 + 12,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionLabel: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  actionDesc: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionChevron: {
    fontSize: 22,
    color: colors.textTertiary,
    fontWeight: '300',
  },

  // Footer
  footer: {
    alignItems: 'center',
    gap: 3,
    marginTop: 8,
  },
  footerText: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    fontFamily: 'Courier',
  },

  // Misc
  viewAll: {
    fontSize: typography.sm,
    color: colors.accent,
    fontWeight: '500',
  },
});