import { useCallback, useEffect, useRef, useState } from 'react';

export interface StaleResourcePayload<D> {
  /** The fetched data. */
  data: D;
  /** ISO timestamp of when the data was last fetched/cached. */
  syncedAt: string;
  /** True if the cache has expired and a refresh is warranted. */
  isStale: boolean;
}

export interface UseStaleResourceOptions<D> {
  /**
   * Load data from the nearest cache (local store, server-side cache, etc.).
   * Must not force a full origin refresh. Called on mount and by `reload()`.
   */
  fetchCached: () => Promise<StaleResourcePayload<D>>;
  /**
   * Force a full refresh bypassing caches. Called by `refresh()`.
   */
  forceRefresh: () => Promise<StaleResourcePayload<D>>;
  /**
   * When false the hook does nothing until this flips to true
   * (e.g. user not authenticated yet). Defaults to true.
   */
  enabled?: boolean;
}

export interface UseStaleResourceResult<D> {
  data: D | null;
  /** True during the very first fetch, before any data has been received. */
  isLoading: boolean;
  /** True while a force-refresh is in flight. Does not gate `data`. */
  isRefreshing: boolean;
  syncedAt: string | null;
  isStale: boolean;
  error: string | null;
  /** Trigger a force refresh (calls `forceRefresh`). */
  refresh: () => void;
  /** Soft reload from cache (calls `fetchCached`). Use in `useFocusEffect`. */
  reload: () => void;
}

/**
 * Generic hook for data that is cached server- or client-side.
 *
 * Manages isLoading / isRefreshing / syncedAt / isStale / error state.
 * Both `fetchCached` and `forceRefresh` are read via refs, so callers do
 * not need to memoize them.
 *
 * @example
 * const { data, isLoading, isRefreshing, syncedAt, isStale, refresh, reload } =
 *   useStaleResource({
 *     fetchCached: async () => {
 *       const r = await api.getFriends();
 *       return { data: r.friends, syncedAt: r.fetchedAt, isStale: new Date(r.expiresAt) < new Date() };
 *     },
 *     forceRefresh: async () => {
 *       await api.syncFriends();
 *       const r = await api.getFriends();
 *       return { data: r.friends, syncedAt: r.fetchedAt, isStale: false };
 *     },
 *     enabled: !!userId,
 *   });
 */
export function useStaleResource<D>({
  fetchCached,
  forceRefresh,
  enabled = true,
}: UseStaleResourceOptions<D>): UseStaleResourceResult<D> {
  const [data, setData] = useState<D | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const hasLoadedRef = useRef(false);
  // Stable refs for callbacks — callers don't need to memoize.
  const fetchCachedRef = useRef(fetchCached);
  const forceRefreshRef = useRef(forceRefresh);

  // Keep refs current on every render.
  useEffect(() => { fetchCachedRef.current = fetchCached; });
  useEffect(() => { forceRefreshRef.current = forceRefresh; });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyPayload = useCallback((payload: StaleResourcePayload<D>) => {
    if (!mountedRef.current) return;
    setData(payload.data);
    setSyncedAt(payload.syncedAt);
    setIsStale(payload.isStale);
    setError(null);
  }, []);

  const doLoad = useCallback(async () => {
    // Show loading spinner only on the very first fetch (no data yet).
    const firstLoad = !hasLoadedRef.current;
    if (firstLoad) setIsLoading(true);
    try {
      const payload = await fetchCachedRef.current();
      applyPayload(payload);
      hasLoadedRef.current = true;
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      if (mountedRef.current && firstLoad) setIsLoading(false);
    }
  }, [applyPayload]);

  const doRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const payload = await forceRefreshRef.current();
      applyPayload(payload);
      hasLoadedRef.current = true;
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  }, [applyPayload]);

  // Initial load when enabled becomes true. doLoad is stable so this only
  // re-runs when enabled flips (e.g. after login).
  useEffect(() => {
    if (!enabled) return;
    void doLoad();
  }, [enabled, doLoad]);

  return {
    data,
    isLoading,
    isRefreshing,
    syncedAt,
    isStale,
    error,
    refresh: () => { void doRefresh(); },
    reload: () => { void doLoad(); },
  };
}
