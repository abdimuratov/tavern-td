// Token buckets for the Relay's limits (docs/adr/0006-a-relay-server-on-render.md):
// a bucket holds up to `capacity` and refills at `perSecond`, so it allows a
// burst and then a steady rate. Pure but for the injected clock.

export interface Bucket {
  /** Takes n if the bucket holds them, and says whether it did. */
  take(n?: number): boolean;
}

export function createBucket(capacity: number, perSecond: number, now: () => number): Bucket {
  let level = capacity;
  let at = now();
  return {
    take(n = 1) {
      const t = now();
      level = Math.min(capacity, level + ((t - at) / 1000) * perSecond);
      at = t;
      if (level < n) return false;
      level -= n;
      return true;
    },
  };
}

/** A bucket per key (an address), dropped again once it would be full. */
export function createKeyedBuckets(capacity: number, perSecond: number, now: () => number) {
  const buckets = new Map<string, { level: number; at: number }>();
  return {
    take(key: string, n = 1): boolean {
      const t = now();
      const b = buckets.get(key) ?? { level: capacity, at: t };
      b.level = Math.min(capacity, b.level + ((t - b.at) / 1000) * perSecond);
      b.at = t;
      buckets.set(key, b);
      if (b.level < n) return false;
      b.level -= n;
      return true;
    },
    /** Forgets the keys whose buckets have refilled, so the map holds only recent addresses. */
    prune(): void {
      const t = now();
      for (const [key, b] of buckets) {
        if (b.level + ((t - b.at) / 1000) * perSecond >= capacity) buckets.delete(key);
      }
    },
    get size(): number {
      return buckets.size;
    },
  };
}
