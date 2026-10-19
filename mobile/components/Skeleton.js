import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from './Typography';
import { colors, radius, spacing, typography } from '../theme/tokens';

const SLOW_LOADING_MS = 6000;

export function SkeletonBlock({ width = '100%', height = 12, circle = false, style }) {
  const travel = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(travel, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [travel]);

  return (
    <View
      style={[styles.block, { width, height, borderRadius: circle ? height / 2 : 7 }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[
          styles.shimmer,
          { transform: [{ translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [-260, 360] }) }] },
        ]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.72)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

export function LoadingNotice({ visible = true, onRetry }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setSlow(false);
    if (!visible) return undefined;
    const timer = setTimeout(() => setSlow(true), SLOW_LOADING_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!slow) return null;
  return (
    <View style={styles.notice} accessibilityRole="alert">
      <Text style={styles.noticeText}>Taking longer than usual. Please check your connection.</Text>
      {onRetry ? (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function DataLoadError({ message, onRetry }) {
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Text style={styles.errorTitle}>Unable to load data</Text>
      <Text style={styles.errorText}>{message || 'Please check your connection and try again.'}</Text>
      {onRetry ? (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function AlertRowSkeleton() {
  return (
    <View style={styles.rowCard}>
      <SkeletonBlock width={4} height={62} />
      <View style={styles.rowCopy}>
        <SkeletonBlock width="72%" height={14} />
        <SkeletonBlock width="48%" height={10} />
        <View style={styles.pills}>
          <SkeletonBlock width={54} height={22} />
          <SkeletonBlock width={70} height={22} />
        </View>
      </View>
    </View>
  );
}

export function AlertListSkeleton({ rows = 5, onRetry }) {
  return (
    <View style={styles.list} accessibilityRole="progressbar" accessibilityLabel="Loading alerts">
      {Array.from({ length: rows }, (_, index) => <AlertRowSkeleton key={index} />)}
      <LoadingNotice onRetry={onRetry} />
    </View>
  );
}

export function AlertsHomeSkeleton({ onRetry }) {
  return (
    <View style={styles.home} accessibilityRole="progressbar" accessibilityLabel="Loading dashboard">
      <View style={styles.heroCard}>
        <SkeletonBlock width="28%" height={22} />
        <SkeletonBlock width="76%" height={17} />
        <SkeletonBlock width="45%" height={12} />
        <SkeletonBlock width="100%" height={50} />
      </View>
      <View style={styles.statCard}>
        {Array.from({ length: 4 }, (_, index) => (
          <View style={styles.stat} key={index}>
            <SkeletonBlock width={32} height={27} />
            <SkeletonBlock width="76%" height={9} />
          </View>
        ))}
      </View>
      <SkeletonBlock width="36%" height={20} />
      <AlertRowSkeleton />
      <AlertRowSkeleton />
      <LoadingNotice onRetry={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: '#DEEAF3', overflow: 'hidden' },
  shimmer: { position: 'absolute', top: 0, bottom: 0, width: 150 },
  notice: { alignItems: 'center', gap: 10, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  noticeText: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 19, textAlign: 'center' },
  retryButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 20, borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.bgPanel },
  retryText: { color: colors.accent, fontSize: typography.sm, fontWeight: '700' },
  error: { alignItems: 'center', gap: 9, paddingVertical: 48, paddingHorizontal: 24 },
  errorTitle: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '700' },
  errorText: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 19, textAlign: 'center' },
  list: { gap: 10 },
  rowCard: { minHeight: 86, flexDirection: 'row', gap: 12, paddingRight: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.bgPanel, overflow: 'hidden' },
  rowCopy: { flex: 1, justifyContent: 'center', gap: 8 },
  pills: { flexDirection: 'row', gap: 7 },
  home: { gap: 18 },
  heroCard: { gap: 12, padding: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.bgPanel },
  statCard: { flexDirection: 'row', padding: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.bgPanel },
  stat: { flex: 1, alignItems: 'center', gap: 8 },
});
