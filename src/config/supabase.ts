// Supabase client — the only connection config the app needs.
// The anon key is safe to ship (it's protected by RLS); the service-role key
// is NEVER in the app. Override locally with src/config/supabase.local.ts
// (gitignored) for dev against a separate project.

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

// Defaults — replace with your project values, or override via supabase.local.ts
const DEFAULT_URL = 'https://YOUR-PROJECT-ref.supabase.co';
const DEFAULT_ANON_KEY = 'your-anon-key';

let localUrl = DEFAULT_URL;
let localAnon = DEFAULT_ANON_KEY;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const local = require('./supabase.local');
  if (local?.SUPABASE_URL) localUrl = local.SUPABASE_URL;
  if (local?.SUPABASE_ANON_KEY) localAnon = local.SUPABASE_ANON_KEY;
} catch {
  // no local override — fine
}

// Platform-aware storage adapter.
//  * Native (iOS/Android): expo-secure-store → Keychain/Keystore (encrypted).
//  * Web: AsyncStorage → localStorage. expo-secure-store is unsupported on web
//    and throws, which previously swallowed the getSession() rejection and
//    left AuthContext stuck on isLoading=true (infinite spinner on login).
//
// NOTE: the full supabase session blob can exceed expo-secure-store's ~2KB
// Keychain cap and trigger a SecureStore warning. That warning is benign
// (Keychain still accepts it); for a hard guarantee, swap the native branch
// for react-native-keychain (no size cap). See README.
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const AsyncStorageAdapter = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

// Lazy-import the platform-specific store so the web bundle never loads
// expo-secure-store (which would throw at import time on web).
let storageAdapter: any;
if (Platform.OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  storageAdapter = AsyncStorageAdapter;
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const SecureStore = require('expo-secure-store');
  storageAdapter = {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
  };
}

export const supabase = createClient(localUrl, localAnon, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Tell supabase-js to refresh the token when the app returns to the foreground.
// (No-op on web — AppState change events still fire but are harmless.)
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.refreshSession();
  });
}

export const SUPABASE_URL = localUrl;

