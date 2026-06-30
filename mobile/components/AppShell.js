// PoolsEye — AppShell
// Shared top header used across all screens

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { colors, spacing, typography, radius } from '../theme/tokens';
import { site, guard } from '../data';

// ── Logo mark (SVG-style via border tricks) ───────────────────────────────────
function BrandMark() {
  return (
    <View style={styles.brandMark}>
      {/* Eye outline */}
      <View style={styles.eyeOuter}>
        <View style={styles.eyeInner} />
      </View>
    </View>
  );
}

// ── Live clock ────────────────────────────────────────────────────────────────
function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AppShell({ activeBadge = 0 }) {
  const time = useClock();
  const timeStr = time.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topbar}>
        {/* Brand */}
        <View style={styles.brand}>
          <BrandMark />
          <View>
            <Text style={styles.brandName}>PoolsEye</Text>
            <Text style={styles.brandSub}>Lifeguard Station</Text>
          </View>
        </View>

        {/* Right side */}
        <View style={styles.topRight}>
          <View style={styles.sysPill}>
            <View style={[styles.pillDot, { backgroundColor: colors.safe }]} />
            <Text style={styles.pillText}>Edge online</Text>
          </View>
          <Text style={styles.clock}>{timeStr}</Text>
        </View>
      </View>

      {/* Guard row */}
      <View style={styles.guardRow}>
        <View style={styles.guardPill}>
          <View style={[styles.pillDot, { backgroundColor: colors.accent }]} />
          <Text style={styles.guardPillText}>
            On duty · {guard.name}
          </Text>
        </View>
        <Text style={styles.siteName}>{site.shortName}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.bgPanel,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 6,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeOuter: {
    width: 14,
    height: 9,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  brandName: {
    fontSize: typography.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  brandSub: {
    fontSize: typography.xs,
    color: colors.textSecondary,
  },
  topRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  sysPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.bgInset,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  clock: {
    fontSize: typography.xs,
    fontFamily: 'Courier',
    color: colors.textSecondary,
  },
  guardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: 10,
  },
  guardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accentTint,
    borderWidth: 1,
    borderColor: '#BFE8EE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  guardPillText: {
    fontSize: typography.xs,
    fontWeight: '600',
    color: colors.accentStrong,
  },
  siteName: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
});