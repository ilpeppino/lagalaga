import type { ComponentProps } from 'react';
import { Surface as PaperSurface } from 'react-native-paper';

export type SurfaceProps = ComponentProps<typeof PaperSurface>;

export function Surface(props: SurfaceProps) {
  return <PaperSurface {...props} />;
}
