import React, { useCallback, useEffect, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './context/AuthContext';
import TabNavigator from './navigation/TabNavigator';
import LoginScreen from './screen/LoginScreen';
import { colors } from './theme/tokens';

const logo = require('./assets/logo.png');

SplashScreen.preventAutoHideAsync().catch(() => {});

function BrandSplash() {
  return (
    <View style={styles.splash}>
      <Image source={logo} style={styles.splashLogo} resizeMode="contain" />
    </View>
  );
}

function Root({ onReady }) {
  const { user, ready } = useAuth();

  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);

  if (!ready) return <BrandSplash />;
  if (!user) return <LoginScreen />;
  return <TabNavigator />;
}

export default function App() {
  const [appReady, setAppReady] = useState(false);

  const onReady = useCallback(() => {
    setAppReady(true);
  }, []);

  useEffect(() => {
    if (!appReady) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [appReady]);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Root onReady={onReady} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F8FF',
  },
  splashLogo: {
    width: 240,
    height: 240,
  },
});
