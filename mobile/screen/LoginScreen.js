// PoolsEye — Login screen (demo)

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Image, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography, shadow } from '../theme/tokens';
import { DEMO_LIFEGUARD } from '../auth/demoAuth';
import { useAuth } from '../context/AuthContext';

const logo = require('../assets/logo-header.png');

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

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [email, setEmail] = useState(DEMO_LIFEGUARD.email);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setError('');
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <LinearGradient
      colors={[colors.accentDeep, colors.accentStrong, colors.accent]}
      style={styles.gradient}
    >
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>PoolsEye</Text>
          <Text style={styles.subtitle}>Lifeguard sign in</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="lifeguard123"
                placeholderTextColor={colors.textTertiary}
                autoComplete="password"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                activeOpacity={0.7}
              >
                <PasswordToggleIcon visible={showPassword} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.hint}>
            Demo: {DEMO_LIFEGUARD.email} / {DEMO_LIFEGUARD.password}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    padding: 24,
    ...shadow.md,
  },
  logo: {
    width: 56,
    height: 56,
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: typography.xl,
    fontWeight: '700',
    color: colors.accentStrong,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    marginTop: 4,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontSize: typography.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: typography.base,
    color: colors.textPrimary,
    backgroundColor: colors.bgApp,
  },
  passwordWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 4,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  error: {
    fontSize: typography.sm,
    color: colors.alarm,
    marginBottom: 10,
  },
  button: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: typography.base,
    fontWeight: '600',
  },
  hint: {
    marginTop: 18,
    fontSize: typography.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
