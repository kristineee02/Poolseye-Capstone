// PoolsEye — ProfileHero (greeting + online, matches dashboard reference)

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, typography } from '../theme/tokens';
import { useAuth } from '../context/AuthContext';
import { lifeguard as defaultLifeguard } from '../data';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning,';
  if (hour < 18) return 'Good afternoon,';
  return 'Good evening,';
}

export default function ProfileHero({ online = true }) {
  const { user } = useAuth();
  const lifeguard = user || defaultLifeguard;
  const name = lifeguard.name || 'Lifeguard';
  const greeting = useMemo(() => getGreeting(), []);

  return (
    <View style={styles.hero}>
      <View style={styles.heroCopy}>
        <Text style={styles.greeting}>{greeting}</Text>
        <Text style={styles.heroName} numberOfLines={1}>{name}</Text>
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
    paddingTop: 4,
    paddingBottom: 2,
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
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
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
