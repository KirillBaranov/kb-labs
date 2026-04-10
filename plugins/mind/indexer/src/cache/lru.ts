/**
 * LRU cache for KB Labs Mind Indexer
 */

import type { CacheEntry } from "../types/index";

/**
 * Simple LRU cache implementation
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * File cache for tracking file changes
 */
export class FileCache {
  private cache = new LRUCache<string, CacheEntry>();

  get(filePath: string): CacheEntry | undefined {
    return this.cache.get(filePath);
  }

  set(filePath: string, entry: CacheEntry): void {
    this.cache.set(filePath, entry);
  }

  has(filePath: string): boolean {
    return this.cache.has(filePath);
  }

  delete(filePath: string): boolean {
    return this.cache.delete(filePath);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size();
  }
}
