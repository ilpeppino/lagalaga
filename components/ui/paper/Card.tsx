import type { ComponentProps } from 'react';
import { Card as PaperCard } from 'react-native-paper';

export type CardProps = ComponentProps<typeof PaperCard>;

export function Card(props: CardProps) {
  return <PaperCard {...props} />;
}

export const CardContent = PaperCard.Content;
export const CardActions = PaperCard.Actions;
export const CardCover = PaperCard.Cover;
export const CardTitle = PaperCard.Title;
