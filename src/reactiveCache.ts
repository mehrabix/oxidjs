import { createSignalPair, ReadonlySignal } from './signal';

/**
 * Cache entry status
 */
export type CacheStatus = 'fresh' | 'stale' | 'expired' | 'error';

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** When the value was cached */
  timestamp: number;
  /** Status of this cache entry */
  status: CacheStatus;
  /** When the entry will expire (or did expire) */
  expiresAt: number;
  /** Error if status is 'error' */
  error?: any;
  /** Tags for organizing and invalidating entries */
  tags: string[];
}

/**
 * Cache options
 */
export interface CacheOptions {
  /** Default time-to-live in milliseconds */
  defaultTtl?: number;
  /** Maximum number of entries to keep */
  maxEntries?: number;
  /** Whether to automatically remove expired entries */
  autoRemoveExpired?: boolean;
  /** How often to check for expired entries (ms) */
  cleanupInterval?: number;
  /** Whether to persist entries to storage */
  persist?: boolean;
  /** Storage key for persistence */
  storageKey?: string;
  /** Storage type ('local' or 'session') */
  storageType?: 'local' | 'session';
  /** Default tags to apply to entries */
  defaultTags?: string[];
  /** Whether to log cache operations for debugging */
  debug?: boolean;
}

/**
 * Compute options
 */
export interface ComputeOptions {
  /** Time-to-live for this computation */
  ttl?: number;
  /** Tags for this cache entry */
  tags?: string[];
  /** Whether to use stale value while recomputing */
  staleWhileRevalidate?: boolean;
  /** Whether to suppress errors and return previous value */
  returnPreviousOnError?: boolean;
}

/**
 * Cache eviction strategy
 */
export type EvictionStrategy = 'lru' | 'lfu' | 'fifo';

/**
 * A reactive cache
 */
export interface ReactiveCache {
  /** Get a value from cache or compute it */
  compute: <T>(
    key: string,
    computeFn: () => T | Promise<T>,
    options?: ComputeOptions
  ) => Promise<T>;
  
  /** Get a cached value without computing */
  getCached: <T>(key: string) => T | undefined;
  
  /** Check if a key exists in the cache */
  has: (key: string) => boolean;
  
  /** Manually set a cache value */
  set: <T>(
    key: string,
    value: T,
    options?: { ttl?: number; tags?: string[] }
  ) => void;
  
  /** Remove a value from cache */
  remove: (key: string) => void;
  
  /** Invalidate entries by tags */
  invalidate: (tags: string | string[]) => void;
  
  /** Clear the entire cache */
  clear: () => void;
  
  /** Get cache statistics */
  getStats: () => {
    hits: number;
    misses: number;
    size: number;
    keys: string[];
  };
  
  /** Get a reactive signal for a cached value */
  watch: <T>(key: string) => ReadonlySignal<T | undefined>;
}

/**
 * Create a reactive cache
 */
