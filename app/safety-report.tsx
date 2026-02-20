import { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AnimatedButton as Button } from '@/components/ui/paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { apiClient, type ReportCategory, type ReportTargetType } from '@/src/lib/api';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { CHILD_SAFETY_POLICY_URL } from '@/src/lib/runtimeConfig';
import { useAuth } from '@/src/features/auth/useAuth';

type Step = 1 | 2 | 3;

const categoryOptions: { value: ReportCategory; label: string }[] = [
  { value: 'CSAM', label: 'Child sexual abuse material (CSAM)' },
  { value: 'GROOMING_OR_SEXUAL_EXPLOITATION', label: 'Grooming or sexual exploitation' },
  { value: 'HARASSMENT_OR_ABUSIVE_BEHAVIOR', label: 'Harassment / abusive behavior' },
  { value: 'IMPERSONATION', label: 'Impersonation' },
  { value: 'OTHER', label: 'Other' },
];

const targetTypeOptions: { value: ReportTargetType; label: string }[] = [
  { value: 'USER', label: 'Another user' },
  { value: 'SESSION', label: 'A session' },
  { value: 'GENERAL', label: 'General safety concern' },
];

function parseTargetType(value?: string): ReportTargetType {
  if (value === 'USER' || value === 'SESSION' || value === 'GENERAL') {
    return value;
  }
  return 'GENERAL';
}

