import React, { useEffect, useState } from 'react';
import { AppState, View, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useAppContext } from './src/context/AppContext';
import { SettingsProvider, useSettings } from './src/context/SettingsContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { pullAll } from './src/storage';
import TabNavigator from './src/navigation/TabNavigator';
import AuthScreen from './src/screens/AuthScreen';
import { DarkColors as C } from './src/theme';

const BG = C.background;

// Gate that waits for a session, then boots the data layer (pull from server)
// before revealing the main app. Splits providers so Auth is available to the
// gate but the data providers only mount once authenticated.
function AuthedApp() {
  const [bootstrapped, setBootstrapped] = useState(false);

  // Initial pull of server data into the local cache. Providers read from the
  // cache on mount, so a pull *before* they mount is enough for first launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await pullAll();
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!bootstrapped) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  return (
    <SettingsProvider>
      <AppProvider>
        <NavigationContainer>
          <StatusBar style="auto" backgroundColor="transparent" translucent />
          <TabNavigator />
          <ForegroundSync />
        </NavigationContainer>
      </AppProvider>
    </SettingsProvider>
  );
}

/**
 * Listens for foreground transitions and re-pulls server data. Because this is
 * mounted *inside* the Settings + App providers, after each pull it can call
 * both `reloadFromCache` functions so in-memory state (profile, logs, etc.)
 * reflects the freshly-merged cache instead of going stale — which is what
 * previously made body fat / objectives appear to reset after backgrounding.
 */
function ForegroundSync() {
  const { session } = useAuth();
  const { reloadFromCache: reloadSettings } = useSettings();
  const { reloadFromCache: reloadApp } = useAppContext();
  const [isBackground, setIsBackground] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      setIsBackground(state === 'background' || state === 'inactive');
      if (state === 'active' && session) {
        try {
          await pullAll();
          // Refresh provider state from the merged cache.
          await Promise.all([reloadSettings(), reloadApp()]);
        } catch {
          // Best-effort; the next foreground will retry.
        }
      }
    });
    return () => sub.remove();
  }, [session, reloadSettings, reloadApp]);

  if (!isBackground) return null;
  return (
    <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, backgroundColor: BG }} />
  );
}

function Root() {
  const { session, isLoading } = useAuth();
  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }
  if (!session) return <AuthScreen />;
  return <AuthedApp />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
});
