import React, { useEffect, useState } from 'react';
import { AppState, View, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/context/AppContext';
import { SettingsProvider } from './src/context/SettingsContext';
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
  const { session } = useAuth();
  const [bootstrapped, setBootstrapped] = useState(false);
  const [isBackground, setIsBackground] = useState(false);

  // Initial pull of server data into the local cache.
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

  // Re-sync when returning to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setIsBackground(state === 'background' || state === 'inactive');
      if (state === 'active' && session) {
        pullAll().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [session]);

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
          {isBackground && (
            <View
              pointerEvents="none"
              style={{ ...StyleSheet.absoluteFillObject, backgroundColor: BG }}
            />
          )}
        </NavigationContainer>
      </AppProvider>
    </SettingsProvider>
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
