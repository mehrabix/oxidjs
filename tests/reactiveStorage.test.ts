/**
 * @jest-environment jsdom
 */

import { describe, expect, jest, test, beforeEach, afterEach } from '@jest/globals';
import {
  createReactiveStorage,
  createLocalStorage,
  createSessionStorage,
  createMemoryStorageAdapter,
  createExpiringStorage,
  createSchemaValidator,
  localStorageAdapter,
  sessionStorageAdapter
} from '../src/reactiveStorage';

// Mock effect module
jest.mock('../src/effect', () => {
  return {
    createEffect: jest.fn().mockImplementation((fn) => {
      fn();
      return jest.fn(); // Return mock cleanup function
    })
  };
});

// Mock signal module
jest.mock('../src/signal', () => {
  return {
    createSignalPair: jest.fn().mockImplementation((initialValue) => {
      let value = initialValue;
      const getter = jest.fn().mockImplementation(() => value);
      const setter = jest.fn().mockImplementation((newValue) => {
        if (typeof newValue === 'function') {
          value = newValue(value);
        } else {
          value = newValue;
        }
        return value;
      });
      return [getter, setter];
    })
  };
});

describe('ReactiveStorage', () => {
  // Mock localStorage and sessionStorage
  let mockStorage: Map<string, string>;
  let originalLocalStorage: Storage;
  let originalSessionStorage: Storage;
  
  beforeEach(() => {
    // Save original storage objects
    originalLocalStorage = window.localStorage;
    originalSessionStorage = window.sessionStorage;
    
    // Create mock storage
    mockStorage = new Map<string, string>();
    
    // Mock storage methods
    const mockStorageObj = {
      getItem: jest.fn((key: string) => mockStorage.get(key) || null),
      setItem: jest.fn((key: string, value: string) => mockStorage.set(key, value)),
      removeItem: jest.fn((key: string) => mockStorage.delete(key)),
      clear: jest.fn(() => mockStorage.clear()),
      key: jest.fn((index: number) => Array.from(mockStorage.keys())[index] || null),
      length: 0
    };
    
    // Update length property
    Object.defineProperty(mockStorageObj, 'length', {
      get: () => mockStorage.size
    });
    
    // Replace localStorage and sessionStorage with mocks
    Object.defineProperty(window, 'localStorage', {
      value: mockStorageObj,
      writable: true
    });
    
    Object.defineProperty(window, 'sessionStorage', {
      value: {...mockStorageObj},
      writable: true
    });
    
    // Silence console warnings
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Setup fake timers
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    // Restore original storage objects
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true
    });
    
    Object.defineProperty(window, 'sessionStorage', {
      value: originalSessionStorage,
      writable: true
    });
    
    // Restore console
    jest.restoreAllMocks();
    
    // Use real timers
    jest.useRealTimers();
  });
  
  describe('Storage Adapters', () => {
    test('localStorageAdapter should interact with localStorage', () => {
      localStorageAdapter.setItem('test-key', 'test-value');
      expect(window.localStorage.setItem).toHaveBeenCalledWith('test-key', 'test-value');
      
      localStorageAdapter.getItem('test-key');
      expect(window.localStorage.getItem).toHaveBeenCalledWith('test-key');
      
      localStorageAdapter.removeItem('test-key');
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('test-key');
      
      localStorageAdapter.clear();
      expect(window.localStorage.clear).toHaveBeenCalled();
    });
    
    test('sessionStorageAdapter should interact with sessionStorage', () => {
      sessionStorageAdapter.setItem('test-key', 'test-value');
      expect(window.sessionStorage.setItem).toHaveBeenCalledWith('test-key', 'test-value');
      
      sessionStorageAdapter.getItem('test-key');
      expect(window.sessionStorage.getItem).toHaveBeenCalledWith('test-key');
      
      sessionStorageAdapter.removeItem('test-key');
      expect(window.sessionStorage.removeItem).toHaveBeenCalledWith('test-key');
      
      sessionStorageAdapter.clear();
      expect(window.sessionStorage.clear).toHaveBeenCalled();
    });
    
    test('createMemoryStorageAdapter should create an in-memory storage', () => {
      const memoryAdapter = createMemoryStorageAdapter();
      
      memoryAdapter.setItem('test-key', 'test-value');
      expect(memoryAdapter.getItem('test-key')).toBe('test-value');
      
      memoryAdapter.removeItem('test-key');
      expect(memoryAdapter.getItem('test-key')).toBeNull();
      
      memoryAdapter.setItem('key1', 'value1');
      memoryAdapter.setItem('key2', 'value2');
      memoryAdapter.clear();
      expect(memoryAdapter.getItem('key1')).toBeNull();
      expect(memoryAdapter.getItem('key2')).toBeNull();
    });
  });
  
  describe('ReactiveStorage', () => {
    test('should create reactive storage with initial value', () => {
      const storage = createReactiveStorage({
        key: 'test-storage',
        initialValue: { count: 0 },
        adapter: createMemoryStorageAdapter()
      });
      
      // Check initial value
      expect(storage.get()).toEqual({ count: 0 });
    });
    
    test('should load existing value from storage', () => {
      // Set up a pre-existing value
      const adapter = createMemoryStorageAdapter();
      adapter.setItem('test-storage', JSON.stringify({ count: 5 }));
      
      // Create storage with the pre-populated adapter
      const storage = createReactiveStorage({
        key: 'test-storage',
        initialValue: { count: 0 },
        adapter
      });
      
      // Should load the existing value
      expect(storage.get()).toEqual({ count: 5 });
    });
    
    test('should update storage when value changes', () => {
      const adapter = createMemoryStorageAdapter();
      const storage = createReactiveStorage({
        key: 'test-storage',
        initialValue: { count: 0 },
        adapter
      });
      
      // Update the value
      storage.set({ count: 10 });
      
      // Check that the adapter was updated
      expect(JSON.parse(adapter.getItem('test-storage')!)).toEqual({ count: 10 });
    });
    
    test('should reset to initial value', () => {
      const storage = createReactiveStorage({
        key: 'test-storage',
        initialValue: { count: 0 },
        adapter: createMemoryStorageAdapter()
      });
      
      // Change value
      storage.set({ count: 10 });
      
      // Reset
      storage.reset();
      
      // Check that it's back to initial value
      expect(storage.get()).toEqual({ count: 0 });
    });
    
    test('should remove from storage', () => {
      const adapter = createMemoryStorageAdapter();
      const storage = createReactiveStorage({
        key: 'test-storage',
        initialValue: { count: 0 },
        adapter
      });
      
      // Set a value
      storage.set({ count: 10 });
      
      // Remove
      storage.remove();
      
      // Adapter should no longer have the key
      expect(adapter.getItem('test-storage')).toBeNull();
      
      // Value should be reset to initial
      expect(storage.get()).toEqual({ count: 0 });
    });
    
    test('should change storage key', () => {
      const adapter = createMemoryStorageAdapter();
      const storage = createReactiveStorage({
        key: 'original-key',
        initialValue: { count: 0 },
        adapter
      });
      
      // Set a value
      storage.set({ count: 10 });
      
      // Change key
      storage.setKey('new-key');
      
      // Original key should be gone
      expect(adapter.getItem('original-key')).toBeNull();
      
      // New key should have the value
      expect(JSON.parse(adapter.getItem('new-key')!)).toEqual({ count: 10 });
      
      // Key should be updated
      expect(storage.key).toBe('new-key');
    });
    
    test('should handle serialization errors gracefully', () => {
      const adapter = createMemoryStorageAdapter();
      
      // Create a circular reference object that can't be serialized
      const circular: any = { prop: 'value' };
      circular.self = circular;
      
      const storage = createReactiveStorage({
        key: 'test-storage',
        initialValue: { data: null },
        adapter
      });
      
      // This should log an error but not throw
      storage.set({ data: circular });
    });
  });
  
  describe('Specialized Storage', () => {
    test('createLocalStorage should use localStorage adapter', () => {
      // Mock the localStorage methods
      const spy = jest.spyOn(window.localStorage, 'setItem');
      
      const storage = createLocalStorage('local-key', { value: 'test' });
      
      // Should use localStorage
      storage.set({ value: 'updated' });
      expect(spy).toHaveBeenCalledWith('local-key', expect.any(String));
    });
    
    test('createSessionStorage should use sessionStorage adapter', () => {
      // Mock the sessionStorage methods
      const spy = jest.spyOn(window.sessionStorage, 'setItem');
      
      const storage = createSessionStorage('session-key', { value: 'test' });
      
      // Should use sessionStorage
      storage.set({ value: 'updated' });
      expect(spy).toHaveBeenCalledWith('session-key', expect.any(String));
    });
    
    test('createExpiringStorage should expire after specified time', () => {
      // Manually mock Date.now to control time
      const originalNow = Date.now;
      const mockNow = jest.fn();
      Date.now = mockNow;
      
      // Set current time
      mockNow.mockReturnValue(1000);
      
      const adapter = createMemoryStorageAdapter();
      const spySetItem = jest.spyOn(adapter, 'setItem');
      
      // Create expiring storage with 5 second TTL
      const storage = createExpiringStorage('expire-key', 'initial', 5000);
      
      // Value should be set with expiry
      expect(spySetItem).toHaveBeenCalled();
      const storedValue = JSON.parse(adapter.getItem('expire-key')!);
      expect(storedValue.expiry).toBe(6000); // 1000 + 5000
      
      // Clean up
      Date.now = originalNow;
    });
    
    test('createSchemaValidator should validate data against schema', () => {
      // Create a simple schema
      const schema = {
        type: 'object',
        required: ['name', 'age'],
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        }
      };
      
      const { serializer, deserializer } = createSchemaValidator(schema);
      
      // Valid object should serialize without error
      const validObj = { name: 'Test', age: 30 };
      expect(() => serializer(validObj)).not.toThrow();
      
      // Invalid object should throw
      const invalidObj = { name: 'Test', age: 'thirty' };
      expect(() => serializer(invalidObj)).toThrow();
      
      // Valid serialized object should deserialize without error
      const validSerialized = JSON.stringify(validObj);
      expect(() => deserializer(validSerialized)).not.toThrow();
      
      // Invalid serialized object should throw
      const invalidSerialized = JSON.stringify(invalidObj);
      expect(() => deserializer(invalidSerialized)).toThrow();
    });
  });
}); 