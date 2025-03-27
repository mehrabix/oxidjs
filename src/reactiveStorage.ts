import { createSignalPair, ReadonlySignal } from './signal';
import { createEffect } from './effect';

/**
 * Storage adapter interface for custom storage implementations
 */
export interface StorageAdapter {
  /** Get a value from storage */
  getItem(key: string): string | null;
  /** Set a value in storage */
  setItem(key: string, value: string): void;
  /** Remove a value from storage */
  removeItem(key: string): void;
  /** Clear all values in storage */
  clear(): void;
}

/**
 * Browser storage adapter for localStorage
 */
export const localStorageAdapter: StorageAdapter = typeof window !== 'undefined' 
  ? window.localStorage 
  : {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
  };

/**
 * Browser storage adapter for sessionStorage
 */
export const sessionStorageAdapter: StorageAdapter = typeof window !== 'undefined'
  ? window.sessionStorage
  : {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
  };

/**
 * In-memory storage adapter for testing or server-side usage
 */
export function createMemoryStorageAdapter(): StorageAdapter {
  const storage = new Map<string, string>();
  
  return {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear()
  };
}

/**
 * Options for persistent storage
 */
export interface StorageOptions<T> {
  /** The key to use for storage */
  key: string;
  /** Initial value if no stored value exists */
  initialValue: T;
  /** Storage adapter to use */
  adapter?: StorageAdapter;
  /** Custom serializer function */
  serializer?: (value: T) => string;
  /** Custom deserializer function */
  deserializer?: (value: string) => T;
  /** Whether to sync across browser tabs */
  syncTabs?: boolean;
}

/**
 * A reactive persistent storage
 */
export interface ReactiveStorage<T> {
  /** Get the current value */
  get: ReadonlySignal<T>;
  /** Set a new value */
  set: (value: T | ((prev: T) => T)) => void;
  /** Reset to initial value */
  reset: () => void;
  /** Remove the value from storage */
  remove: () => void;
  /** Get the current key */
  key: string;
  /** Change the storage key */
  setKey: (newKey: string) => void;
}

/**
 * Create a reactive storage that persists to localStorage/sessionStorage
 * 
 * @param options Storage options
 * @returns A reactive storage object
 */
export function createReactiveStorage<T>(
  options: StorageOptions<T>
): ReactiveStorage<T> {
  const {
    key: initialKey,
    initialValue,
    adapter = localStorageAdapter,
    serializer = JSON.stringify,
    deserializer = JSON.parse,
    syncTabs = false
  } = options;
  
  // Track current key
  let currentKey = initialKey;
  
  // Try to load initial value from storage
  let storedValue: T = initialValue;
  try {
    const stored = adapter.getItem(currentKey);
    if (stored !== null) {
      storedValue = deserializer(stored);
    }
  } catch (e) {
    console.error(`Failed to load stored value for key "${currentKey}":`, e);
  }
  
  // Create signal for the value
  const [get, set] = createSignalPair<T>(storedValue);
  
  // Keep storage in sync with signal changes
  createEffect(() => {
    const value = get();
    
    try {
      adapter.setItem(currentKey, serializer(value));
    } catch (e) {
      console.error(`Failed to save value for key "${currentKey}":`, e);
    }
  });
  
  // Set up storage event listener for cross-tab sync if needed
  if (syncTabs && typeof window !== 'undefined' && adapter === localStorageAdapter) {
    window.addEventListener('storage', (e) => {
      if (e.key === currentKey && e.newValue !== null) {
        try {
          const newValue = deserializer(e.newValue);
          set(newValue);
        } catch (e) {
          console.error(`Failed to sync value for key "${currentKey}":`, e);
        }
      }
    });
  }
  
  // Reset to initial value
  const reset = () => {
    set(initialValue);
  };
  
  // Remove from storage
  const remove = () => {
    adapter.removeItem(currentKey);
    set(initialValue);
  };
  
  // Change the storage key
  const setKey = (newKey: string) => {
    if (newKey === currentKey) return;
    
    // Get current value
    const value = get();
    
    // Remove old key
    adapter.removeItem(currentKey);
    
    // Update key
    currentKey = newKey;
    
    // Store with new key
    try {
      adapter.setItem(currentKey, serializer(value));
    } catch (e) {
      console.error(`Failed to save value for new key "${currentKey}":`, e);
    }
  };
  
  return {
    get,
    set,
    reset,
    remove,
    get key() { return currentKey; },
    setKey
  };
}

