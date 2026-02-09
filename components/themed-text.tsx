import { Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { Typography, LegacyTypeMapping, type TypographyToken } from '@/constants/typography';

/**
 * Typography token types - all 15 M3-based tokens
 */
export type TypographyType =
  // Display roles (brand font)
  | 'displayLarge'
  | 'displayMedium'
  | 'displaySmall'
  // Headline roles (brand font)
  | 'headlineLarge'
  | 'headlineMedium'
  | 'headlineSmall'
  // Title roles (system font)
  | 'titleLarge'
  | 'titleMedium'
  | 'titleSmall'
  // Body roles (system font)
  | 'bodyLarge'
  | 'bodyMedium'
  | 'bodySmall'
  // Label roles (system font)
  | 'labelLarge'
  | 'labelMedium'
  | 'labelSmall'
  // Legacy aliases (backward compatibility)
  | 'default'
  | 'title'
  | 'defaultSemiBold'
  | 'subtitle'
  | 'link';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: TypographyType;
};

/**
 * Get typography token for a given type, handling legacy mappings
 */
function getTypographyToken(type: TypographyType): TypographyToken {
  // Check if it's a legacy type that needs mapping
  if (type in LegacyTypeMapping) {
    const mappedType = LegacyTypeMapping[type as keyof typeof LegacyTypeMapping];
    return Typography[mappedType];
  }

  // Otherwise use the token directly
  return Typography[type as keyof typeof Typography];
}

/**
 * ThemedText component with full typography token support
 *
 * Features:
 * - All 15 M3-based typography tokens
 * - Backward compatible with legacy types (default, title, etc.)
 * - Automatic light/dark mode color theming
 * - Font scaling enabled by default (accessibility)
 * - Max font size multiplier to prevent layout breakage
 *
 * @example
 * // New tokens
 * <ThemedText type="headlineLarge">Welcome!</ThemedText>
 * <ThemedText type="bodyMedium">Description text</ThemedText>
 *
 * @example
 * // Legacy types (still work)
 * <ThemedText type="default">Body text</ThemedText>
 * <ThemedText type="title">Page Title</ThemedText>
 *
 * @example
 * // Custom colors
 * <ThemedText type="labelSmall" lightColor="#666" darkColor="#999">
 *   Caption
 * </ThemedText>
 */
export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  allowFontScaling = true,
  maxFontSizeMultiplier = 2,
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const typographyToken = getTypographyToken(type);

  // Special handling for 'link' type - preserve the link color
  const linkColor = type === 'link' ? '#0a7ea4' : undefined;

  return (
    <Text
      style={[
        typographyToken,
        { color: linkColor || color },
        style,
      ]}
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...rest}
    />
  );
}
