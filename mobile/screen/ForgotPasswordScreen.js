// PoolsEye — Forgot Password (verify email → reset)

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadow, touch } from '../theme/tokens';
import { useAuth } from '../context/AuthContext';
import ChangePasswordScreen from './ChangePasswordScreen';

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

export default function ForgotPasswordScreen({ onCancel }) {
  const insets = useSafeAreaInsets();
  const { verifyResetEmail, resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState(null);

  const handleVerify = async () => {
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Enter the email for your lifeguard account.');
      return;
    }

    setLoading(true);
    const result = await verifyResetEmail(trimmed);
    setLoading(false);

    if (!result.ok) {
      setError(result.error || 'Could not verify email.');
      return;
    }
    setVerifiedEmail(trimmed);
  };

  if (verifiedEmail) {
    return (
      <ChangePasswordScreen
        resetMode
        resetEmail={verifiedEmail}
        onCancel={onCancel}
        onResetSubmit={async ({ newPassword }) => {
          const result = await resetPassword({
            email: verifiedEmail,
            newPassword,
          });
          if (result.ok) onCancel?.();
          return result;
        }}
      />
    );
  }

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

          <Text style={styles.title}>Forgot password</Text>
          <Text style={styles.subtitle}>
            Enter your account email to reset your password.
          </Text>

          <View style={styles.field}>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            onPress={handleVerify}
            disabled={loading}
            activeOpacity={0.85}
            style={[styles.button, loading && styles.buttonDisabled]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} activeOpacity={0.8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  backBtn: {
    width: 36,
    height: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 2,
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
    paddingHorizontal: spacing.md + 4,
    ...shadow.sm,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: typography.md,
    color: colors.textPrimary,
    paddingVertical: 0,
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
});