export function createCache(options: CacheOptions = {}): ReactiveCache {
  const {
    defaultTtl = 5 * 60 * 1000, // 5 minutes
    maxEntries = 100,
    autoRemoveExpired = true,
    cleanupInterval = 60 * 1000, // 1 minute
    persist = false,
    storageKey = 'reactive_cache',
    storageType = 'local',
    defaultTags = [],
    debug = false
  } = options;
  
  // The cache storage
  const cache: Record<string, CacheEntry<any>> = {};
  
  // Cache access tracking for LRU/LFU
  const accessCount: Record<string, number> = {};
  const lastAccess: Record<string, number> = {};
  
  // Cache statistics
  let hits = 0;
  let misses = 0;
  
  // Cleanup interval handle
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;
  
  // Watch signals for reactive access
  const watchSignals: Record<string, [ReadonlySignal<any>, (value: any) => any]> = {};
  
  /**
   * Log debug information
   */
  function log(...args: any[]): void {
    if (debug) {
      console.log('[ReactiveCache]', ...args);
    }
  }
  
  /**
   * Initialize the cache
   */
  function initialize(): void {
    if (persist && typeof window !== 'undefined') {
      try {
        const storage = storageType === 'local' 
          ? window.localStorage 
          : window.sessionStorage;
        
        const stored = storage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          
          // Restore cache entries
          for (const [key, entry] of Object.entries(parsed)) {
            cache[key] = entry as CacheEntry<any>;
          }
          
          log(`Loaded ${Object.keys(cache).length} entries from ${storageType} storage`);
        }
      } catch (err) {
        console.error('Failed to load cache from storage:', err);
      }
    }
    
    // Set up cleanup timer if auto-remove is enabled
    if (autoRemoveExpired) {
      cleanupTimer = setInterval(removeExpiredEntries, cleanupInterval);
    }
  }
  
  /**
   * Save cache to storage
   */
  function saveToStorage(): void {
    if (persist && typeof window !== 'undefined') {
      try {
        const storage = storageType === 'local' 
          ? window.localStorage 
          : window.sessionStorage;
        
        storage.setItem(storageKey, JSON.stringify(cache));
        log('Saved cache to storage');
      } catch (err) {
        console.error('Failed to save cache to storage:', err);
      }
    }
  }
  
  /**
   * Update the watched signal for a key
   */
  function updateWatchSignal(key: string): void {
    if (watchSignals[key]) {
      const [_, setValue] = watchSignals[key];
      setValue(getCached(key));
    }
  }
  
  /**
   * Check if a cache entry is fresh
   */
  function isFresh(entry: CacheEntry<any>): boolean {
    return Date.now() < entry.expiresAt;
  }
  
  /**
   * Check if a cache entry is stale but not expired
   */
  function isStale(entry: CacheEntry<any>): boolean {
    const now = Date.now();
    // Stale means between 80% of TTL and fully expired
    const staleTime = entry.timestamp + (entry.expiresAt - entry.timestamp) * 0.8;
    return now >= staleTime && now < entry.expiresAt;
  }
  
  /**
   * Remove expired entries from the cache
   */
  function removeExpiredEntries(): void {
    const now = Date.now();
    let removedCount = 0;
    
    for (const key in cache) {
      if (cache[key].expiresAt < now) {
        delete cache[key];
        delete accessCount[key];
        delete lastAccess[key];
        removedCount++;
        
        // Update watch signal if exists
        updateWatchSignal(key);
      }
    }
    
    if (removedCount > 0) {
      log(`Removed ${removedCount} expired entries`);
      saveToStorage();
    }
  }
  
  /**
   * Enforce maximum size limit using the configured strategy
   */
  function enforceMaxEntries(strategy: EvictionStrategy = 'lru'): void {
    const keys = Object.keys(cache);
    
    if (keys.length <= maxEntries) {
      return;
    }
    
    log(`Cache exceeds max entries (${keys.length}/${maxEntries}), evicting...`);
    
    // Sort keys according to the eviction strategy
    let sortedKeys: string[];
    
    if (strategy === 'lru') {
      // Least Recently Used - evict oldest accessed entries
      sortedKeys = keys.sort((a, b) => (lastAccess[a] || 0) - (lastAccess[b] || 0));
    } else if (strategy === 'lfu') {
      // Least Frequently Used - evict least accessed entries
      sortedKeys = keys.sort((a, b) => (accessCount[a] || 0) - (accessCount[b] || 0));
    } else {
      // FIFO - evict oldest entries
      sortedKeys = keys.sort((a, b) => 
        (cache[a].timestamp || 0) - (cache[b].timestamp || 0)
      );
    }
    
    // Remove entries until we're under the limit
    const toRemove = sortedKeys.slice(0, keys.length - maxEntries);
    
    for (const key of toRemove) {
      delete cache[key];
      delete accessCount[key];
      delete lastAccess[key];
      
      // Update watch signal if exists
      updateWatchSignal(key);
    }
    
    log(`Evicted ${toRemove.length} entries`);
    saveToStorage();
  }
  
  /**
   * Track access to a cache key
   */
  function trackAccess(key: string): void {
    accessCount[key] = (accessCount[key] || 0) + 1;
    lastAccess[key] = Date.now();
  }
  
  /**
   * Compute a value and cache it
   */
  async function compute<T>(
    key: string,
    computeFn: () => T | Promise<T>,
    options: ComputeOptions = {}
  ): Promise<T> {
    const {
      ttl = defaultTtl,
      tags = [...defaultTags],
      staleWhileRevalidate = false,
      returnPreviousOnError = false
    } = options;
    
    // Check if we have a valid cached entry
    const existing = cache[key];
    
    if (existing) {
      trackAccess(key);
      
      if (isFresh(existing)) {
        // Cache hit - fresh value
        log(`Cache hit (fresh): ${key}`);
        hits++;
        
        // Update entry status
        cache[key] = {
          ...existing,
          status: 'fresh'
        };
        
        return existing.value;
      } else if (isStale(existing) && staleWhileRevalidate) {
        // Cache hit - stale value, but we can use it while recomputing
        log(`Cache hit (stale): ${key}, recomputing in background`);
        hits++;
        
        // Update entry status
        cache[key] = {
          ...existing,
          status: 'stale'
        };
        
        // Recompute in the background
        recomputeInBackground(key, computeFn, { ttl, tags, returnPreviousOnError });
        
        return existing.value;
      }
      
      // Cache entry exists but is expired
      log(`Cache miss (expired): ${key}`);
      misses++;
    } else {
      // No cache entry
      log(`Cache miss (new): ${key}`);
      misses++;
    }
    
    // We need to compute the value
    try {
      const result = await Promise.resolve(computeFn());
      
      // Cache the result
      const now = Date.now();
      cache[key] = {
        value: result,
        timestamp: now,
        status: 'fresh',
        expiresAt: now + ttl,
        tags
      };
      
      // Track access
      trackAccess(key);
      
      // Enforce max entries
      enforceMaxEntries('lru');
      
      // Save to storage if persistence is enabled
      saveToStorage();
      
      // Update watch signal if exists
      updateWatchSignal(key);
      
      return result;
    } catch (error) {
      log(`Computation error for ${key}:`, error);
      
      if (returnPreviousOnError && existing) {
        // Use previous value on error
        log(`Returning previous value due to error`);
        
        // Update entry with error but keep the value
        cache[key] = {
          ...existing,
          status: 'error',
          error
        };
        
        // Update watch signal if exists
        updateWatchSignal(key);
        
        return existing.value;
      }
      
      // Store the error in cache
      const now = Date.now();
      cache[key] = {
        value: undefined as any,
        timestamp: now,
        status: 'error',
        expiresAt: now + ttl,
        error,
        tags
      };
      
      // Update watch signal if exists
      updateWatchSignal(key);
      
      throw error;
    }
  }
  
  /**
   * Recompute a value in the background
   */
  async function recomputeInBackground<T>(
    key: string,
    computeFn: () => T | Promise<T>,
    options: ComputeOptions = {}
  ): Promise<void> {
    const { ttl = defaultTtl, tags = [...defaultTags], returnPreviousOnError = false } = options;
    
    try {
      const result = await Promise.resolve(computeFn());
      
      // Cache the result
      const now = Date.now();
      cache[key] = {
        value: result,
        timestamp: now,
        status: 'fresh',
        expiresAt: now + ttl,
        tags
      };
      
      log(`Background recomputation completed for ${key}`);
      
      // Save to storage if persistence is enabled
      saveToStorage();
      
      // Update watch signal if exists
      updateWatchSignal(key);
    } catch (error) {
      log(`Background recomputation error for ${key}:`, error);
      
      const existing = cache[key];
      
      if (returnPreviousOnError && existing) {
        // Keep the previous value but mark as error
        cache[key] = {
          ...existing,
          status: 'error',
          error
        };
      } else {
        // Store the error in cache
        const now = Date.now();
        cache[key] = {
          value: undefined as any,
          timestamp: now,
          status: 'error',
          expiresAt: now + ttl,
          error,
          tags
        };
      }
      
      // Update watch signal if exists
      updateWatchSignal(key);
    }
  }
  
  /**
   * Get a cached value without computing
   */
  function getCached<T>(key: string): T | undefined {
    const entry = cache[key];
    
    if (entry) {
      trackAccess(key);
      
      if (entry.status !== 'expired' && isFresh(entry)) {
        hits++;
        return entry.value;
      }
      
      // Mark as expired if it's no longer fresh
      if (entry.status !== 'expired' && !isFresh(entry)) {
        cache[key] = {
          ...entry,
          status: 'expired'
        };
        
        // Update watch signal if exists
        updateWatchSignal(key);
      }
    }
    
    misses++;
    return undefined;
  }
  
  /**
   * Check if a key exists in the cache
   */
  function has(key: string): boolean {
    return key in cache;
  }
  
  /**
   * Manually set a cache value
   */
  function set<T>(
    key: string,
    value: T,
    options: { ttl?: number; tags?: string[] } = {}
  ): void {
    const { ttl = defaultTtl, tags = [...defaultTags] } = options;
    
    const now = Date.now();
    cache[key] = {
      value,
      timestamp: now,
      status: 'fresh',
      expiresAt: now + ttl,
      tags
    };
    
    // Track access
    trackAccess(key);
    
    // Enforce max entries
    enforceMaxEntries('lru');
    
    // Save to storage if persistence is enabled
    saveToStorage();
    
    // Update watch signal if exists
    updateWatchSignal(key);
    
    log(`Manually set: ${key}`);
  }
  
  /**
   * Remove a value from cache
   */
  function remove(key: string): void {
    if (key in cache) {
      delete cache[key];
      delete accessCount[key];
      delete lastAccess[key];
      
      // Save to storage if persistence is enabled
      saveToStorage();
      
      // Update watch signal if exists
      updateWatchSignal(key);
      
      log(`Removed: ${key}`);
    }
  }
  
  /**
   * Invalidate entries by tags
   */
  function invalidate(tagInput: string | string[]): void {
    const tags = Array.isArray(tagInput) ? tagInput : [tagInput];
    
    if (tags.length === 0) {
      return;
    }
    
    let invalidatedCount = 0;
    
    for (const key in cache) {
      const entry = cache[key];
      
      // If any of the entry's tags match the invalidation tags
      if (entry.tags.some(tag => tags.includes(tag))) {
        delete cache[key];
        delete accessCount[key];
        delete lastAccess[key];
        invalidatedCount++;
        
        // Update watch signal if exists
        updateWatchSignal(key);
      }
    }
    
    if (invalidatedCount > 0) {
      log(`Invalidated ${invalidatedCount} entries with tags:`, tags);
      
      // Save to storage if persistence is enabled
      saveToStorage();
    }
  }
  
  /**
   * Clear the entire cache
   */
  function clear(): void {
    for (const key in cache) {
      delete cache[key];
      delete accessCount[key];
      delete lastAccess[key];
      
      // Update watch signal if exists
      updateWatchSignal(key);
    }
    
    // Reset statistics
    hits = 0;
    misses = 0;
    
    // Save to storage if persistence is enabled
    saveToStorage();
    
    log('Cache cleared');
  }
  
  /**
   * Get cache statistics
   */
  function getStats() {
    return {
      hits,
      misses,
      size: Object.keys(cache).length,
      keys: Object.keys(cache)
    };
  }
  
  /**
   * Get a reactive signal for a cached value
   */
  function watch<T>(key: string): ReadonlySignal<T | undefined> {
    // Create signal if it doesn't exist
    if (!watchSignals[key]) {
      // Create a new signal pair for this key
      const signalPair = createSignalPair<T | undefined>(getCached<T>(key));
      watchSignals[key] = signalPair;
    }
    
    // Return the getter signal with proper type
    return watchSignals[key][0] as ReadonlySignal<T | undefined>;
  }
  
  // Initialize the cache
  initialize();
  
  // Clean up on environment exit
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
      }
    });
  }
  
  return {
    compute,
    getCached,
    has,
    set,
    remove,
    invalidate,
    clear,
    getStats,
    watch
  };
}

/**
 * Default cache instance
 */
let defaultCache: ReactiveCache | null = null;

/**
 * Get the default cache instance
 */
export function getCache(options?: CacheOptions): ReactiveCache {
  if (!defaultCache) {
    defaultCache = createCache(options);
  }
  return defaultCache;
}

/**
 * Create a memoized function with reactive caching
 */
export function memoize<T, Args extends any[]>(
  fn: (...args: Args) => T | Promise<T>,
  options: {
    cache?: ReactiveCache;
    keyFn?: (...args: Args) => string;
    ttl?: number;
    tags?: string[];
    staleWhileRevalidate?: boolean;
  } = {}
): (...args: Args) => Promise<T> {
  const {
    cache = getCache(),
    keyFn = (...args) => JSON.stringify(args),
    ttl,
    tags,
    staleWhileRevalidate
  } = options;
  
  return async (...args: Args): Promise<T> => {
    const key = keyFn(...args);
    
    return cache.compute(
      key,
      () => fn(...args),
      { ttl, tags, staleWhileRevalidate }
    );
  };
} 