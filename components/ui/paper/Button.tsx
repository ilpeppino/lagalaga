import type { ComponentProps } from 'react';
import { Button as PaperButton } from 'react-native-paper';

type PaperButtonProps = ComponentProps<typeof PaperButton>;

export type ButtonVariant = 'filled' | 'outlined' | 'text' | 'elevated' | 'tonal';

export interface ButtonProps extends Omit<PaperButtonProps, 'mode' | 'children'> {
  title: string;
  variant?: ButtonVariant;
}

function mapVariantToMode(variant: ButtonVariant): PaperButtonProps['mode'] {
  if (variant === 'filled') {
    return 'contained';
  }

  if (variant === 'tonal') {
    return 'contained-tonal';
  }

  return variant;
}

export function Button({ title, variant = 'filled', ...rest }: ButtonProps) {
  return (
    <PaperButton mode={mapVariantToMode(variant)} {...rest}>
      {title}
    </PaperButton>
  );
}
