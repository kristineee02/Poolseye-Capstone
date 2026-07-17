// PoolsEye — Login screen (gradient header + layered wave into white, glass form)

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Image, KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Path, Circle, Line, Defs, Stop, RadialGradient,
  LinearGradient as SvgLinearGradient, Text as SvgText,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { DEMO_LIFEGUARD } from '../auth/demoAuth';
import { useAuth } from '../context/AuthContext';

const logo = require('../assets/logo.png');

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

// Same gradient wordmark as the web title (#FFF → #B3E5FC)
function BrandTitle() {
  return (
    <Svg width={200} height={36}>
      <Defs>
        <SvgLinearGradient id="brandGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.55" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#B3E5FC" />
        </SvgLinearGradient>
      </Defs>
      <SvgText
        x="100"
        y="26"
        textAnchor="middle"
        fontSize="25"
        fontWeight="800"
        letterSpacing="-0.5"
        fill="url(#brandGrad)"
      >
        PoolsEye
      </SvgText>
    </Svg>
  );
}

// Wave transition copied from the reference mockup:
// a deep-blue back wave crests on the right, one smooth white sweep in front —
// high on the left, dipping toward the bottom right.
function WaveTransition({ width }) {
  const height = 140;
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 375 140"
      preserveAspectRatio="none"
      style={styles.wave}
    >
      {/* Back wave — deep navy, rising on the right (purple layer in the mockup) */}
      <Path
        d="M0 112 C 80 118, 150 58, 232 50 C 297 44, 346 74, 375 60 L 375 140 L 0 140 Z"
        fill="#0A2F6B"
      />
      {/* Front wave — solid white, high on the left, dipping right */}
      <Path
        d="M0 56 C 55 22, 120 24, 185 56 C 252 90, 322 116, 375 100 L 375 140 L 0 140 Z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { signIn } = useAuth();
  const [email, setEmail] = useState(DEMO_LIFEGUARD.email);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
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
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ── Gradient header (same palette as web login) ─────── */}
          <LinearGradient
            colors={['#4FC3F7', '#007BFF', '#1565C0', '#0D47A1']}
            locations={[0, 0.34, 0.7, 1]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.95, y: 1 }}
            style={[styles.header, { paddingTop: insets.top + 34 }]}
          >
            <View style={styles.logoGlowWrap}>
              <Svg width={150} height={150} style={styles.logoGlow}>
                <Defs>
                  <RadialGradient id="logoGlow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
                    <Stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.5" />
                    <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                  </RadialGradient>
                </Defs>
                <Circle cx="75" cy="75" r="75" fill="url(#logoGlow)" />
              </Svg>
              <Image source={logo} style={styles.logo} resizeMode="contain" />
            </View>
            <BrandTitle />
            <WaveTransition width={width} />
          </LinearGradient>

          {/* ── White body ──────────────────────────────────────── */}
          <View style={styles.body}>
            <Text style={styles.welcome}>Welcome back !</Text>

            <View>
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

              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="Password"
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

              <View style={styles.optionsRow}>
                <TouchableOpacity
                  style={styles.rememberWrap}
                  onPress={() => setRememberMe((v) => !v)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: rememberMe }}
                >
                  <View style={[styles.radioOuter, rememberMe && styles.radioOuterActive]}>
                    {rememberMe ? <View style={styles.radioInner} /> : null}
                  </View>
                  <Text style={styles.rememberText}>Remember me</Text>
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.7}>
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity
                onPress={handleSignIn}
                disabled={loading}
                activeOpacity={0.85}
                style={loading ? styles.buttonDisabled : null}
              >
                <LinearGradient
                  colors={['#4FC3F7', '#007BFF', '#1565C0', '#0D47A1']}
                  locations={[0, 0.4, 0.78, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.button}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Login</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <Text style={styles.hint}>
              Demo: {DEMO_LIFEGUARD.email} / {DEMO_LIFEGUARD.password}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    alignItems: 'center',
    paddingBottom: 150,
    position: 'relative',
  },
  wave: {
    position: 'absolute',
    bottom: -1,
    left: 0,
  },
  logoGlowWrap: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -12,
    marginTop: -14,
  },
  logoGlow: {
    position: 'absolute',
  },
  logo: {
    width: 100,
    height: 100,
  },

  // Body
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  welcome: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 20,
  },

  // Pill glass inputs — frosted light-blue tint with bright edge
  input: {
    height: 52,
    borderRadius: radius.full,
    paddingHorizontal: 22,
    fontSize: typography.md,
    color: colors.textPrimary,
    backgroundColor: 'rgba(232, 244, 255, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 14,
    shadowColor: '#0D47A1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 2,
  },
  passwordWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 52,
  },
  eyeButton: {
    position: 'absolute',
    right: 10,
    top: 8,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },

  // Options row
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  rememberWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: colors.accent,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.accent,
  },
  rememberText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  forgotText: {
    fontSize: typography.sm,
    color: colors.textTertiary,
    fontWeight: '500',
  },

  error: {
    fontSize: typography.sm,
    color: colors.alarmDark,
    backgroundColor: colors.alarmTint,
    borderWidth: 1,
    borderColor: colors.alarmBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    marginBottom: 14,
    overflow: 'hidden',
  },

  // Pill login button — same gradient as the web Sign in button
  button: {
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0D47A1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: typography.lg,
    fontWeight: '700',
  },
  hint: {
    marginTop: 16,
    fontSize: typography.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
