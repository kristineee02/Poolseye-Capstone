// PoolsEye — Shared UI Primitives
// Mirrors the web dashboard's primitives.css as React Native components

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, radius, spacing, typography, shadow } from '../theme/tokens';

// ── Tag / Pill ────────────────────────────────────────────────────────────────

const TAG_STYLES = {
  alarm: { bg: colors.alarmTint, text: colors.alarm },
  warn:  { bg: colors.warnTint,  text: colors.warn  },
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

// ── Panel ─────────────────────────────────────────────────────────────────────

export function Panel({ children, style }) {
  return (
    <View style={[styles.panel, style]}>{children}</View>
  );
}

export function PanelHead({ title, right }) {
  return (
    <View style={styles.panelHead}>
      <Text style={styles.panelHeadTitle}>{title}</Text>
      {right}
    </View>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

export function SectionLabel({ children }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

// ── Avatar / Initials ─────────────────────────────────────────────────────────

export function Avatar({ initials, size = 38, color = colors.accent, bg = colors.accentTint }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { color, fontSize: size * 0.35 }]}>{initials}</Text>
    </View>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

export function Divider() {
  return <View style={styles.divider} />;
}

// ── Button ────────────────────────────────────────────────────────────────────

export function Button({ label, onPress, variant = 'primary', style }) {
  const variantStyle = {
    primary: { bg: colors.accent, text: '#fff', border: 'transparent' },
    secondary: { bg: 'transparent', text: colors.textSecondary, border: colors.borderSubtle },
    danger: { bg: colors.alarm, text: '#fff', border: 'transparent' },
    ghost:  { bg: colors.bgInset, text: colors.textSecondary, border: colors.borderSubtle },
  }[variant] || {};

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.btn,
        { backgroundColor: variantStyle.bg, borderColor: variantStyle.border, borderWidth: variant === 'secondary' || variant === 'ghost' ? 1 : 0 },
        style,
      ]}
      activeOpacity={0.82}
    >
      <Text style={[styles.btnText, { color: variantStyle.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Status dot ────────────────────────────────────────────────────────────────

export function StatusDot({ status }) {
  const dotColor = {
    online:  colors.safe,
    standby: colors.warn,
    offline: colors.alarm,
    alarm:   colors.alarm,
    warn:    colors.warn,
    safe:    colors.safe,
  }[status] || colors.textTertiary;

  return <View style={[styles.statusDot, { backgroundColor: dotColor }]} />;
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

export function Toggle({ value, onToggle }) {
  return (
    <TouchableOpacity
      onPress={() => onToggle(!value)}
      activeOpacity={0.8}
      style={[
        styles.toggle,
        { backgroundColor: value ? colors.accent : colors.bgInset,
          borderColor:      value ? colors.accent : colors.borderSubtle },
      ]}
    >
      <View style={[styles.knob, { left: value ? 18 : 2 }]} />
    </TouchableOpacity>
  );
}

// ── Confidence bar ────────────────────────────────────────────────────────────

export function ConfidenceBar({ value, color = colors.accent }) {
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${Math.round(value * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

// ── Mono text ─────────────────────────────────────────────────────────────────

export function Mono({ children, style }) {
  return <Text style={[styles.mono, style]}>{children}</Text>;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  tagText: {
    fontSize: typography.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  panel: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    ...shadow.sm,
  },
  panelHead: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelHeadTitle: {
    fontSize: typography.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sectionLabel: {
    fontSize: typography.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 4,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
  },
  toggle: {
    width: 38,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    position: 'relative',
  },
  knob: {
    position: 'absolute',
    top: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bgInset,
    overflow: 'hidden',
    marginTop: 8,
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  mono: {
    fontFamily: 'Courier',
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
});