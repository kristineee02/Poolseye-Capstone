// PoolsEye — Login screen (gradient header + rounded white form sheet)
// Layout matches the reference; colors match the web login palette.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, typography } from '../theme/tokens';
import { DEMO_LIFEGUARD } from '../auth/demoAuth';
import { useAuth } from '../context/AuthContext';

const WEB_GRADIENT = ['#4FC3F7', '#007BFF', '#1565C0', '#0D47A1'];
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
    <View style={styles.screen}>
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
          {/* ── Gradient header (same blues as web login) ── */}
          <LinearGradient
            colors={WEB_GRADIENT}
            locations={[0, 0.32, 0.68, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.header, { paddingTop: insets.top + 36 }]}
          >
            <View style={styles.logoWrap}>
              <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel="PoolsEye logo" />
            </View>
          </LinearGradient>

          {/* ── White form sheet with large top radius ── */}
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 28 }]}>
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

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              onPress={handleSignIn}
              disabled={loading}
              activeOpacity={0.85}
              style={loading ? styles.buttonDisabled : null}
            >
              <LinearGradient
                colors={WEB_GRADIENT}
                locations={[0, 0.4, 0.78, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.button}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Sign in</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

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
  scrollContent: {
    flexGrow: 1,
  },

  // Header — about top 42% of screen feel
  header: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 56,
  },
  logoWrap: {
    width: 180,
    height: 180,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    overflow: 'hidden',
    shadowColor: '#0D47A1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
  logo: {
    width: '100%',
    height: '100%',
  },

  // White sheet overlapping the gradient
  sheet: {
    flex: 1,
    marginTop: -36,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 28,
    paddingTop: 36,
    shadowColor: '#0D47A1',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },

  input: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 18,
    fontSize: typography.md,
    color: colors.textPrimary,
    backgroundColor: '#F0F2F5',
    marginBottom: 14,
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

  button: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#0D47A1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  hint: {
    marginTop: 22,
    fontSize: typography.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
