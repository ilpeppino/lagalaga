import * as WebBrowser from 'expo-web-browser';

const DEFAULT_ROBLOX_REDIRECT_URI = 'lagalaga://auth/roblox';

export async function openRobloxAuthSession(authorizationUrl: string): Promise<void> {
  const returnUrl = process.env.EXPO_PUBLIC_ROBLOX_REDIRECT_URI?.trim() || DEFAULT_ROBLOX_REDIRECT_URI;
  await WebBrowser.openAuthSessionAsync(authorizationUrl, returnUrl);
}
