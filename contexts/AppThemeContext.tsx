import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import {
  type ThemePreference,
  loadThemePreference,
  saveThemePreference,
} from '@/src/lib/themePreference';

type ColorScheme = 'light' | 'dark';

interface AppThemeContextValue {
  colorScheme: ColorScheme;
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => Promise<void>;
}

const AppThemeContext = createContext<AppThemeContextValue>({
  colorScheme: 'light',
  themePreference: 'system',
  setThemePreference: async () => {},
});

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? 'light';
  const [themePreference, setThemePref] = useState<ThemePreference>('system');

  useEffect(() => {
    loadThemePreference().then(setThemePref).catch(() => {});
  }, []);

  const colorScheme: ColorScheme =
    themePreference === 'system' ? systemScheme : themePreference;

  const setThemePreference = useCallback(async (pref: ThemePreference) => {
    setThemePref(pref);
    await saveThemePreference(pref);
  }, []);

  return (
    <AppThemeContext.Provider value={{ colorScheme, themePreference, setThemePreference }}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme(): AppThemeContextValue {
  return useContext(AppThemeContext);
}
