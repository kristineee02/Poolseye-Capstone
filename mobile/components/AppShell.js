// PoolsEye — AppShell
// Shared header — brand + screen title with duty profile line (replaces duty card)

import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { colors, spacing, typography, radius, shadow } from '../theme/tokens';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import { useAuth } from '../context/AuthContext';
import { lifeguard as defaultLifeguard } from '../data';

const logo = require('../assets/logo-header.png');

function BrandMark() {
  return (
    <View style={styles.brandMark}>
      <Image source={logo} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="PoolsEye logo" />
    </View>
  );
}

function OnlineBadge() {
  return (
    <View style={styles.onlineBadge}>
      <View style={styles.onlineDot} />
      <Text style={styles.onlineText}>Online</Text>
    </View>
  );
}

export default function AppShell({
  title = 'Dashboard',
  subtitle,
  showDutyProfile = false,
}) {
  const { headerPaddingTop, horizontalInset } = useLayoutInsets();
  const { user } = useAuth();
  const padX = Math.max(horizontalInset, spacing.lg);
  const lifeguard = user || defaultLifeguard;
  const personLine = `${lifeguard.name} · Lifeguard`;

  return (
    <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
      <View style={[styles.topRow, { paddingHorizontal: padX }]}>
        <View style={styles.brand}>
          <BrandMark />
          <View>
            <Text style={styles.brandName}>PoolsEye</Text>
            <Text style={styles.brandSub}>Lifeguard</Text>
          </View>
        </View>
      </View>

      <View style={[styles.titleBlock, { paddingHorizontal: padX }]}>
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text style={styles.screenTitle}>{title}</Text>
            {showDutyProfile ? (
              <Text style={styles.personLine}>{personLine}</Text>
            ) : subtitle ? (
              <Text style={styles.screenSubtitle}>{subtitle}</Text>
            ) : null}
          </View>
          {showDutyProfile ? <OnlineBadge /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.bgApp,
    paddingBottom: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  brandMark: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogo: {
    width: 40,
    height: 40,
  },
  brandName: {
    fontSize: typography.lg,
    fontWeight: '700',
    color: colors.accentStrong,
  },
  brandSub: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  titleBlock: {
    paddingTop: 2,
    paddingBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  personLine: {
    marginTop: 4,
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  screenSubtitle: {
    marginTop: 3,
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow.sm,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.safe,
  },
  onlineText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
