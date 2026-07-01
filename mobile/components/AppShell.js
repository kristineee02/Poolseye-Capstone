// PoolsEye — AppShell
// Shared header — matches web topbar pill style + safe area top inset

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius, shadow } from '../theme/tokens';
import { site, guard } from '../data';
import { useLayoutInsets } from '../hooks/useLayoutInsets';

function BrandMark() {
  return (
    <View style={styles.brandMark}>
      <View style={styles.eyeOuter}>
        <View style={styles.eyeInner} />
      </View>
    </View>
  );
}

function Chip({ children, dotColor, mono = false }) {
  return (
    <View style={styles.chip}>
      {dotColor ? <View style={[styles.chipDot, { backgroundColor: dotColor }]} /> : null}
      <Text style={[styles.chipText, mono && styles.chipTextMono]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function AppShell() {
  const { headerPaddingTop, horizontalInset } = useLayoutInsets();
  const time = useClock();
  const timeStr = time.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
      <View style={[styles.topRow, { paddingHorizontal: Math.max(horizontalInset, spacing.lg) }]}>
        <View style={styles.brand}>
          <BrandMark />
          <View>
            <Text style={styles.brandName}>PoolsEye</Text>
            <Text style={styles.brandSub}>Lifeguard</Text>
          </View>
        </View>

        <View style={styles.topRight}>
          <Chip dotColor={colors.safe}>Edge online</Chip>
          <Chip mono>{timeStr}</Chip>
        </View>
      </View>

      <View style={[styles.metaRow, { paddingHorizontal: Math.max(horizontalInset, spacing.lg) }]}>
        <Chip dotColor={colors.accent}>On duty · {guard.initials}</Chip>
        <Chip dotColor={colors.safe}>{site.shortName}</Chip>
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
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeOuter: {
    width: 16,
    height: 10,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accentStrong,
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
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.full,
    maxWidth: '100%',
    ...shadow.sm,
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    flexShrink: 0,
  },
  chipText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
    flexShrink: 1,
  },
  chipTextMono: {
    fontFamily: 'Courier',
    letterSpacing: 0.2,
  },
});
