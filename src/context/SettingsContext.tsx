import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import { useColorScheme } from 'react-native';
import { AppSettings, UserProfile, DEFAULT_SETTINGS, DEFAULT_PROFILE } from '../models';
import * as Storage from '../storage';
import { DarkColors, LightColors } from '../theme';

export type ThemeColors = typeof DarkColors;

interface SettingsContextValue {
  settings: AppSettings;
  profile: UserProfile;
  effectiveTheme: 'light' | 'dark';
  colors: ThemeColors;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
  isLoaded: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);
  const systemScheme = useColorScheme();

  useEffect(() => {
    (async () => {
      const [s, p] = await Promise.all([Storage.loadSettings(), Storage.loadProfile()]);
      setSettings(s);
      setProfile(p);
      setIsLoaded(true);
    })();
  }, []);

  const effectiveTheme = useMemo<'light' | 'dark'>(() => {
    if (settings.theme === 'system') return systemScheme === 'light' ? 'light' : 'dark';
    return settings.theme;
  }, [settings.theme, systemScheme]);

  const colors = useMemo<ThemeColors>(
    () => (effectiveTheme === 'light' ? LightColors : DarkColors),
    [effectiveTheme],
  );

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await Storage.saveSettings(next);
  }, [settings]);

  const updateProfile = useCallback(async (patch: Partial<UserProfile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    await Storage.saveProfile(next);
  }, [profile]);

  const value = useMemo(
    () => ({ settings, profile, effectiveTheme, colors, updateSettings, updateProfile, isLoaded }),
    [settings, profile, effectiveTheme, colors, updateSettings, updateProfile, isLoaded],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};
