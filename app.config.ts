import type { ExpoConfig } from '@expo/config';

export default (): ExpoConfig => ({
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    // Opt-in switch for Apple Health. HealthKit requires the
    // `com.apple.developer.healthkit` entitlement, and calling the native
    // module WITHOUT it causes iOS to terminate the app (a native kill no JS
    // try/catch can stop). Keep this false until the entitlement is added to
    // the iOS project (via `expo prebuild` + rebuild) — otherwise merely
    // touching HealthKit crashes the app. Set EXPO_PUBLIC_HEALTH_KIT_ENABLED=true
    // once HealthKit is provisioned to enable the Sync button on Profile.
    healthKitEnabled: process.env.EXPO_PUBLIC_HEALTH_KIT_ENABLED === 'true',
  },
});