export default function SafetyReportScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { user } = useAuth();
  const { handleError } = useErrorHandler();
  const params = useLocalSearchParams<{
    targetType?: string;
    targetUserId?: string;
    targetSessionId?: string;
  }>();

  const [step, setStep] = useState<Step>(1);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState('');
  const [targetType, setTargetType] = useState<ReportTargetType>(parseTargetType(params.targetType));
  const [targetUserId, setTargetUserId] = useState(params.targetUserId ?? '');
  const [targetSessionId, setTargetSessionId] = useState(params.targetSessionId ?? '');
  const [ticketId, setTicketId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const backgroundColor = Colors[colorScheme ?? 'light'].background;
  const textColor = Colors[colorScheme ?? 'light'].text;
  const tintColor = Colors[colorScheme ?? 'light'].tint;
  const cardColor = colorScheme === 'dark' ? '#1c1c1e' : '#f2f2f7';
  const inputBg = colorScheme === 'dark' ? '#101012' : '#ffffff';
  const borderColor = colorScheme === 'dark' ? '#313136' : '#d5d7de';
  const secondaryTextColor = colorScheme === 'dark' ? '#b3b3b8' : '#5f6368';

  const isDetailsValid = useMemo(() => {
    if (!description.trim()) return false;
    if (targetType === 'USER') return targetUserId.trim().length > 0;
    if (targetType === 'SESSION') return targetSessionId.trim().length > 0;
    return true;
  }, [description, targetType, targetUserId, targetSessionId]);

  const handleSubmit = async () => {
    if (!category || !isDetailsValid) return;
    if (targetType === 'USER' && targetUserId.trim() === user?.id) {
      Alert.alert('Invalid report', 'You cannot report yourself.');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await apiClient.reports.create({
        category,
        description: description.trim(),
        targetType,
        targetUserId: targetType === 'USER' ? targetUserId.trim() : undefined,
        targetSessionId: targetType === 'SESSION' ? targetSessionId.trim() : undefined,
      });
      setTicketId(response.data.ticketId);
      setStep(3);
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to submit report' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPolicyPage = async () => {
    try {
      await Linking.openURL(CHILD_SAFETY_POLICY_URL);
    } catch {
      Alert.alert('Unable to open link', 'Please try again later.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Stack.Screen options={{ title: 'Safety & Report', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.bannerText, { color: textColor }]}>
          LagaLaga has zero tolerance for child sexual abuse and exploitation.
        </Text>

        {step === 1 ? (
          <View style={[styles.card, { backgroundColor: cardColor }]}>
            <Text style={[styles.heading, { color: textColor }]}>Report category</Text>
            {categoryOptions.map((option) => {
              const isSelected = category === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionRow,
                    { borderColor },
                    isSelected && { borderColor: tintColor, backgroundColor: `${tintColor}22` },
                  ]}
                  onPress={() => setCategory(option.value)}
                >
                  <Text style={[styles.optionText, { color: textColor }]}>{option.label}</Text>
                  {isSelected ? <IconSymbol name="checkmark.circle.fill" size={20} color={tintColor} /> : null}
                </TouchableOpacity>
              );
            })}

            <Button
              title="Continue"
              variant="filled"
              buttonColor={tintColor}
              textColor="#fff"
              style={styles.primaryActionButton}
              contentStyle={styles.primaryActionButtonContent}
              labelStyle={styles.primaryActionButtonLabel}
              enableHaptics
              onPress={() => setStep(2)}
              disabled={!category}
            />
          </View>
        ) : null}

        {step === 2 ? (
          <View style={[styles.card, { backgroundColor: cardColor }]}>
            <Text style={[styles.heading, { color: textColor }]}>Details</Text>

            <Text style={[styles.subheading, { color: secondaryTextColor }]}>What are you reporting?</Text>
            <View style={styles.targetTypeRow}>
              {targetTypeOptions.map((option) => {
                const selected = targetType === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.targetChip,
                      { borderColor },
                      selected && { borderColor: tintColor, backgroundColor: `${tintColor}1f` },
                    ]}
                    onPress={() => setTargetType(option.value)}
                  >
                    <Text style={[styles.targetChipText, { color: selected ? tintColor : textColor }]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {targetType === 'USER' ? (
              <TextInput
                style={[
                  styles.singleLineInput,
                  { backgroundColor: inputBg, borderColor, color: textColor },
                ]}
                value={targetUserId}
                onChangeText={setTargetUserId}
                placeholder="Reported user ID"
                placeholderTextColor={secondaryTextColor}
                autoCapitalize="none"
              />
            ) : null}

            {targetType === 'SESSION' ? (
              <TextInput
                style={[
                  styles.singleLineInput,
                  { backgroundColor: inputBg, borderColor, color: textColor },
                ]}
                value={targetSessionId}
                onChangeText={setTargetSessionId}
                placeholder="Reported session ID"
                placeholderTextColor={secondaryTextColor}
                autoCapitalize="none"
              />
            ) : null}

            <TextInput
              style={[
                styles.detailsInput,
                { backgroundColor: inputBg, borderColor, color: textColor },
              ]}
              multiline
              textAlignVertical="top"
              value={description}
              onChangeText={setDescription}
              placeholder="Describe what happened. Include usernames, session context, and timing."
              placeholderTextColor={secondaryTextColor}
              maxLength={5000}
            />

            <TouchableOpacity style={styles.linkRow} onPress={openPolicyPage}>
              <IconSymbol name="link" size={16} color={tintColor} />
              <Text style={[styles.linkText, { color: tintColor }]}>View Child Safety policy</Text>
            </TouchableOpacity>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.secondaryButton, { borderColor }]} onPress={() => setStep(1)}>
                <Text style={[styles.secondaryButtonText, { color: textColor }]}>Back</Text>
              </TouchableOpacity>
              <Button
                title="Submit report"
                variant="filled"
                buttonColor={tintColor}
                textColor="#fff"
                style={styles.primaryButton}
                contentStyle={styles.primaryActionButtonContent}
                labelStyle={styles.primaryActionButtonLabel}
                enableHaptics
                onPress={handleSubmit}
                disabled={!isDetailsValid || isSubmitting}
                loading={isSubmitting}
              />
            </View>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={[styles.card, { backgroundColor: cardColor }]}>
            <Text style={[styles.heading, { color: textColor }]}>Report submitted</Text>
            <Text style={[styles.confirmationText, { color: secondaryTextColor }]}>
              Thank you for helping keep the community safe. In severe cases, we may contact law enforcement or child protection authorities.
            </Text>
            <Text style={[styles.ticketLabel, { color: textColor }]}>Reference ID</Text>
            <Text style={[styles.ticketId, { color: textColor }]}>{ticketId}</Text>

            <Button
              title="Done"
              variant="filled"
              buttonColor={tintColor}
              textColor="#fff"
              style={styles.primaryActionButton}
              contentStyle={styles.primaryActionButtonContent}
              labelStyle={styles.primaryActionButtonLabel}
              enableHaptics
              onPress={() => router.back()}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  bannerText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  card: {
    borderRadius: 12,
    padding: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  subheading: {
    fontSize: 13,
    marginBottom: 8,
  },
  optionRow: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionText: {
    fontSize: 14,
    flex: 1,
  },
  primaryActionButton: {
    borderRadius: 10,
    marginTop: 12,
  },
  primaryActionButtonContent: {
    minHeight: 48,
  },
  primaryActionButtonLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  targetTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  targetChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  targetChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  singleLineInput: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  detailsInput: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 140,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 2,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 2,
    borderRadius: 10,
  },
  confirmationText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  ticketLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  ticketId: {
    fontSize: 14,
    fontWeight: '700',
  },
});
