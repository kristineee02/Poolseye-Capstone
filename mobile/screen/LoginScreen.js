import React, { useState } from 'react';
import {
  View, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
  ScrollView, Image,
} from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadow, touch } from '../theme/tokens';
import { GradientButton } from '../components/Primitives';
import { useAuth } from '../context/AuthContext';
import StatusModal from '../components/StatusModal';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import { LockIcon, PasswordVisibilityIcon, UserIcon } from '../components/icons/FormIcons';

const logo = require('../assets/logo.png');

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fields, setFields] = useState({});
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const handleSignIn = async () => {
    const next = {};
    if (!email.trim()) next.email = 'Enter your email.';
    if (!password) next.password = 'Enter your password.';
    setFields(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (!result.ok) {
      setStatus({
        tone: 'error',
        title: 'Sign in failed',
        message: result.error || 'Could not sign in.',
      });
    }
  };

  if (showForgot) {
    return <ForgotPasswordScreen onCancel={() => setShowForgot(false)} />;
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.logoWrap}>
            <Image
              source={logo}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="PoolsEye logo"
            />
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <View style={styles.fieldIcon}>
                <UserIcon />
              </View>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(value) => { setEmail(value); setFields((f) => ({ ...f, email: '' })); }}
                placeholder="Email"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>
            {fields.email ? <Text style={styles.fieldError}>{fields.email}</Text> : null}

            <View style={styles.field}>
              <View style={styles.fieldIcon}>
                <LockIcon />
              </View>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={(value) => { setPassword(value); setFields((f) => ({ ...f, password: '' })); }}
                secureTextEntry={!showPassword}
                placeholder="Password"
                placeholderTextColor="#94A3B8"
                autoComplete="password"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                activeOpacity={0.7}
              >
                <PasswordVisibilityIcon visible={showPassword} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            {fields.password ? <Text style={styles.fieldError}>{fields.password}</Text> : null}

            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={() => setShowForgot(true)}
              activeOpacity={0.75}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <GradientButton
              onPress={handleSignIn}
              disabled={loading}
              loading={loading}
              label="Login"
              style={[styles.button, loading && styles.buttonDisabled]}
              textStyle={styles.buttonText}
            />
          </View>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },

  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    width: 180,
    height: 180,
  },

  form: {
    width: '100%',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touch.comfortable + 6,
    borderRadius: radius.lg,
    backgroundColor: colors.bgPanel,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow.sm,
  },
  fieldIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: typography.md,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  passwordInput: {
    paddingRight: 8,
  },
  eyeButton: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },

  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: spacing.md,
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: colors.accent,
  },

  fieldError: {
    color: colors.alarm,
    fontSize: typography.sm,
    fontWeight: '600',
    marginTop: -8,
    marginBottom: 10,
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
    marginBottom: spacing.md,
    overflow: 'hidden',
    lineHeight: 18,
  },

  button: {
    minHeight: touch.comfortable + 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: typography.md,
    fontWeight: '700',
  },
});
