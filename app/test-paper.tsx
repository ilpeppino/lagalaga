import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AnimatedButton,
  Button,
  Card,
  CardActions,
  CardContent,
  CardTitle,
  Surface,
  Text,
  TextInput,
} from '@/components/ui/paper';

export default function TestPaperScreen() {
  const [email, setEmail] = useState('');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineMedium">Paper Primitives Test</Text>

      <Surface style={styles.block} elevation={2}>
        <Text variant="bodyLarge">Surface wrapper</Text>
      </Surface>

      <View style={styles.block}>
        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          variant="outlined"
        />
      </View>

      <Card style={styles.block} mode="outlined">
        <CardTitle title="Card wrapper" subtitle="Using barrel exports" />
        <CardContent>
          <Text variant="bodyMedium">Card content section</Text>
        </CardContent>
        <CardActions>
          <Button title="Action" variant="text" onPress={() => {}} />
        </CardActions>
      </Card>

      <View style={styles.buttonRow}>
        <Button title="Filled" variant="filled" onPress={() => {}} />
        <Button title="Outlined" variant="outlined" onPress={() => {}} />
        <Button title="Tonal" variant="tonal" onPress={() => {}} />
        <AnimatedButton title="Animated Press" variant="elevated" onPress={() => {}} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    padding: 16,
  },
  block: {
    padding: 16,
  },
  buttonRow: {
    gap: 12,
  },
});
