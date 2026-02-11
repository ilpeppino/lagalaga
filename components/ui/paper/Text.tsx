import type { ComponentProps } from 'react';
import { Text as PaperText } from 'react-native-paper';

export type TextProps = ComponentProps<typeof PaperText>;

export function Text(props: TextProps) {
  return <PaperText {...props} />;
}
