/**
 * @module @kb-labs/mind-embeddings/cache
 * LRU cache for embeddings to reduce API calls
 */

export interface EmbeddingCacheEntry {
  embedding: number[];
  timestamp: number;
  hitCount: number;
}

export interface EmbeddingCacheOptions {
  maxSize?: number;
  ttlMs?: number;
  enabled?: boolean;
}

/**
 * Simple LRU cache for embeddings
 */
export class EmbeddingCache {
  private cache: Map<string, EmbeddingCacheEntry>;
  private maxSize: number;
  private ttlMs: number;
  private enabled: boolean;
  private hits: number = 0;
  private misses: number = 0;

  constructor(options: EmbeddingCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 10000; // Cache up to 10k embeddings
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000; // 24 hours default
    this.enabled = options.enabled ?? true;
    this.cache = new Map();
  }

  /**
   * Get cache key for text
   */
  private getCacheKey(text: string, model: string): string {
    // Simple hash function for cache key
    return `${model}:${this.hashText(text)}`;
  }

  /**
   * Simple hash function for text
   */
  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get embedding from cache
   */
  get(text: string, model: string): number[] | null {
    if (!this.enabled) {return null;}

    const key = this.getCacheKey(text, model);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if entry is expired
    const age = Date.now() - entry.timestamp;
    if (age > this.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update hit count and move to end (LRU)
    entry.hitCount++;
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;

    return entry.embedding;
  }

  /**
   * Set embedding in cache
   */
  set(text: string, model: string, embedding: number[]): void {
    if (!this.enabled) {return;}

    const key = this.getCacheKey(text, model);

    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      embedding,
      timestamp: Date.now(),
      hitCount: 0,
    });
  }

  /**
   * Get multiple embeddings from cache
   */
  getMany(texts: string[], model: string): (number[] | null)[] {
    return texts.map(text => this.get(text, model));
  }

  /**
   * Set multiple embeddings in cache
   */
  setMany(texts: string[], model: string, embeddings: number[][]): void {
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const embedding = embeddings[i];
      if (text && embedding) {
        this.set(text, model, embedding);
      }
    }
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      enabled: this.enabled,
    };
  }

  /**
   * Remove expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Get cache size in bytes (approximate)
   */
  getSizeBytes(): number {
    let size = 0;
    for (const entry of this.cache.values()) {
      // Approximate: each float64 is 8 bytes
      size += entry.embedding.length * 8;
      // Add overhead for timestamp and hitCount
      size += 16;
    }
    return size;
  }
}

/**
 * Global singleton cache instance
 */
let globalCache: EmbeddingCache | null = null;

/**
 * Get or create global cache instance
 */
export function getGlobalEmbeddingCache(options?: EmbeddingCacheOptions): EmbeddingCache {
  if (!globalCache) {
    globalCache = new EmbeddingCache(options);
  }
  return globalCache;
}

/**
 * Reset global cache (useful for testing)
 */
export function resetGlobalEmbeddingCache(): void {
  globalCache = null;
}
