import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Favorite {
  id: string;
  name: string;
  url?: string;
  thumbnailUrl?: string;
}

export interface FavoritesCachePayload {
  favorites: Favorite[];
  etag: string;
  cachedAt: string;
}

const memoryStore = new Map<string, FavoritesCachePayload>();
const listenersByUser = new Map<string, Set<(payload: FavoritesCachePayload | null) => void>>();

export function buildKeys(userId: string): { dataKey: string; etagKey: string; cachedAtKey: string } {
  return {
    dataKey: `favorites:${userId}:data`,
    etagKey: `favorites:${userId}:etag`,
    cachedAtKey: `favorites:${userId}:cachedAt`,
  };
}

export async function loadCachedFavorites(userId: string): Promise<FavoritesCachePayload | null> {
  if (!userId) {
    return null;
  }

  const memoryValue = memoryStore.get(userId);
  if (memoryValue) {
    return memoryValue;
  }

  const { dataKey, etagKey, cachedAtKey } = buildKeys(userId);

  try {
    const [favoritesJson, etag, cachedAt] = await Promise.all([
      AsyncStorage.getItem(dataKey),
      AsyncStorage.getItem(etagKey),
      AsyncStorage.getItem(cachedAtKey),
    ]);

    if (!favoritesJson || !etag || !cachedAt) {
      return null;
    }

    const parsed = JSON.parse(favoritesJson) as Favorite[];
    const payload: FavoritesCachePayload = {
      favorites: Array.isArray(parsed) ? parsed : [],
      etag,
      cachedAt,
    };

    memoryStore.set(userId, payload);
    return payload;
  } catch {
    return null;
  }
}

export async function saveCachedFavorites(userId: string, payload: FavoritesCachePayload): Promise<void> {
  if (!userId) {
    return;
  }

  memoryStore.set(userId, payload);
  notifyListeners(userId, payload);

  const { dataKey, etagKey, cachedAtKey } = buildKeys(userId);
  try {
    await Promise.all([
      AsyncStorage.setItem(dataKey, JSON.stringify(payload.favorites)),
      AsyncStorage.setItem(etagKey, payload.etag),
      AsyncStorage.setItem(cachedAtKey, payload.cachedAt),
    ]);
  } catch {
    // No-op: keep in-memory cache if persistent storage is unavailable.
  }
}

export async function clearCachedFavorites(userId: string): Promise<void> {
  if (!userId) {
    return;
  }

  memoryStore.delete(userId);
  notifyListeners(userId, null);

  const { dataKey, etagKey, cachedAtKey } = buildKeys(userId);
  try {
    await Promise.all([
      AsyncStorage.removeItem(dataKey),
      AsyncStorage.removeItem(etagKey),
      AsyncStorage.removeItem(cachedAtKey),
    ]);
  } catch {
    // No-op.
  }
}

export function subscribeCachedFavorites(
  userId: string,
  listener: (payload: FavoritesCachePayload | null) => void
): () => void {
  const listeners = listenersByUser.get(userId) ?? new Set();
  listeners.add(listener);
  listenersByUser.set(userId, listeners);

  return () => {
    const nextListeners = listenersByUser.get(userId);
    if (!nextListeners) {
      return;
    }

    nextListeners.delete(listener);
    if (nextListeners.size === 0) {
      listenersByUser.delete(userId);
    }
  };
}

function notifyListeners(userId: string, payload: FavoritesCachePayload | null): void {
  const listeners = listenersByUser.get(userId);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener(payload);
  }
}
