import { shouldRedirectToConnectRoblox } from './robloxGate';

export function handleRobloxNotConnectedError(
  errorCode: string,
  pathname: string | null | undefined,
  navigate: (path: string) => void
): boolean {
  if (errorCode !== 'ROBLOX_NOT_CONNECTED') {
    return false;
  }

  if (!shouldRedirectToConnectRoblox(pathname)) {
    return false;
  }

  navigate('/me');
  return true;
}
