import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './context/AuthContext';
import TabNavigator from './navigation/TabNavigator';
import LoginScreen from './screen/LoginScreen';
import ChangePasswordScreen from './screen/ChangePasswordScreen';

const splashLogo = require('./assets/splash-icon.png');
const SPLASH_HOLD_MS = 1800;

SplashScreen.preventAutoHideAsync().catch(() => {});

function BrandSplash() {
  return (
    <View style={styles.splash}>
      <Image
        source={splashLogo}
        style={styles.splashLogo}
        resizeMode="contain"
        accessibilityLabel="PoolsEye"
      />
    </View>
  );
}

function Root() {
  const { user, ready } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    const timer = setTimeout(() => setSplashDone(true), SPLASH_HOLD_MS);
    return () => clearTimeout(timer);
  }, []);

  // Splash is its own screen. Login is not mounted until this finishes.
  if (!splashDone || !ready) return <BrandSplash />;
  if (!user) return <LoginScreen />;
  if (user.mustChangePassword) return <ChangePasswordScreen forced />;
  return <TabNavigator />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  splashLogo: {
    width: 240,
    height: 240,
  },
});
