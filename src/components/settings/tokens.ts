import { typography } from '@/src/theme/typography';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const settingsTypography = {
  username: typography.username,
  sectionLabel: typography.sectionLabel,
  rowText: typography.rowText,
  secondaryText: typography.secondaryText,
  caption: typography.caption,
  dangerText: typography.dangerText,
};
