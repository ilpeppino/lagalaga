import { OAUTH_STORAGE_KEYS, oauthTransientStorage } from '@/src/lib/oauthTransientStorage';

function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function getOrCreateAuthFlowCorrelationId(): Promise<string> {
  const existing = await oauthTransientStorage.getItem(OAUTH_STORAGE_KEYS.AUTH_FLOW_CORRELATION_ID);
  if (existing?.trim()) {
    return existing;
  }

  const generated = generateCorrelationId();
  await oauthTransientStorage.setItem(OAUTH_STORAGE_KEYS.AUTH_FLOW_CORRELATION_ID, generated);
  return generated;
}

export async function clearAuthFlowCorrelationId(): Promise<void> {
  await oauthTransientStorage.removeItem(OAUTH_STORAGE_KEYS.AUTH_FLOW_CORRELATION_ID);
}

export function redactUserId(userId: string | null | undefined): string | null {
  if (!userId) {
    return null;
  }

  const trimmed = userId.trim();
  if (trimmed.length <= 8) {
    return '***';
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export function summarizeState(state: string | null | undefined): string | null {
  if (!state) {
    return null;
  }
  return `${state.slice(0, 6)}...`;
}
