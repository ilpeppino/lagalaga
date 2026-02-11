import {
  MD3DarkTheme,
  MD3LightTheme,
  configureFonts,
  type MD3Theme,
} from 'react-native-paper';

import { Colors } from './theme';
import { Typography, type TypographyToken } from './typography';

type MD3FontWeight =
  | 'normal'
  | 'bold'
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900'
  | undefined;

type MD3FontConfig = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fontWeight: MD3FontWeight;
};

function normalizeFontWeight(weight: TypographyToken['fontWeight']): MD3FontWeight {
  if (typeof weight === 'number') {
    return String(weight) as MD3FontWeight;
  }

  if (
    weight === 'normal' ||
    weight === 'bold' ||
    weight === '100' ||
    weight === '200' ||
    weight === '300' ||
    weight === '400' ||
    weight === '500' ||
    weight === '600' ||
    weight === '700' ||
    weight === '800' ||
    weight === '900'
  ) {
    return weight;
  }

  return '400';
}

function toMd3FontConfig(token: TypographyToken): MD3FontConfig {
  return {
    fontFamily: token.fontFamily,
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing ?? 0,
    fontWeight: normalizeFontWeight(token.fontWeight),
  };
}

const md3TypographyConfig = {
  displayLarge: toMd3FontConfig(Typography.displayLarge),
  displayMedium: toMd3FontConfig(Typography.displayMedium),
  displaySmall: toMd3FontConfig(Typography.displaySmall),
  headlineLarge: toMd3FontConfig(Typography.headlineLarge),
  headlineMedium: toMd3FontConfig(Typography.headlineMedium),
  headlineSmall: toMd3FontConfig(Typography.headlineSmall),
  titleLarge: toMd3FontConfig(Typography.titleLarge),
  titleMedium: toMd3FontConfig(Typography.titleMedium),
  titleSmall: toMd3FontConfig(Typography.titleSmall),
  bodyLarge: toMd3FontConfig(Typography.bodyLarge),
  bodyMedium: toMd3FontConfig(Typography.bodyMedium),
  bodySmall: toMd3FontConfig(Typography.bodySmall),
  labelLarge: toMd3FontConfig(Typography.labelLarge),
  labelMedium: toMd3FontConfig(Typography.labelMedium),
  labelSmall: toMd3FontConfig(Typography.labelSmall),
} as const;

const paperFonts = configureFonts({
  config: md3TypographyConfig,
  isV3: true,
});

export const LightPaperTheme: MD3Theme = {
  ...MD3LightTheme,
  animation: {
    scale: 1,
    defaultAnimationDuration: 200,
  },
  colors: {
    ...MD3LightTheme.colors,
    primary: Colors.light.tint,
    secondary: '#007AFF',
    surface: Colors.light.background,
    onSurface: Colors.light.text,
    background: Colors.light.background,
    onBackground: Colors.light.text,
    error: '#c62828',
    outline: '#DDDDDD',
  },
  fonts: paperFonts,
};

export const DarkPaperTheme: MD3Theme = {
  ...MD3DarkTheme,
  animation: {
    scale: 1,
    defaultAnimationDuration: 200,
  },
  colors: {
    ...MD3DarkTheme.colors,
    primary: Colors.dark.tint,
    surface: Colors.dark.background,
    onSurface: Colors.dark.text,
    background: Colors.dark.background,
    onBackground: Colors.dark.text,
    outline: '#3A3D40',
  },
  fonts: paperFonts,
};
