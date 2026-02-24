import { useEffect, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Switch } from 'react-native-paper';
import { ThemedText } from '@/components/themed-text';
import { AnimatedButton as Button } from '@/components/ui/paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createSessionPalette, spacing } from './createSessionTokens';

interface AdvancedOptionsSectionProps {
  isRanked: boolean;
  scheduledStart: Date | null;
  isCreating: boolean;
  onChangeRanked: (value: boolean) => void;
  onChangeScheduledStart: (value: Date | null) => void;
}

export function AdvancedOptionsSection({
  isRanked,
  scheduledStart,
  isCreating,
  onChangeRanked,
  onChangeScheduledStart,
}: AdvancedOptionsSectionProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const palette = isDark ? createSessionPalette.dark : createSessionPalette.light;
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    setIsExpanded((current) => !current);
  };

  const handleDateChange = (_event: unknown, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      onChangeScheduledStart(selectedDate);
    }
  };

  const openAndroidDateTimePicker = () => {
    const base = scheduledStart ?? new Date();
    DateTimePickerAndroid.open({
      value: base,
      mode: 'date',
      is24Hour: true,
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) return;

        const withDate = new Date(base);
        withDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());

        DateTimePickerAndroid.open({
          value: withDate,
          mode: 'time',
          is24Hour: true,
          onChange: (timeEvent, time) => {
            if (timeEvent.type !== 'set' || !time) return;
            const final = new Date(withDate);
            final.setHours(time.getHours(), time.getMinutes(), 0, 0);
            onChangeScheduledStart(final);
          },
        });
      },
    });
  };

  return (
    <View>
      <Pressable
        style={styles.headerButton}
        onPress={toggleExpanded}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
      >
        <ThemedText type="titleSmall" lightColor={palette.textTertiary} darkColor={palette.textTertiary} style={styles.sectionLabel}>
          More options
        </ThemedText>
        <MaterialIcons
          name={isExpanded ? 'expand-less' : 'expand-more'}
          size={20}
          color={palette.textSecondary}
        />
      </Pressable>

      {isExpanded && (
        <View style={[styles.body, { backgroundColor: palette.surface }]}> 
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <ThemedText type="bodyLarge" lightColor={palette.textPrimary} darkColor={palette.textPrimary}>
                Ranked session
              </ThemedText>
              <ThemedText type="bodySmall" lightColor={palette.textSecondary} darkColor={palette.textSecondary}>
                Ranked sessions affect rating and are always public.
              </ThemedText>
            </View>
            <Switch value={isRanked} onValueChange={onChangeRanked} disabled={isCreating} />
          </View>

          <View style={styles.scheduleSection}>
            <ThemedText type="titleSmall" lightColor={palette.textTertiary} darkColor={palette.textTertiary} style={styles.scheduleLabel}>
              Schedule
            </ThemedText>
            <Pressable
              style={[styles.scheduleRow, { backgroundColor: palette.surfaceRaised }]}
              onPress={() => {
                if (Platform.OS === 'android') {
                  openAndroidDateTimePicker();
                } else {
                  setShowDatePicker(true);
                }
              }}
              disabled={isCreating}
            >
              <View style={styles.scheduleLeft}>
                <MaterialIcons name="calendar-today" size={16} color={palette.textSecondary} />
                <ThemedText type="bodyLarge" lightColor={palette.textPrimary} darkColor={palette.textPrimary} numberOfLines={1}>
                  {scheduledStart ? scheduledStart.toLocaleString() : 'Set start time'}
                </ThemedText>
              </View>
              <MaterialIcons name="chevron-right" size={18} color={palette.textSecondary} />
            </Pressable>
            {scheduledStart && (
              <Button
                title="Clear"
                variant="text"
                style={styles.clearButton}
                textColor={palette.accent}
                onPress={() => onChangeScheduledStart(null)}
              />
            )}
          </View>
        </View>
      )}

      {showDatePicker && (
        <DateTimePicker
          value={scheduledStart || new Date()}
          mode="datetime"
          display="default"
          onChange={handleDateChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  body: {
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  scheduleSection: {
    gap: spacing.sm,
  },
  scheduleLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  scheduleRow: {
    minHeight: 50,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scheduleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    paddingRight: spacing.sm,
  },
  clearButton: {
    alignSelf: 'flex-start',
    marginLeft: -spacing.sm,
  },
});
