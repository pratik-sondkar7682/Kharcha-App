/**
 * Kharcha — UPI/SMS Expense Tracker
 * Entry point: database init → splash → navigator
 */
import React, { useEffect, useState } from 'react';
import { StatusBar, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { initDatabase } from './src/lib/database';
import AppNavigator from './src/navigation/AppNavigator';
import { colors, type } from './src/theme';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try { await initDatabase(); setReady(true); }
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
