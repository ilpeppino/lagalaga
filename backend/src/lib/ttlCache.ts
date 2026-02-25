/**
 * Generic in-memory TTL cache.
 * Each entry expires independently based on the TTL set at construction time.
 */
export class TtlCache<K, V> {
  private readonly store = new Map<K, { value: V; expiresAt: number }>();
  private readonly inFlight = new Map<K, Promise<V>>();

  constructor(private readonly ttlMs: number) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  async getOrCreate(key: K, factory: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const existingPromise = this.inFlight.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    const pending = factory()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, pending);
    return pending;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.store.clear();
    this.inFlight.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
