/**
 * Invite History — local AsyncStorage cache
 *
 * Records which Roblox friends the local user has invited in past sessions.
 * Used as a lightweight "played with you" signal for smart invite ranking.
 *
 * No server round-trip required.
 * Capped at 100 entries to stay small.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/src/lib/logger';

const STORAGE_KEY_PREFIX = 'lagalaga:invite_history:';
const MAX_ENTRIES = 100;

interface InviteHistoryPayload {
  invitedIds: number[];
  updatedAt: string;
}

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

/**
 * Record that a user invited a Roblox friend.
 * Prepends to the list, deduplicates, and caps at MAX_ENTRIES.
 */
export async function recordInvite(userId: string, robloxFriendId: number): Promise<void> {
  try {
    const existing = await getRecentlyInvitedIds(userId);
    const deduped = [robloxFriendId, ...existing.filter((id) => id !== robloxFriendId)];
    const payload: InviteHistoryPayload = {
      invitedIds: deduped.slice(0, MAX_ENTRIES),
      updatedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(payload));
  } catch (err) {
    // Non-critical — log and continue
    logger.warn('invite_history: failed to record invite', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Returns the list of recently invited Roblox user IDs for this user,
 * most-recent first. Returns [] on any failure.
 */
export async function getRecentlyInvitedIds(userId: string): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const payload = JSON.parse(raw) as InviteHistoryPayload;
    return Array.isArray(payload.invitedIds) ? payload.invitedIds : [];
  } catch {
    return [];
  }
}
