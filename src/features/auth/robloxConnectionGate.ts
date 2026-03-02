export interface AuthGateUser {
  robloxConnected?: boolean;
}

export function shouldRequireRobloxConnection(user: AuthGateUser | null): boolean {
  if (!user) {
    return false;
  }

  return user.robloxConnected !== true;
}

export function getPostLoginRoute(robloxConnected: boolean): '/auth/connect-roblox' | '/sessions' {
  return robloxConnected ? '/sessions' : '/auth/connect-roblox';
}
