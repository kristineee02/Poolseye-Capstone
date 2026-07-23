// PoolsEye — ProfileHero
// Avatar + greeting + name · Online pill (Dashboard / Profile)

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, typography, shadow } from '../theme/tokens';
import { useAuth } from '../context/AuthContext';
import { lifeguard as defaultLifeguard } from '../data';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning!';
  if (hour < 18) return 'Good afternoon!';
  return 'Good evening!';
}

function getInitials(name, fallback = 'LG') {
  if (!name || typeof name !== 'string') return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function ProfileHero({ online = true }) {
  const { user } = useAuth();
  const lifeguard = user || defaultLifeguard;
  const name = lifeguard.name || 'Lifeguard';
  const initials = lifeguard.initials || getInitials(name);
  const greeting = useMemo(() => getGreeting(), []);

  return (
    <View style={styles.hero}>
      <View style={styles.heroLeft}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.heroName} numberOfLines={1}>{name}</Text>
        </View>
      </View>

      <View style={[styles.statusPill, !online && styles.statusPillOffline]}>
        <View style={[styles.statusDot, !online && styles.statusDotOffline]} />
        <Text style={[styles.statusText, !online && styles.statusTextOffline]}>
          {online ? 'Online' : 'Offline'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: 14,
    paddingHorizontal: 14,
    ...shadow.sm,
  },
  heroLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accentTint,
    borderWidth: 2,
    borderColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.accentStrong,
    letterSpacing: 0.3,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  greeting: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  heroName: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: colors.safeTint,
    borderWidth: 1,
    borderColor: colors.safeBorder,
    flexShrink: 0,
  },
  statusPillOffline: {
    backgroundColor: colors.bgInset,
    borderColor: colors.borderSubtle,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.safe,
  },
  statusDotOffline: {
    backgroundColor: colors.textTertiary,
  },
  statusText: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: colors.safe,
  },
  statusTextOffline: {
    color: colors.textSecondary,
  },
});
