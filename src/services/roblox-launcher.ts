/**
 * Epic 6: Roblox Deep Linking Service
 *
 * Launches the Roblox app directly to a specific game, with browser fallback
 * if the Roblox app is not installed.
 */

import { Linking, Alert } from 'react-native';
import { logger } from '../lib/logger';

export async function launchRobloxGame(
  placeId: number,
  canonicalStartUrl: string
): Promise<void> {
  // Some Roblox share links don't include a placeId. In that case, opening the
  // canonical URL is the best we can do (Roblox app resolves it if installed).
  if (!placeId || placeId <= 0) {
    try {
      await Linking.openURL(canonicalStartUrl);
      return;
    } catch (error) {
      logger.error('Failed to open Roblox URL', {
        url: canonicalStartUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      Alert.alert('Error', 'Failed to open Roblox');
      return;
    }
  }

  const deepLink = `roblox://placeId=${placeId}`;

  try {
    const canOpen = await Linking.canOpenURL(deepLink);

    if (canOpen) {
      await Linking.openURL(deepLink);
    } else {
      await launchInBrowser(canonicalStartUrl);
    }
  } catch (error) {
    logger.warn('Failed to launch Roblox deep link, falling back to browser', {
      placeId,
      error: error instanceof Error ? error.message : String(error),
    });
    await launchInBrowser(canonicalStartUrl);
  }
}

async function launchInBrowser(url: string): Promise<void> {
  Alert.alert(
    'Opening in Browser',
    'The Roblox app is not installed. Opening in your browser instead.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open',
        onPress: async () => {
          try {
            await Linking.openURL(url);
          } catch (error) {
            logger.error('Failed to open browser', {
              url,
              error: error instanceof Error ? error.message : String(error),
            });
            Alert.alert('Error', 'Failed to open browser');
          }
        },
      },
    ]
  );
}
