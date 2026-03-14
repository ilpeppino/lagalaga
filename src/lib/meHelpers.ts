/**
 * Pure helper functions extracted from the Me screen for testability.
 */

/**
 * Returns the avatar halo border color based on Roblox connection and sync state.
 *
 * - Syncing    → blue   (active operation in progress)
 * - Sync error → red    (brief post-failure flash, ~2 s)
 * - Connected  → green  (Roblox account linked and up to date)
 * - Disconnected → grey (no Roblox account connected)
 */
export function resolveHaloColor(state: {
  connected: boolean;
  syncing: boolean;
  syncError?: boolean;
}): string {
  if (state.syncing) return '#0a7ea4';
  if (state.syncError) return '#ff3b30';
  if (state.connected) return '#34c759';
  return '#8e8e93';
}
