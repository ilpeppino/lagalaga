import type { ComponentProps } from 'react';
import { TextInput as PaperTextInput } from 'react-native-paper';

type PaperTextInputProps = ComponentProps<typeof PaperTextInput>;

export interface TextInputProps extends Omit<PaperTextInputProps, 'mode'> {
  variant?: 'outlined' | 'flat';
}

export function TextInput({ variant = 'outlined', ...rest }: TextInputProps) {
  return <PaperTextInput mode={variant} {...rest} />;
}
