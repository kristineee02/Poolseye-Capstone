// PoolsEye — Forgot Password (verify email → reset)

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadow, touch } from '../theme/tokens';
import { GradientButton } from '../components/Primitives';
import { useAuth } from '../context/AuthContext';
import StatusModal from '../components/StatusModal';
import ChangePasswordScreen from './ChangePasswordScreen';

const CODE_TTL_SEC = 10 * 60;

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

function CodeBoxes({ value, onChange }) {
  const refs = useRef([]);
  const chars = Array.from({ length: 6 }, (_, i) => value[i] || '');

  return (
    <View style={styles.codeRow}>
      {chars.map((char, index) => (
        <TextInput
          key={index}
          ref={(el) => { refs.current[index] = el; }}
          style={styles.codeBox}
          value={char}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          onChangeText={(text) => {
            const raw = text.replace(/\D/g, '');
            if (raw.length > 1) {
              const pasted = raw.slice(0, 6);
              onChange(pasted);
              refs.current[Math.min(pasted.length, 5)]?.focus();
              return;
            }
            const next = chars.slice();
            next[index] = raw;
            onChange(next.join(''));
            if (raw && refs.current[index + 1]) refs.current[index + 1].focus();
          }}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === 'Backspace' && !chars[index] && refs.current[index - 1]) {
              refs.current[index - 1].focus();
            }
          }}
        />
      ))}
    </View>
  );
}

export default function ForgotPasswordScreen({ onCancel }) {
  const insets = useSafeAreaInsets();
  const { verifyResetEmail, resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState(null);
  const [code, setCode] = useState('');
  const [codeReady, setCodeReady] = useState(false);
  const [demoCode, setDemoCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(CODE_TTL_SEC);

  const handleVerify = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setEmailError('Enter the email for your lifeguard account.');
      return;
    }
    setEmailError('');

    setLoading(true);
    const result = await verifyResetEmail(trimmed);
    setLoading(false);

    if (!result.ok) {
      setStatus({
        tone: 'error',
        title: 'Code not sent',
        message: result.error || 'Could not send a reset code.',
      });
      return;
    }
    setVerifiedEmail(trimmed);
    setDemoCode(result.demoCode || '');
    setCode('');
    setSecondsLeft(CODE_TTL_SEC);
    setStatus({
      tone: 'success',
      title: 'Code sent',
      message: result.demoCode
        ? `A reset code was sent. Demo code: ${result.demoCode}`
        : 'A 6-digit code was sent to your email.',
    });
  };

  useEffect(() => {
    if (!verifiedEmail) return undefined;
    const timer = setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [verifiedEmail]);

  const handleCode = () => {
    if (!/^\d{6}$/.test(code)) {
      setCodeError('Enter the 6-digit code from your email.');
      return;
    }
    setCodeError('');
    setCodeReady(true);
  };

  if (codeReady && verifiedEmail) {
    return (
      <ChangePasswordScreen
        resetMode
        resetEmail={verifiedEmail}
        onCancel={onCancel}
        onResetSubmit={async ({ newPassword }) => {
          const result = await resetPassword({
            email: verifiedEmail,
            newPassword,
            code,
          });
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
            onPress={() => {
              if (verifiedEmail) {
                setVerifiedEmail(null);
                setCode('');
                setEmailError('');
                setCodeError('');
                return;
              }
              onCancel?.();
            }}
            activeOpacity={0.75}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <BackArrow />
          </TouchableOpacity>

          <Text style={styles.title}>Forgot password</Text>
          <Text style={styles.subtitle}>
            {verifiedEmail
              ? 'Enter the 6-digit code sent to your email.'
              : 'Enter your account email to reset your password.'}
          </Text>
          {demoCode ? <Text style={styles.subtitle}>Demo code: {demoCode}</Text> : null}

          {verifiedEmail ? (
            <CodeBoxes value={code} onChange={(value) => { setCode(value); setCodeError(''); }} />
          ) : (
            <View style={styles.field}>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(value) => { setEmail(value); setEmailError(''); }}
                placeholder="Email"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>
          )}
          {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}
          {verifiedEmail && codeError ? <Text style={styles.fieldError}>{codeError}</Text> : null}

          <GradientButton
            onPress={verifiedEmail ? handleCode : handleVerify}
            disabled={loading || (Boolean(verifiedEmail) && secondsLeft <= 0)}
            loading={loading}
            label="Continue"
            style={[styles.button, (loading || (verifiedEmail && secondsLeft <= 0)) && styles.buttonDisabled]}
            textStyle={styles.buttonText}
          />

          {verifiedEmail ? (
            <View style={styles.codeMeta}>
              <Text style={styles.expireText}>
                {secondsLeft > 0
                  ? 'This code will expire in 10 minutes.'
                  : 'This code has expired.'}
              </Text>
              <TouchableOpacity
                onPress={handleVerify}
                disabled={loading}
                style={styles.resendBtn}
                activeOpacity={0.75}
              >
                <Text style={styles.resendText}>{loading ? 'Sending…' : 'Resend code'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <StatusModal
        visible={Boolean(status)}
        onClose={() => setStatus(null)}
        title={status?.title}
        message={status?.message}
        tone={status?.tone}
      />
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
  codeMeta: {
    marginTop: 18,
    alignItems: 'center',
    gap: 8,
  },
  fieldError: {
    color: colors.alarm,
    fontSize: typography.sm,
    fontWeight: '600',
    marginTop: -4,
    marginBottom: 10,
    textAlign: 'center',
  },
  expireText: {
    textAlign: 'center',
    color: colors.textTertiary,
    fontSize: typography.sm,
    fontWeight: '500',
  },
  resendBtn: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  resendText: {
    color: '#2881FF',
    fontWeight: '700',
    fontSize: typography.sm,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  codeBox: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel,
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
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
});
