/**
 * Epic 6: Roblox Deep Linking Service
 *
 * Launches the Roblox app directly to a specific game, with browser fallback
 * if the Roblox app is not installed.
 */

import { Linking, Platform, Alert } from 'react-native';

/**
 * Launch Roblox app to a specific game
 *
 * Primary: Opens roblox://placeId=<placeId> deep link
 * Fallback: Opens canonical_start_url in browser if deep link fails
 *
 * @param placeId - The Roblox place ID
 * @param canonicalStartUrl - The web URL to open as fallback
 */
export async function launchRobloxGame(
  placeId: number,
  canonicalStartUrl: string
): Promise<void> {
  const deepLink = `roblox://placeId=${placeId}`;

  try {
    // Check if Roblox app can handle the deep link
    const canOpen = await Linking.canOpenURL(deepLink);

    if (canOpen) {
      // Launch Roblox app directly
      await Linking.openURL(deepLink);
    } else {
      // Fallback to browser
      await launchInBrowser(canonicalStartUrl);
    }
  } catch (error) {
    console.error('Failed to launch Roblox deep link:', error);
    // Deep link failed, use browser fallback
    await launchInBrowser(canonicalStartUrl);
  }
}

/**
 * Launch Roblox game in browser (fallback method)
 */
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
            console.error('Failed to open browser:', error);
            Alert.alert('Error', 'Failed to open browser');
          }
        },
      },
    ]
  );
}
