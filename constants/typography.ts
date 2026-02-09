/**
 * Typography token system based on Material Design 3 type scale
 * Adapted for mobile with brand (BitcountSingle) and plain (system) typefaces
 *
 * Reference: https://m3.material.io/styles/typography/type-scale-tokens
 *
 * Brand font (BitcountSingle): Used for Display and Headline roles (24px+)
 * Plain font (system): Used for Title, Body, and Label roles
 */

import { TextStyle } from 'react-native';
import { Fonts } from './theme';

/**
 * Typography token definition
 */
export interface TypographyToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: TextStyle['fontWeight'];
  letterSpacing?: number;
}

/**
 * M3-inspired typography scale with 15 tokens across 5 roles
 *
 * Roles:
 * - Display: Large, high-impact text for hero sections (brand font)
 * - Headline: High-emphasis text for section headings (brand font)
 * - Title: Medium-emphasis text for dividing content (system font)
 * - Body: Primary reading text for longer passages (system font)
 * - Label: Smaller utility text for UI components (system font)
 */
export const Typography: Record<string, TypographyToken> = {
  // ========================================================================
  // DISPLAY — Reserved for short, impactful hero text (brand font)
  // ========================================================================
  displayLarge: {
    fontFamily: Fonts.brand,
    fontSize: 57,
    lineHeight: 64,
    fontWeight: '400',
  },
  displayMedium: {
    fontFamily: Fonts.brand,
    fontSize: 45,
    lineHeight: 52,
    fontWeight: '400',
  },
  displaySmall: {
    fontFamily: Fonts.brand,
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '400',
  },

  // ========================================================================
  // HEADLINE — High-emphasis section headings (brand font)
  // ========================================================================
  headlineLarge: {
    fontFamily: Fonts.brand,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '400',
  },
  headlineMedium: {
    fontFamily: Fonts.brand,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '400',
  },
  headlineSmall: {
    fontFamily: Fonts.brand,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '400',
  },

  // ========================================================================
  // TITLE — Medium-emphasis text for content divisions (system font)
  // ========================================================================
  titleLarge: {
    fontFamily: Fonts.sans,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '400',
  },
  titleMedium: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  titleSmall: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },

  // ========================================================================
  // BODY — Primary reading text for longer passages (system font)
  // ========================================================================
  bodyLarge: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  bodyMedium: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  bodySmall: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },

  // ========================================================================
  // LABEL — Small utility text for UI components (system font)
  // ========================================================================
  labelLarge: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  labelMedium: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  labelSmall: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
};

/**
 * Legacy token aliases for backward compatibility with existing ThemedText component
 * Maps old type names to new M3-based tokens
 */
export const LegacyTypeMapping: Record<string, keyof typeof Typography> = {
  default: 'bodyLarge',           // 16px regular body text
  title: 'headlineLarge',         // 32px bold headline
  defaultSemiBold: 'titleMedium', // 16px semibold title
  subtitle: 'titleLarge',         // 22px subtitle
  link: 'bodyLarge',              // 16px body (color applied separately)
};

/**
 * Font weight helper for bold variants
 * BitcountSingle has two weights: Regular (400) and Bold (700)
 */
export function getBrandFontFamily(weight: number): string {
  return weight >= 700 ? 'BitcountSingle-Bold' : 'BitcountSingle-Regular';
}

/**
 * Create a custom typography token with overrides
 */
export function createTypographyToken(
  base: keyof typeof Typography,
  overrides: Partial<TypographyToken>
): TypographyToken {
  return {
    ...Typography[base],
    ...overrides,
  };
}

/**
 * Type guard to check if a token is using the brand font
 */
export function isBrandFont(token: keyof typeof Typography): boolean {
  return token.startsWith('display') || token.startsWith('headline');
}
