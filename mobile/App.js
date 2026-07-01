import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TabNavigator from './navigation/TabNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <TabNavigator />
    </SafeAreaProvider>
  );
}
