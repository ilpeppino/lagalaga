function requireEnv(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(
      `Missing required env var ${name}. Configure EAS env vars for the active build profile.`
    );
  }
  return normalized;
}

function readPublicEnv(name: 'EXPO_PUBLIC_API_URL'): string {
  // Expo inlines only static process.env access (not dynamic process.env[name]).
  const value = process.env.EXPO_PUBLIC_API_URL;
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Configure EAS env vars for the active build profile.`
    );
  }
  return value;
}

function readOptionalPublicEnv(
  name: 'EXPO_PUBLIC_DELETE_ACCOUNT_WEB_URL' | 'EXPO_PUBLIC_CHILD_SAFETY_POLICY_URL'
): string | null {
  const value = name === 'EXPO_PUBLIC_DELETE_ACCOUNT_WEB_URL'
    ? process.env.EXPO_PUBLIC_DELETE_ACCOUNT_WEB_URL
    : process.env.EXPO_PUBLIC_CHILD_SAFETY_POLICY_URL;
  if (!value || !value.trim()) {
    return null;
  }
  return value.trim();
}

function readOptionalPublicBoolean(name: 'EXPO_PUBLIC_ENABLE_COMPETITIVE_DEPTH'): boolean {
  const value = process.env.EXPO_PUBLIC_ENABLE_COMPETITIVE_DEPTH;
  if (!value) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function normalizeBaseUrl(value: string): string {
  // Keep this strict enough to catch misconfiguration in release builds.
  if (!/^https?:\/\//i.test(value)) {
    throw new Error(
      `Invalid EXPO_PUBLIC_API_URL "${value}". Expected an absolute http(s) URL.`
    );
  }
  return value.replace(/\/+$/, '');
}

export const API_URL = normalizeBaseUrl(
  requireEnv('EXPO_PUBLIC_API_URL', readPublicEnv('EXPO_PUBLIC_API_URL'))
);

export const ENABLE_COMPETITIVE_DEPTH = readOptionalPublicBoolean(
  'EXPO_PUBLIC_ENABLE_COMPETITIVE_DEPTH'
);

export const DELETE_ACCOUNT_WEB_URL = readOptionalPublicEnv(
  'EXPO_PUBLIC_DELETE_ACCOUNT_WEB_URL'
) ?? 'https://ilpeppino.github.io/lagalaga/delete-account.html';

export const CHILD_SAFETY_POLICY_URL = readOptionalPublicEnv(
  'EXPO_PUBLIC_CHILD_SAFETY_POLICY_URL'
) ?? 'https://ilpeppino.github.io/lagalaga/child-safety.html';
