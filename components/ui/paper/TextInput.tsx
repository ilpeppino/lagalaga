import { useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import { TextInput as PaperTextInput } from 'react-native-paper';

type PaperTextInputProps = ComponentProps<typeof PaperTextInput>;

export interface TextInputProps extends Omit<PaperTextInputProps, 'mode'> {
  variant?: 'outlined' | 'flat';
}

export function TextInput({ variant = 'outlined', ...rest }: TextInputProps) {
  const [revealed, setRevealed] = useState(false);
  const hasSecureEntry = Boolean(rest.secureTextEntry);

  const resolvedSecureEntry = useMemo(() => {
    if (!hasSecureEntry) return rest.secureTextEntry;
    return !revealed;
  }, [hasSecureEntry, revealed, rest.secureTextEntry]);

  const rightAdornment = useMemo(() => {
    if (!hasSecureEntry) {
      return rest.right;
    }

    return (
      <PaperTextInput.Icon
        icon={revealed ? 'eye-off' : 'eye'}
        onPress={() => setRevealed((current) => !current)}
        forceTextInputFocus={false}
      />
    );
  }, [hasSecureEntry, revealed, rest.right]);

  return (
    <PaperTextInput
      mode={variant}
      {...rest}
      secureTextEntry={resolvedSecureEntry}
      right={rightAdornment}
    />
  );
}
