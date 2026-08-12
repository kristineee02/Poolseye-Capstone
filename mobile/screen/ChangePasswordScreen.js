// PoolsEye — Change / Create Password (screenshot layout)

import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadow, touch } from '../theme/tokens';
import { DEMO_LIFEGUARD, getPasswordRuleChecks } from '../auth/demoAuth';
import { useAuth } from '../context/AuthContext';

function BackArrow({ color = colors.accent, size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 6 9 12l6 6"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

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

function RuleRow({ label, met, isLast }) {
  return (
    <View style={[styles.ruleRow, !isLast && styles.ruleRowBorder]}>
      <View style={[styles.ruleDot, met && styles.ruleDotMet]}>
        {met ? <Text style={styles.ruleCheckMark}>✓</Text> : null}
      </View>
      <Text style={[styles.ruleLabel, met && styles.ruleLabelMet]}>{label}</Text>
    </View>
  );
}

/**
 * @param {object} props
 * @param {boolean} [props.forced] first-login after temp password
 * @param {() => void} [props.onCancel]
 * @param {boolean} [props.resetMode] forgot-password reset (no current password)
 * @param {(payload: { newPassword: string }) => Promise<{ok:boolean,error?:string}>} [props.onResetSubmit]
 * @param {string} [props.resetEmail]
 */
export default function ChangePasswordScreen({
  forced = false,
  onCancel,
  resetMode = false,
  onResetSubmit,
  resetEmail,
}) {
  const insets = useSafeAreaInsets();
  const { changePassword, user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const email = resetEmail || user?.email || DEMO_LIFEGUARD.email;
  const showCurrentField = !forced && !resetMode;
  const showBack = Boolean(onCancel) && !forced;
  // Inside Profile tab AppShell already handles safe area — keep header tight under "Profile"
  const embedded = Boolean(onCancel) && !forced && !resetMode;

  const rules = useMemo(() => getPasswordRuleChecks(newPassword), [newPassword]);
  const allRulesMet = rules.every((r) => r.met);

  const title = forced
    ? 'Create new password'
    : resetMode
      ? 'Reset password'
      : 'Change password';

  const subtitle = forced
    ? 'Your temporary password must be replaced before you can continue.'
    : resetMode
      ? 'Choose a new password for your lifeguard account.'
      : 'Update your password to keep your account secure.';

  const handleSubmit = async () => {
    setError('');

    if (!allRulesMet) {
      setError('Please meet all password requirements below.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (showCurrentField && !currentPassword) {
      setError('Enter your current password.');
      return;
    }

    setLoading(true);
    let result;
    if (resetMode && onResetSubmit) {
      result = await onResetSubmit({ newPassword });
    } else {
      result = await changePassword({
        currentPassword,
        newPassword,
        skipCurrentCheck: forced || resetMode,
      });
    }
    setLoading(false);

    if (!result.ok) {
      setError(result.error || 'Could not update password.');
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    if (!forced && onCancel) onCancel();
  };

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: embedded ? spacing.xs : insets.top,
          paddingBottom: embedded ? 0 : insets.bottom,
        },
      ]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: (embedded ? insets.bottom : 0) + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {showBack ? (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={onCancel}
              activeOpacity={0.75}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <BackArrow />
            </TouchableOpacity>
          ) : (
            <View style={styles.backSpacer} />
          )}

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {showCurrentField ? (
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

          <PasswordField
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
            visible={showConfirm}
            onToggleVisible={() => setShowConfirm((v) => !v)}
          />

          <View style={styles.rulesBox}>
            <Text style={styles.rulesTitle}>Password requirements</Text>
            {rules.map((rule, index) => (
              <RuleRow
                key={rule.id}
                label={rule.label}
                met={rule.met}
                isLast={index === rules.length - 1}
              />
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading || !allRulesMet}
            activeOpacity={0.85}
            style={[
              styles.button,
              (loading || !allRulesMet) && styles.buttonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {forced ? 'Continue' : resetMode ? 'Reset password' : 'Save password'}
              </Text>
            )}
          </TouchableOpacity>

          {!forced && onCancel ? (
            <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} activeOpacity={0.8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          ) : null}

          {forced ? (
            <Text style={styles.forcedHint}>
              Signed in as {email}
            </Text>
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
    paddingHorizontal: spacing.md,
    paddingTop: 0,
  },
  backBtn: {
    width: 36,
    height: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 2,
  },
  backSpacer: {
    height: 4,
  },
  title: {
    fontSize: typography.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: spacing.lg,
    fontSize: typography.sm,
    lineHeight: 20,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touch.comfortable + 6,
    borderRadius: radius.full,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: 12,
    paddingLeft: spacing.md + 4,
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
  rulesBox: {
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 18,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    ...shadow.sm,
  },
  rulesTitle: {
    fontSize: typography.md,
    fontWeight: '800',
    color: colors.textPrimary,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ruleRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  ruleDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleDotMet: {
    borderColor: colors.safe,
    backgroundColor: colors.safeTint,
  },
  ruleCheckMark: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.safe,
  },
  ruleLabel: {
    flex: 1,
    fontSize: typography.sm,
    color: colors.textSecondary,
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
    minHeight: touch.comfortable + 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
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
    fontSize: typography.base,
    fontWeight: '700',
    color: colors.accent,
  },
  forcedHint: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: typography.xs,
    color: colors.textTertiary,
    fontWeight: '500',
  },
});
