// PoolsEye — AppShell
// Shared header — screen title only (no brand strip)

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius, shadow } from '../theme/tokens';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import { useAuth } from '../context/AuthContext';
import { lifeguard as defaultLifeguard } from '../data';

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
  titleBlock: {
    paddingTop: 4,
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
