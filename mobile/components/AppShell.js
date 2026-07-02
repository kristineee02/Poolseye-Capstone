// PoolsEye — AppShell
// Shared header — matches web topbar pill style + safe area top inset

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { colors, spacing, typography, radius, shadow } from '../theme/tokens';
import { site } from '../data';
import { useLayoutInsets } from '../hooks/useLayoutInsets';

const logo = require('../assets/logo-header.png');

function BrandMark() {
  return (
    <View style={styles.brandMark}>
      <Image source={logo} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="PoolsEye logo" />
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
          <Chip mono>{timeStr}</Chip>
        </View>
      </View>

      <View style={[styles.metaRow, { paddingHorizontal: Math.max(horizontalInset, spacing.lg) }]}>
        <Chip dotColor={colors.safe}>Edge online</Chip>
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
