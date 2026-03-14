import { useAppTheme } from '@/contexts/AppThemeContext';

/**
 * Returns the resolved color scheme ('light' or 'dark'), respecting the user's
 * theme preference (Light / Dark / System) set in the Me screen.
 * Falls back to 'light' when called outside AppThemeProvider (e.g. during SSR).
 */
export function useColorScheme(): 'light' | 'dark' {
  return useAppTheme().colorScheme;
}
