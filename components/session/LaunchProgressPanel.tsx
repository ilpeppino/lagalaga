/**
 * LaunchProgressPanel
 *
 * Self-contained guided launch state machine for session participants.
 *
 * Phases:
 *   idle       → "Open in Roblox" CTA
 *   opening    → "Opening Roblox…" spinner (3 s before auto-advance)
 *   checking   → "Checking if you're in…" (polls presence every 10 s, max 3 min)
 *   confirmed  → "You're in! ✓" success
 *   recovery   → "Still joining?" — manual confirm / retry / stuck options
 *   stuck      → "Host has been notified"
 *
 * Resilience:
 *   - Presence fetch failure: retries silently; recovery shown after timeout
 *   - API failures: user-friendly messages, never raw errors
 *   - Component unmount: all timers/intervals cleared
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AnimatedButton as Button } from '@/components/ui/paper';
import { ThemedText } from '@/components/themed-text';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import { launchRobloxGame } from '@/src/services/roblox-launcher';
import { logger } from '@/src/lib/logger';
import { monitoring } from '@/src/lib/monitoring';
import type { SessionDetail } from '@/src/features/sessions/types-v2';

type LaunchPhase =
  | 'idle'
  | 'opening'
  | 'checking'
  | 'confirmed'
  | 'recovery'
  | 'stuck';

const OPENING_DELAY_MS = 3_000;     // Advance from opening → checking after 3 s
const POLL_INTERVAL_MS = 10_000;    // Check presence every 10 s
const POLL_MAX_ATTEMPTS = 18;       // 3 minutes total
const CORRELATION_TAG = 'handoff_launch';

interface Props {
  session: SessionDetail;
  userId: string;
  onConfirmed?: () => void;
  onStuck?: () => void;
}

export function LaunchProgressPanel({ session, userId, onConfirmed, onStuck }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [phase, setPhase] = useState<LaunchPhase>('idle');
  const [actionBusy, setActionBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pollCountRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const openingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchStartRef = useRef<number>(0);

  // ── Clean up on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (openingTimerRef.current) clearTimeout(openingTimerRef.current);
    };
  }, []);

  // ── Presence polling ─────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const confirmInGame = useCallback(async () => {
    stopPolling();
    try {
      await sessionsAPIStoreV2.updateHandoffState(session.id, 'confirmed_in_game');
      const elapsed = Date.now() - launchStartRef.current;
      logger.info(`${CORRELATION_TAG}: confirmed_in_game`, {
        sessionId: session.id,
        elapsedMs: elapsed,
      });
      monitoring.addBreadcrumb({
        category: 'user',
        level: 'info',
        message: 'handoff confirmed_in_game',
        data: { sessionId: session.id, elapsedMs: elapsed },
      });
      setPhase('confirmed');
      onConfirmed?.();
    } catch (err) {
      logger.warn(`${CORRELATION_TAG}: confirm API failed`, {
        error: err instanceof Error ? err.message : String(err),
        sessionId: session.id,
      });
      // Still show confirmed in UI — the important thing is Roblox was opened
      setPhase('confirmed');
      onConfirmed?.();
    }
  }, [session.id, stopPolling, onConfirmed]);

  const startPresencePolling = useCallback(() => {
    pollCountRef.current = 0;
    setPhase('checking');
    logger.info(`${CORRELATION_TAG}: presence polling started`, { sessionId: session.id });

    pollTimerRef.current = setInterval(async () => {
      pollCountRef.current += 1;

      if (pollCountRef.current > POLL_MAX_ATTEMPTS) {
        stopPolling();
        logger.info(`${CORRELATION_TAG}: polling timed out`, {
          sessionId: session.id,
          attempts: pollCountRef.current,
        });
        monitoring.addBreadcrumb({
          category: 'info',
          level: 'warning',
          message: 'handoff polling timed out — showing recovery',
          data: { sessionId: session.id },
        });
        setPhase('recovery');
        return;
      }

      try {
        const presence = await sessionsAPIStoreV2.getRobloxPresence([userId]);
        const status = presence.statuses?.[0]?.status;
        if (presence.available && status === 'in_game') {
          logger.info(`${CORRELATION_TAG}: presence confirmed in_game`, {
            sessionId: session.id,
            attempt: pollCountRef.current,
          });
          await confirmInGame();
        }
      } catch {
        // Best-effort — keep polling silently
      }
    }, POLL_INTERVAL_MS);
  }, [session.id, userId, stopPolling, confirmInGame]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleOpenRoblox = useCallback(async () => {
    setErrorMsg(null);
    setActionBusy(true);
    launchStartRef.current = Date.now();

    logger.info(`${CORRELATION_TAG}: launch CTA tapped`, { sessionId: session.id });
    monitoring.addBreadcrumb({
      category: 'user',
      level: 'info',
      message: 'handoff launch tapped',
      data: { sessionId: session.id },
    });

    // Fire state update — best effort, don't block UI
    sessionsAPIStoreV2.updateHandoffState(session.id, 'opened_roblox').catch((err) => {
      logger.warn(`${CORRELATION_TAG}: opened_roblox state update failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    setPhase('opening');

    try {
      logger.info(`${CORRELATION_TAG}: launching Roblox deep link`, {
        placeId: session.game.placeId,
      });
      await launchRobloxGame(session.game.placeId, session.game.canonicalStartUrl);
    } catch (err) {
      logger.warn(`${CORRELATION_TAG}: Roblox launch failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
      setErrorMsg("Couldn't open Roblox. Try again or open it manually.");
    } finally {
      setActionBusy(false);
    }

    // After OPENING_DELAY_MS, advance to checking
    openingTimerRef.current = setTimeout(() => {
      startPresencePolling();
    }, OPENING_DELAY_MS);
  }, [session, startPresencePolling]);

  const handleManualConfirm = useCallback(async () => {
    setActionBusy(true);
    stopPolling();
    logger.info(`${CORRELATION_TAG}: manual confirm tapped`, { sessionId: session.id });
    try {
      await confirmInGame();
    } finally {
      setActionBusy(false);
    }
  }, [confirmInGame, stopPolling, session.id]);

  const handleRetry = useCallback(async () => {
    setErrorMsg(null);
    stopPolling();
    pollCountRef.current = 0;
    await handleOpenRoblox();
  }, [handleOpenRoblox, stopPolling]);

  const handleStuck = useCallback(async () => {
    setActionBusy(true);
    stopPolling();
    logger.info(`${CORRELATION_TAG}: user marked stuck`, { sessionId: session.id });
    try {
      await sessionsAPIStoreV2.updateHandoffState(session.id, 'stuck');
      setPhase('stuck');
      onStuck?.();
    } catch {
      setErrorMsg("Couldn't update your status. The host can still see you in the list.");
      setPhase('stuck');
      onStuck?.();
    } finally {
      setActionBusy(false);
    }
  }, [session.id, stopPolling, onStuck]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.panel, { backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' }]}>
      {phase === 'idle' && (
        <>
          <Button
            title="Open in Roblox"
            variant="filled"
            buttonColor="#007AFF"
            enableHaptics
            style={styles.primaryBtn}
            contentStyle={styles.primaryBtnContent}
            labelStyle={styles.primaryBtnLabel}
            onPress={handleOpenRoblox}
            loading={actionBusy}
            disabled={actionBusy}
          />
          {errorMsg && (
            <ThemedText type="bodySmall" style={styles.errorText}>
              {errorMsg}
            </ThemedText>
          )}
        </>
      )}

      {phase === 'opening' && (
        <View style={styles.phaseRow}>
          <ActivityIndicator size="small" color="#FF9500" />
          <View style={styles.phaseText}>
            <ThemedText type="bodyLarge" style={{ color: '#FF9500', fontWeight: '600' }}>
              Opening Roblox…
            </ThemedText>
            <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
              Switching you to Roblox
            </ThemedText>
          </View>
        </View>
      )}

      {phase === 'checking' && (
        <View style={styles.phaseRow}>
          <ActivityIndicator size="small" color="#007AFF" />
          <View style={styles.phaseText}>
            <ThemedText type="bodyLarge" style={{ color: '#007AFF', fontWeight: '600' }}>
              Checking if you're in…
            </ThemedText>
            <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
              This usually takes a few seconds
            </ThemedText>
          </View>
        </View>
      )}

      {phase === 'confirmed' && (
        <View style={styles.phaseRow}>
          <MaterialIcons name="check-circle" size={28} color="#34C759" />
          <View style={styles.phaseText}>
            <ThemedText type="bodyLarge" style={{ color: '#34C759', fontWeight: '700' }}>
              You're in!
            </ThemedText>
            <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
              Your squad can see you're in game
            </ThemedText>
          </View>
        </View>
      )}

      {phase === 'recovery' && (
        <View style={styles.recoveryWrap}>
          <ThemedText type="titleMedium" style={styles.recoveryTitle}>
            Still joining?
          </ThemedText>
          <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366" style={styles.recoveryHint}>
            Roblox can take a moment. Tap when you're in, or try launching again.
          </ThemedText>
          <View style={styles.recoveryActions}>
            <Button
              title="I'm in"
              variant="filled"
              buttonColor="#34C759"
              style={styles.recoveryBtn}
              contentStyle={styles.recoveryBtnContent}
              onPress={handleManualConfirm}
              loading={actionBusy}
              disabled={actionBusy}
              enableHaptics
            />
            <Button
              title="Try again"
              variant="outlined"
              textColor="#007AFF"
              style={styles.recoveryBtn}
              contentStyle={styles.recoveryBtnContent}
              onPress={handleRetry}
              disabled={actionBusy}
            />
          </View>
          <Button
            title="I'm having trouble"
            variant="text"
            textColor="#FF6B00"
            style={styles.stuckBtn}
            onPress={handleStuck}
            disabled={actionBusy}
          />
          {errorMsg && (
            <ThemedText type="bodySmall" style={styles.errorText}>
              {errorMsg}
            </ThemedText>
          )}
        </View>
      )}

      {phase === 'stuck' && (
        <View style={styles.phaseRow}>
          <MaterialIcons name="error-outline" size={24} color="#FF6B00" />
          <View style={styles.phaseText}>
            <ThemedText type="bodyLarge" style={{ color: '#FF6B00', fontWeight: '600' }}>
              Host has been notified
            </ThemedText>
            <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
              They can see you need help
            </ThemedText>
          </View>
        </View>
      )}

      {/* Manual override when in opening/checking — allow early confirm */}
      {(phase === 'opening' || phase === 'checking') && (
        <Button
          title="I'm already in"
          variant="text"
          textColor="#007AFF"
          style={styles.earlyConfirmBtn}
          onPress={handleManualConfirm}
          disabled={actionBusy}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  primaryBtn: {
    borderRadius: 14,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  primaryBtnContent: { minHeight: 56 },
  primaryBtnLabel: { fontSize: 18, fontWeight: '700', color: '#fff' },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 4,
  },
  phaseText: {
    flex: 1,
    gap: 2,
  },
  recoveryWrap: {
    gap: 10,
  },
  recoveryTitle: {
    fontWeight: '700',
  },
  recoveryHint: {
    lineHeight: 18,
  },
  recoveryActions: {
    flexDirection: 'row',
    gap: 10,
  },
  recoveryBtn: {
    flex: 1,
    borderRadius: 12,
  },
  recoveryBtnContent: { minHeight: 48 },
  stuckBtn: {
    alignSelf: 'flex-start',
  },
  earlyConfirmBtn: {
    alignSelf: 'flex-start',
    marginTop: -4,
  },
  errorText: {
    color: '#FF3B30',
    lineHeight: 18,
  },
});
