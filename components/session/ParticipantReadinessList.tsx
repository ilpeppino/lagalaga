/**
 * ParticipantReadinessList
 *
 * Squad readiness panel — shows host + all participants with their
 * launch states mapped to human-readable labels.
 *
 * Resilience: if no participants, shows host-only row.
 * If handoff states unavailable, degrades to basic participant list.
 */

import { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ParticipantReadinessRow } from './ParticipantReadinessRow';
import { getReadinessSummary } from '@/src/lib/handoffStatePresenter';
import type { SessionDetail } from '@/src/features/sessions/types-v2';

const COLLAPSED_LIMIT = 4;

interface Props {
  session: SessionDetail;
  /** Current user's app ID — their own row gets a subtle highlight */
  currentUserId?: string;
  defaultExpanded?: boolean;
}

export function ParticipantReadinessList({
  session,
  currentUserId,
  defaultExpanded = false,
}: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [expanded, setExpanded] = useState(defaultExpanded);

  const { participants, hostId, host } = session;
  const activeParticipants = participants.filter(
    (p) => p.state !== 'left' && p.state !== 'kicked'
  );

  const summary = getReadinessSummary(activeParticipants);

  // Compose display rows: host first, then other participants
  const hostName =
    host?.robloxDisplayName ||
    host?.robloxUsername ||
    'Host';

  const otherParticipants = activeParticipants.filter((p) => p.userId !== hostId);

  const isCollapsible = otherParticipants.length >= COLLAPSED_LIMIT;
  const visibleOthers =
    isCollapsible && !expanded
      ? otherParticipants.slice(0, COLLAPSED_LIMIT - 1)
      : otherParticipants;

  const hostParticipant = activeParticipants.find((p) => p.userId === hostId);

  return (
    <View style={[styles.card, { backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' }]}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="labelSmall" lightColor="#8E8E93" darkColor="#636366" style={styles.title}>
          SQUAD
        </ThemedText>
        <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
          {summary.primaryLabel}
        </ThemedText>
      </View>

      {/* Stuck warning */}
      {summary.stuck > 0 && (
        <View style={[styles.stuckBanner, { backgroundColor: isDark ? '#2a1a00' : '#fff3e0' }]}>
          <MaterialIcons name="error-outline" size={14} color="#FF6B00" />
          <ThemedText type="bodySmall" style={{ color: '#FF6B00' }}>
            {summary.stuck === 1
              ? '1 player needs help'
              : `${summary.stuck} players need help`}
          </ThemedText>
        </View>
      )}

      {/* Host row */}
      <ParticipantReadinessRow
        displayName={hostName}
        isHost
        handoffState={hostParticipant?.handoffState}
        participantState={hostParticipant?.state ?? 'joined'}
      />

      {/* Divider */}
      {visibleOthers.length > 0 && (
        <View style={[styles.divider, { backgroundColor: isDark ? '#2a2a2a' : '#e0e0e0' }]} />
      )}

      {/* Other participants */}
      {visibleOthers.map((p) => (
        <ParticipantReadinessRow
          key={p.userId}
          displayName={p.displayName || p.userId.slice(0, 8)}
          isHost={false}
          handoffState={p.handoffState}
          participantState={p.state}
        />
      ))}

      {/* Show more / less toggle */}
      {isCollapsible && (
        <Pressable
          style={styles.toggleBtn}
          onPress={() => setExpanded((v) => !v)}
        >
          <ThemedText type="bodySmall" style={{ color: '#007AFF' }}>
            {expanded
              ? 'Show less'
              : `+${otherParticipants.length - (COLLAPSED_LIMIT - 1)} more`}
          </ThemedText>
          <MaterialIcons
            name={expanded ? 'expand-less' : 'expand-more'}
            size={16}
            color="#007AFF"
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  stuckBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 14,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
  },
});
