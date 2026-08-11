// PoolsEye — Change / Create Password

import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadow, touch } from '../theme/tokens';
import { DEMO_LIFEGUARD, getPasswordRuleChecks, getPasswordStrength } from '../auth/demoAuth';
import { useAuth } from '../context/AuthContext';

const BTN_GRADIENT = colors.brandGradient;

function PasswordToggleIcon({ visible, color }) {
  if (visible) {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={1.8} />
      </Svg>
    );
  }

  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path
        d="M6.5 6.7C4.6 8.2 3.2 10.1 2 12c0 0 3.5 7 10 7 1.8 0 3.4-.5 4.8-1.2M9.9 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.2 18.2 0 0 1-2.9 4.1"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="3" y1="3" x2="21" y2="21" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function PasswordField({
  value,
  onChangeText,
  placeholder,
  visible,
  onToggleVisible,
}) {
  return (
    <View style={styles.field}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={styles.eyeButton}
        onPress={onToggleVisible}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        activeOpacity={0.7}
        hitSlop={8}
      >
        <PasswordToggleIcon visible={visible} color={colors.textTertiary} />
      </TouchableOpacity>
    </View>
  );
}

function RuleRow({ label, met }) {
  return (
    <View style={styles.ruleRow}>
      <View style={[styles.ruleCheck, met && styles.ruleCheckMet]}>
        <Text style={[styles.ruleCheckMark, met && styles.ruleCheckMarkMet]}>
          {met ? '✓' : ''}
        </Text>
      </View>
      <Text style={[styles.ruleLabel, met && styles.ruleLabelMet]}>{label}</Text>
    </View>
  );
}

function StrengthMeter({ strength }) {
  if (strength.level === 'empty') return null;

  return (
    <View style={styles.strengthWrap}>
      <View style={styles.strengthHeader}>
        <Text style={styles.strengthCaption}>Password strength</Text>
        <Text style={[styles.strengthLabel, { color: strength.color }]}>
          {strength.label}
        </Text>
      </View>
      <View style={styles.strengthTrack}>
        <View
          style={[
            styles.strengthFill,
            {
              width: `${Math.round((strength.progress || 0) * 100)}%`,
              backgroundColor: strength.color,
            },
          ]}
        />
      </View>
    </View>
  );
}

export default function ChangePasswordScreen({ forced = false, onCancel }) {
  const insets = useSafeAreaInsets();
  const { changePassword, user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const email = user?.email || DEMO_LIFEGUARD.email;

  const rules = useMemo(() => getPasswordRuleChecks(newPassword), [newPassword]);

  const strength = useMemo(
    () =>
      getPasswordStrength(newPassword, {
        email,
        tempPassword: DEMO_LIFEGUARD.password,
      }),
    [newPassword, email],
  );

  const allRulesMet = rules.every((r) => r.met);

  const handleSubmit = async () => {
    setError('');
    if (!allRulesMet) {
      setError('Please meet all password requirements below.');
      return;
    }
    setLoading(true);
    const result = await changePassword({
      currentPassword,
      newPassword,
      skipCurrentCheck: forced,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error || 'Could not update password.');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    if (!forced && onCancel) onCancel();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Text style={styles.title}>
            {forced ? 'Create new password' : 'Change password'}
          </Text>
          <Text style={styles.subtitle}>
            {forced
              ? 'Set your own password to continue.'
              : 'Enter your current password, then choose a new one.'}
          </Text>

          {!forced ? (
            <PasswordField
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Current password"
              visible={showCurrent}
              onToggleVisible={() => setShowCurrent((v) => !v)}
            />
          ) : null}

          <PasswordField
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New password"
            visible={showNew}
            onToggleVisible={() => setShowNew((v) => !v)}
          />

          <StrengthMeter strength={strength} />

          <View style={styles.rulesBox}>
            <Text style={styles.rulesTitle}>Password requirements</Text>
            {rules.map((rule) => (
              <RuleRow key={rule.id} label={rule.label} met={rule.met} />
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading || !allRulesMet}
            activeOpacity={0.85}
            style={(loading || !allRulesMet) ? styles.buttonDisabled : null}
          >
            <LinearGradient
              colors={BTN_GRADIENT}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.button}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {forced ? 'Continue' : 'Save password'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {!forced && onCancel ? (
            <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} activeOpacity={0.8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  title: {
    fontSize: typography.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: spacing.xl,
    fontSize: typography.sm,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touch.comfortable + 4,
    borderRadius: radius.lg,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: 12,
    paddingLeft: spacing.md,
    paddingRight: 6,
    ...shadow.sm,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: typography.md,
    color: colors.textPrimary,
    paddingVertical: 0,
    paddingRight: 8,
  },
  eyeButton: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strengthWrap: {
    marginTop: -4,
    marginBottom: 14,
  },
  strengthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  strengthCaption: {
    fontSize: typography.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  strengthLabel: {
    fontSize: typography.sm,
    fontWeight: '800',
  },
  strengthTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bgInset,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 3,
  },
  rulesBox: {
    marginTop: 4,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  rulesTitle: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  ruleCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgInset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleCheckMet: {
    borderColor: colors.safe,
    backgroundColor: colors.safeTint,
  },
  ruleCheckMark: {
    fontSize: 11,
    fontWeight: '800',
    color: 'transparent',
  },
  ruleCheckMarkMet: {
    color: colors.safe,
  },
  ruleLabel: {
    flex: 1,
    fontSize: typography.sm,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  ruleLabelMet: {
    color: colors.safe,
    fontWeight: '600',
  },
  error: {
    fontSize: typography.sm,
    color: colors.alarmDark,
    backgroundColor: colors.alarmTint,
    borderWidth: 1,
    borderColor: colors.alarmBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  button: {
    minHeight: touch.comfortable + 4,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: typography.md,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  cancelText: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
