// PoolsEye — AppShell
// Clean screen header with consistent hierarchy

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';
import { useLayoutInsets } from '../hooks/useLayoutInsets';

export default function AppShell({ title = 'Home', subtitle }) {
  const { headerPaddingTop, horizontalInset } = useLayoutInsets();
  const padX = Math.max(horizontalInset, spacing.md);

  return (
    <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
      <View style={[styles.titleBlock, { paddingHorizontal: padX }]}>
        <Text style={styles.screenTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={styles.screenSubtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
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
    paddingTop: 2,
    paddingBottom: 2,
  },
  screenTitle: {
    fontSize: typography.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  screenSubtitle: {
    marginTop: 4,
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