/**
 * Create a reactive localStorage
 * 
 * @param key Storage key
 * @param initialValue Initial value if no stored value exists
 * @returns A reactive storage object
 */
export function createLocalStorage<T>(
  key: string,
  initialValue: T
): ReactiveStorage<T> {
  return createReactiveStorage({
    key,
    initialValue,
    adapter: localStorageAdapter,
    syncTabs: true
  });
}

/**
 * Create a reactive sessionStorage
 * 
 * @param key Storage key
 * @param initialValue Initial value if no stored value exists
 * @returns A reactive storage object
 */
export function createSessionStorage<T>(
  key: string,
  initialValue: T
): ReactiveStorage<T> {
  return createReactiveStorage({
    key,
    initialValue,
    adapter: sessionStorageAdapter
  });
}

/**
 * Create a storage that persists values across page reloads
 * but expires after a specified time
 * 
 * @param key Storage key
 * @param initialValue Initial value if no stored value exists
 * @param expiryTime Expiry time in milliseconds
 * @returns A reactive storage object
 */
export function createExpiringStorage<T>(
  key: string,
  initialValue: T,
  expiryTime: number
): ReactiveStorage<T> {
  const metaKey = `${key}_expiry`;
  
  // Custom serializer that includes expiry timestamp
  const serializer = (value: T): string => {
    return JSON.stringify({
      value,
      expiry: Date.now() + expiryTime
    });
  };
  
  // Custom deserializer that checks expiry
  const deserializer = (stored: string): T => {
    const parsed = JSON.parse(stored);
    
    // Check if value has expired
    if (parsed.expiry < Date.now()) {
      // Value has expired, remove it
      localStorageAdapter.removeItem(key);
      localStorageAdapter.removeItem(metaKey);
      throw new Error('Stored value has expired');
    }
    
    return parsed.value;
  };
  
  return createReactiveStorage({
    key,
    initialValue,
    adapter: localStorageAdapter,
    serializer,
    deserializer
  });
}

/**
 * Create a JSON schema validator for stored data
 */
export function createSchemaValidator<T>(
  schema: Record<string, any>,
  errorHandler?: (error: Error) => void
): {
  serializer: (value: T) => string;
  deserializer: (value: string) => T;
} {
  // Simple schema validation function
  const validate = (value: any, schemaToUse = schema): boolean => {
    if (!schemaToUse || typeof schemaToUse !== 'object') return true;
    
    // Check type
    if (schemaToUse.type) {
      const valueType = Array.isArray(value) ? 'array' : typeof value;
      if (schemaToUse.type !== valueType) return false;
    }
    
    // Check required properties
    if (schemaToUse.required && Array.isArray(schemaToUse.required)) {
      for (const prop of schemaToUse.required) {
        if (!(prop in value)) return false;
      }
    }
    
    // Check properties
    if (schemaToUse.properties && typeof schemaToUse.properties === 'object') {
      for (const [prop, propSchema] of Object.entries(schemaToUse.properties)) {
        if (prop in value) {
          if (!validate(value[prop], propSchema as Record<string, any>)) return false;
        }
      }
    }
    
    // Check array items
    if (schemaToUse.items && Array.isArray(value)) {
      for (const item of value) {
        if (!validate(item, schemaToUse.items as Record<string, any>)) return false;
      }
    }
    
    return true;
  };
  
  // Create serializer
  const serializer = (value: T): string => {
    if (!validate(value)) {
      const error = new Error('Value does not match schema');
      if (errorHandler) {
        errorHandler(error);
      } else {
        throw error;
      }
    }
    
    return JSON.stringify(value);
  };
  
  // Create deserializer
  const deserializer = (value: string): T => {
    const parsed = JSON.parse(value);
    
    if (!validate(parsed)) {
      const error = new Error('Stored value does not match schema');
      if (errorHandler) {
        errorHandler(error);
        // Return a default valid value
        return {} as T;
      } else {
        throw error;
      }
    }
    
    return parsed;
  };
  
  return { serializer, deserializer };
} 