/**
 * Smart Invite Suggestions — ranking logic
 *
 * Ranks Roblox friends as invite candidates using available signals:
 *   1. Online now (presence type 1)
 *   2. In Roblox / in-game (presence type 2)
 *   3. In Studio (presence type 3)
 *   4. Recently invited (local history proxy for "played with you")
 *   5. Remaining friends
 *
 * Pure function — no side-effects, no API calls.
 */

import type { RobloxFriend, RobloxFriendPresence } from './types-v2';

export type SuggestionReason =
  | 'online_now'
  | 'in_roblox'
  | 'played_with_you'
  | 'friend';

export interface SuggestedFriend {
  friend: RobloxFriend;
  score: number;
  reason: SuggestionReason;
  /** Human-readable hint shown under the avatar */
  reasonLabel: string;
}

const SCORE = {
  ONLINE: 100,
  IN_GAME: 80,
  IN_STUDIO: 60,
  RECENTLY_INVITED: 40, // additive bonus on top of presence score
  BASE: 10,
} as const;

function presenceScore(presenceType: number | undefined): {
  score: number;
  reason: SuggestionReason;
  reasonLabel: string;
} {
  switch (presenceType) {
    case 1:
      return { score: SCORE.ONLINE, reason: 'online_now', reasonLabel: 'Online now' };
    case 2:
      return { score: SCORE.IN_GAME, reason: 'in_roblox', reasonLabel: 'In Roblox' };
    case 3:
      return { score: SCORE.IN_STUDIO, reason: 'in_roblox', reasonLabel: 'In Studio' };
    default:
      return { score: SCORE.BASE, reason: 'friend', reasonLabel: 'Friend' };
  }
}

export interface RankSuggestionsParams {
  friends: RobloxFriend[];
  presenceMap: Map<number, RobloxFriendPresence>;
  /** Roblox user IDs recently invited by the host (local history) */
  recentlyInvitedIds: number[];
  /** Roblox user IDs to exclude entirely (already in session, host) */
  excludeIds: number[];
  limit?: number;
}

export function rankInviteSuggestions({
  friends,
  presenceMap,
  recentlyInvitedIds,
  excludeIds,
  limit = 8,
}: RankSuggestionsParams): SuggestedFriend[] {
  const excludeSet = new Set(excludeIds);
  const recentSet = new Set(recentlyInvitedIds);

  const scored = friends
    .filter((f) => !excludeSet.has(f.id))
    .map((friend): SuggestedFriend => {
      const presence = presenceMap.get(friend.id);
      const { score: baseScore, reason: baseReason, reasonLabel: baseLabel } =
        presenceScore(presence?.userPresenceType);

      const isRecent = recentSet.has(friend.id);
      const totalScore = baseScore + (isRecent ? SCORE.RECENTLY_INVITED : 0);

      // "Played with you" overrides label only when offline (more informative than "Friend")
      const reason: SuggestionReason =
        isRecent && baseReason === 'friend' ? 'played_with_you' : baseReason;
      const reasonLabel =
        isRecent && baseReason === 'friend' ? 'Played with you' : baseLabel;

      return { friend, score: totalScore, reason, reasonLabel };
    });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}
