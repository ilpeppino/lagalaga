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

export type SyncFeedbackState = 'idle' | 'success' | 'error';

export function resolveConnectorDotColor(state: {
  syncing: boolean;
  syncError: boolean;
}): string {
  if (state.syncError) return '#ff3b30';
  if (state.syncing) return '#0a7ea4';
  return 'rgba(142,142,147,0.38)';
}

export function resolveSyncIconName(state: {
  syncing: boolean;
  feedback: SyncFeedbackState;
}): 'arrow.clockwise' | 'checkmark' {
  if (!state.syncing && state.feedback === 'success') return 'checkmark';
  return 'arrow.clockwise';
}

export function resolveSyncA11yLabel(state: {
  connected: boolean;
  syncing: boolean;
  feedback: SyncFeedbackState;
}): string {
  if (!state.connected) return 'Roblox not connected';
  if (state.syncing) return 'Syncing Roblox data';
  if (state.feedback === 'success') return 'Roblox sync complete';
  if (state.feedback === 'error') return 'Roblox sync failed';
  return 'Sync Roblox data';
}
