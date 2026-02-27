export function shouldRedirectToConnectRoblox(pathname: string | null | undefined): boolean {
  if (!pathname) {
    return true;
  }

  return pathname !== '/me' && pathname !== '/roblox' && pathname !== '/auth/roblox';
}
