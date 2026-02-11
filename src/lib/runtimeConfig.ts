function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
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

export const API_URL = normalizeBaseUrl(requireEnv('EXPO_PUBLIC_API_URL'));
