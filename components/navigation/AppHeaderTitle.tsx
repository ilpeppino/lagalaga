import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  APP_HEADER_TITLE_FONT_FAMILY,
  APP_HEADER_TITLE_HORIZONTAL_PADDING,
  APP_HEADER_TITLE_MAX_WIDTH,
  APP_HEADER_TITLE_MINIMUM_FONT_SCALE,
} from '@/src/lib/navigationHeader';

export function AppHeaderTitle({ title }: { title: string }) {
  const colorScheme = useColorScheme();
  const textColor = Colors[colorScheme ?? 'light'].text;

  return (
    <View style={styles.container}>
      <Text
        style={[styles.title, { color: textColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={APP_HEADER_TITLE_MINIMUM_FONT_SCALE}
      >
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: APP_HEADER_TITLE_MAX_WIDTH,
    paddingHorizontal: APP_HEADER_TITLE_HORIZONTAL_PADDING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    width: '100%',
    textAlign: 'center',
    fontFamily: APP_HEADER_TITLE_FONT_FAMILY,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.2,
  },
});
