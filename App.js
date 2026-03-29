/**
 * Kharcha — UPI/SMS Expense Tracker
 * Entry point: database init → onboarding (first launch) → navigator
 */
import * as Sentry from '@sentry/react-native';
import React, { useEffect, useState } from 'react';
import { StatusBar, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { initDatabase, getSetting } from './src/lib/database';
import AppNavigator from './src/navigation/AppNavigator';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { colors, type } from './src/theme';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  // Only send crashes in production builds
  environment: __DEV__ ? 'development' : 'production',
});

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        const done = await getSetting('onboarding_done');
        setShowOnboarding(done !== '1');
        setReady(true);
      }
      catch (e) { console.error('Init error:', e); setError(e.message); }
    })();
  }, []);

  if (error) {
    return (
      <View style={st.splash}>
        <StatusBar barStyle="light-content" backgroundColor={colors.surface.base} />
        <Text style={{ fontSize: 48, marginBottom: 16 }}>⚠️</Text>
        <Text style={[type.headlineM, { color: colors.expense }]}>Failed to initialize</Text>
        <Text style={[type.bodyS, { color: colors.text.muted, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 }]}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={st.splash}>
        <StatusBar barStyle="light-content" backgroundColor={colors.surface.base} />
        <Text style={{ fontSize: 48 }}>💰</Text>
        <Text style={[type.displayM, { color: colors.text.headline, marginTop: 16 }]}>Kharcha</Text>
        <ActivityIndicator size="large" color={colors.primary.main} style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (showOnboarding) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor={colors.surface.base} />
        <OnboardingScreen onDone={() => setShowOnboarding(false)} />
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface.base} />
      <AppNavigator />
    </>
  );
}

const st = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.surface.base, justifyContent: 'center', alignItems: 'center' },
});

export default Sentry.wrap(App);
