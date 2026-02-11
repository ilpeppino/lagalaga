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
