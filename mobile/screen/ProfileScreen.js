// PoolsEye — ProfileScreen
// Profile card · account menu (camera / password) · notifications · no shift

import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors, radius, spacing, typography, shadow, touch } from '../theme/tokens';
import { notificationSettings, lifeguard as defaultLifeguard, site } from '../data';
import { Toggle } from '../components/Primitives';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import ChangePasswordScreen from './ChangePasswordScreen';
import EditProfileScreen from './EditProfileScreen';

function getInitials(name, fallback = 'LG') {
  if (!name || typeof name !== 'string') return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function PersonIcon({ color = '#FFFFFF', size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3.2} stroke={color} strokeWidth={1.9} />
      <Path
        d="M5.5 19c1.6-3.2 4-4.8 6.5-4.8S16.9 15.8 18.5 19"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function LockIcon({ color = '#FFFFFF', size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 11V8.5a5 5 0 0 1 10 0V11"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
      <Path
        d="M6.5 11h11v9h-11V11z"
        stroke={color}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CameraIcon({ color = '#FFFFFF', size = 12 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 9h3l1.5-2h7L17 9h3v9H4V9z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13.5} r={2.8} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function ProfileCard({ name, initials, role, siteName, photoUri, onChangePhoto }) {
  return (
    <View style={styles.profileCard}>
      <View style={styles.profileRow}>
        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={onChangePhoto}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatarImage} />
          ) : (
            <LinearGradient
              colors={colors.brandGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
          )}
          <View style={styles.cameraBadge}>
            <CameraIcon size={12} />
          </View>
        </TouchableOpacity>

        <View style={styles.profileCopy}>
          <Text style={styles.profileName} numberOfLines={1}>{name}</Text>
          <Text style={styles.profileRole} numberOfLines={1}>{role}</Text>
          <Text style={styles.profileSite} numberOfLines={1}>
            {siteName} · On duty
          </Text>
        </View>
      </View>
    </View>
  );
}

function SignOutIcon({ color = '#FFFFFF', size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path
        d="M16 8l4 4-4 4M9 12h11"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function AccountMenuItem({ icon, label, description, onPress, isLast }) {
  return (
    <TouchableOpacity
      style={[styles.listRow, !isLast && styles.listRowBorder]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.listIcon}>{icon}</View>
      <View style={styles.listCopy}>
        <Text style={styles.listLabel}>{label}</Text>
        {description ? <Text style={styles.listDesc}>{description}</Text> : null}
      </View>
      <Text style={styles.listChevron}>›</Text>
    </TouchableOpacity>
  );
}

function NotifRow({ setting, value, onChange, isLast }) {
  return (
    <View style={[styles.listRow, !isLast && styles.listRowBorder]}>
      <View style={styles.listCopy}>
        <Text style={styles.listLabel}>{setting.label}</Text>
        <Text style={styles.listDesc}>{setting.description}</Text>
      </View>
      <Toggle value={value} onToggle={(v) => onChange(setting.id, v)} />
    </View>
  );
}

export default function ProfileScreen() {
  const { tabBarClearance } = useLayoutInsets();
  const { user, signOut } = useAuth();
  const lifeguard = user || defaultLifeguard;
  const name = lifeguard.name || 'Lifeguard';
  const initials = lifeguard.initials || getInitials(name);
  const role = lifeguard.role || 'On-duty lifeguard · primary';
  const photoUri = user?.photoUri || null;

  const [settings, setSettings] = useState(
    notificationSettings.reduce((acc, s) => ({ ...acc, [s.id]: s.enabled }), {})
  );
  const [showSignOut, setShowSignOut] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);

  const enabledCount = Object.values(settings).filter(Boolean).length;

  const handleToggle = (id, value) => {
    setSettings((prev) => ({ ...prev, [id]: value }));
  };

  if (showEditProfile) {
    return (
      <EditProfileScreen onCancel={() => setShowEditProfile(false)} />
    );
  }

  if (showChangePassword) {
    return (
      <ChangePasswordScreen
        forced={false}
        onCancel={() => setShowChangePassword(false)}
      />
    );
  }

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance + spacing.sm }]}
        showsVerticalScrollIndicator={false}
      >
        <ProfileCard
          name={name}
          initials={initials}
          role={role}
          siteName={site.name || 'Main Pool'}
          photoUri={photoUri}
          onChangePhoto={() => setShowEditProfile(true)}
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Account</Text>
        </View>

        <View style={styles.panelCard}>
          <AccountMenuItem
            icon={<PersonIcon size={16} />}
            label="Edit Profile"
            description="Change picture, name, and profile details"
            onPress={() => setShowEditProfile(true)}
          />
          <AccountMenuItem
            icon={<LockIcon size={16} />}
            label="Change Password"
            description="Update your personal login password"
            onPress={() => setShowChangePassword(true)}
            isLast
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <Text style={styles.enabledCount}>{enabledCount} on</Text>
        </View>

        <View style={styles.panelCard}>
          {notificationSettings.map((s, i) => (
            <NotifRow
              key={s.id}
              setting={s}
              value={settings[s.id]}
              onChange={handleToggle}
              isLast={i === notificationSettings.length - 1}
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={() => setShowSignOut(true)}
          activeOpacity={0.85}
        >
          <SignOutIcon size={18} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
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
    gap: 14,
  },

  profileCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 16,
    ...shadow.sm,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarWrap: {
    position: 'relative',
    width: 72,
    height: 72,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.bgInset,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  profileRole: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  profileSite: {
    marginTop: 2,
    fontSize: typography.sm,
    color: colors.accent,
    fontWeight: '700',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  enabledCount: {
    fontSize: typography.sm,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  panelCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    ...shadow.sm,
  },
  listRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    minHeight: touch.comfortable,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  listIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  listCopy: {
    flex: 1,
    minWidth: 0,
  },
  listLabel: {
    fontSize: typography.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  listDesc: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 18,
  },
  listChevron: {
    fontSize: 22,
    color: colors.textTertiary,
    fontWeight: '400',
  },

  signOutBtn: {
    marginTop: 8,
    minHeight: 52,
    borderRadius: radius.full,
    backgroundColor: colors.alarm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    ...shadow.sm,
  },
  signOutText: {
    color: '#FFFFFF',
    fontSize: typography.md,
    fontWeight: '700',
  },
});
