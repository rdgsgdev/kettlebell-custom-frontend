// Supabase client — the only connection config the app needs.
// The anon key is safe to ship (it's protected by RLS); the service-role key
// is NEVER in the app. Override locally with src/config/supabase.local.ts
// (gitignored) for dev against a separate project.

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
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

// expo-secure-store adapter so supabase-js persists the session in the Keychain.
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(localUrl, localAnon, {
  auth: {
    storage: ExpoSecureStoreAdapter as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Tell supabase-js to refresh the token when the app returns to the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.refreshSession();
});

export const SUPABASE_URL = localUrl;
