import type { ApiError } from '@/src/lib/errors';

export interface AccountLinkConflictResolution {
  handled: boolean;
  title: string;
  message: string;
  shouldNavigateToSignIn: boolean;
  shouldStoreTokens: boolean;
}

export function resolveAccountLinkConflict(error: unknown, platform: 'roblox' | 'google' | 'apple'): AccountLinkConflictResolution {
  const apiError = error as ApiError | undefined;
  if (!apiError || (apiError.code !== 'ACCOUNT_LINK_CONFLICT' && apiError.code !== 'CONFLICT_ACCOUNT_PROVIDER')) {
    return {
      handled: false,
      title: '',
      message: '',
      shouldNavigateToSignIn: false,
      shouldStoreTokens: true,
    };
  }

  const platformLabel = platform === 'roblox' ? 'Roblox' : platform === 'google' ? 'Google' : 'Apple';
  return {
    handled: true,
    title: 'Account already linked',
    message: `This ${platformLabel} account is already linked to another LagaLaga account.`,
    shouldNavigateToSignIn: true,
    shouldStoreTokens: false,
  };
}
