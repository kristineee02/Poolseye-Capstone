import React from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from './Typography';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, typography, shadow, touch } from '../theme/tokens';

const TAG_STYLES = {
  alarm: { bg: colors.alarmTint, text: colors.alarm },
  warn:  { bg: colors.warnTint,  text: colors.warnDark },
  safe:  { bg: colors.safeTint,  text: colors.safe  },
  info:  { bg: colors.bgInset,   text: colors.textSecondary },
  accent:{ bg: colors.accentTint,text: colors.accentStrong  },
};

export function Tag({ type = 'info', children }) {
  const s = TAG_STYLES[type] || TAG_STYLES.info;
  return (
    <View style={[styles.tag, { backgroundColor: s.bg }]}>
      <Text style={[styles.tagText, { color: s.text }]}>{children}</Text>
    </View>
  );
}

export function GradientButton({
  label,
  onPress,
  disabled,
  loading,
  children,
  style,
  textStyle,
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[styles.gradientShell, (disabled || loading) && styles.btnDisabled, style]}
    >
      <LinearGradient
        colors={colors.buttonGradient}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.gradientContent}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : children ? (
          children
        ) : (
          <Text style={[styles.gradientText, textStyle]}>{label}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export function Toggle({ value, onToggle }) {
  return (
    <TouchableOpacity
      onPress={() => onToggle(!value)}
      activeOpacity={0.8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        styles.toggle,
        {
          backgroundColor: value ? colors.accent : colors.bgInset,
          borderColor: value ? colors.accent : colors.borderSubtle,
        },
      ]}
    >
      <View style={[styles.knob, { left: value ? 22 : 2 }]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  tagText: {
    fontSize: typography.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  gradientShell: {
    minHeight: touch.min,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadow.button,
  },
  gradientText: {
    color: '#FFFFFF',
    fontSize: typography.base,
    fontWeight: '700',
  },
  gradientContent: {
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.55,
  },
  toggle: {
    width: 46,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  knob: {
    position: 'absolute',
    top: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 2,
    elevation: 2,
  },
});
