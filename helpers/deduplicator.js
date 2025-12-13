import { LRUCache } from "lru-cache";

export class Deduplicator {
  constructor(max = 5000, ttl = 60 * 60 * 1000) {
    this.cache = new LRUCache({
      max, ttl,
      updateAgeOnGet: false,
      updateAgeOnHas: false, 
    });
  }

  attempt(key) {
    if (this.cache.has(key)) {
      return false;
    }

    this.cache.set(key, 1);
    return true;
  }
}

export const dedup = new Deduplicator();