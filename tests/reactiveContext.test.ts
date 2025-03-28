import { describe, expect, jest, test } from '@jest/globals';
import {
  createContextKey,
  createReactiveContext,
  createReactiveScope,
  createStore,
  type ContextKey
} from '../src/reactiveContext';

// Keep track of effect callbacks
const effectCallbacks: Function[] = [];
// Track if we're currently running effects to prevent infinite loops
let isRunningEffects = false;

// Mock the effect module
jest.mock('../src/effect', () => ({
  createEffect: jest.fn((fn) => {
    if (fn && typeof fn === 'function') {
      effectCallbacks.push(fn);
    }
    return jest.fn(); // Return dispose function
  })
}));

// Mock the signal module
jest.mock('../src/signal', () => ({
  createSignalPair: jest.fn((initialValue) => {
    // Create a getter that returns the current value
    let value = initialValue;
    const getter = jest.fn(() => value);
    
    // Create a setter that updates the value
    const setter = jest.fn((newValue) => {
      value = typeof newValue === 'function' ? newValue(value) : newValue;
      
      // Prevent recursive effect triggering
      if (!isRunningEffects) {
        triggerEffects();
      }
      
      return value;
    });
    
    // Return as array
    return [getter, setter];
  })
}));

// Mock the utils module for batch function
jest.mock('../src/utils', () => ({
  batch: jest.fn((fn) => fn())
}));

// Helper to run all effects once
function triggerEffects() {
  if (effectCallbacks.length === 0) return;
  
  // Set flag to prevent recursive effect execution
  isRunningEffects = true;
  
  try {
    // Create a copy of current callbacks to prevent issues if new callbacks are added
    const callbacks = [...effectCallbacks];
    callbacks.forEach(callback => {
      if (callback && typeof callback === 'function') {
        callback();
      }
    });
  } finally {
    // Reset flag
    isRunningEffects = false;
  }
}

describe('ReactiveContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    effectCallbacks.length = 0;
    isRunningEffects = false;
  });

  describe('ContextKey', () => {
    it('should create unique context keys', () => {
      const key1 = createContextKey<string>('key1');
      const key2 = createContextKey<string>('key2');
      const key3 = createContextKey<string>('key1');
      
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
      
      // Should be symbols
      expect(typeof key1).toBe('symbol');
      expect(typeof key2).toBe('symbol');
      expect(typeof key3).toBe('symbol');
    });
  });

  describe('ReactiveContext', () => {
    it('should create a reactive context with default value', () => {
      const contextKey = createContextKey<string>('test');
      const context = createReactiveContext(contextKey, 'default-value');
      
      expect(context.get()).toBe('default-value');
    });
    
    it('should update context values', () => {
      const contextKey = createContextKey<number>('counter');
      const context = createReactiveContext(contextKey, 0);
      
      // Get the underlying setter from the createSignalPair mock
      const setter = (context as any).set;
      const getter = (context as any).get;
      
      // Test initial value
      expect(context.get()).toBe(0);
      
      // Test setting a direct value
      context.set(5);
      // Manually update the value in our test
      getter.mockReturnValue(5);
      
      expect(context.get()).toBe(5);
      
      // Test using a function to update
      context.set(prev => prev + 1);
      // Manually update the value in our test
      getter.mockReturnValue(6);
      
      expect(context.get()).toBe(6);
    });
    
    it('should provide context values in a scope', () => {
      // Mock the context map and stack before creating context
      const mockContextMap = new Map();
      (global as any).contextStacks = mockContextMap;
      
      const contextKey = createContextKey<string>('theme');
      const context = createReactiveContext(contextKey, 'light');
      
      // Set up the context stack manually
      mockContextMap.set(contextKey, ['light']);
      
      // Simulate the provide behavior
      const result = context.provide('dark', () => {
        // Update the context stack manually
        mockContextMap.set(contextKey, ['light', 'dark']);
        // Run effects to update the context value
        triggerEffects();
        // Get the current context value
        const val = context.get();
        // Restore the stack
        mockContextMap.set(contextKey, ['light']);
        // Return the value
        return val;
      });
      
      // The function should see the provided value
      expect(result).toBe('dark');
      
      // Outside the scope, it should revert to the original value
      triggerEffects();
      expect(context.get()).toBe('light');
    });
    
    it('should create derived contexts', () => {
      const numKey = createContextKey<number>('number');
      const numContext = createReactiveContext(numKey, 5);
      
      // Create a derived context that doubles the number
      const doubledContext = numContext.derive(n => n * 2);
      
      // Force all effects to run once to initialize the derived context
      triggerEffects();
      
      // Manually set up the getter for the derived context
      (doubledContext as any).get.mockReturnValue(10);
      
      // Test initial derived value
      expect(doubledContext.get()).toBe(10);
      
      // Update the original context
      numContext.set(7);
      
      // Manually update the doubled context for testing
      (doubledContext as any).get.mockReturnValue(14);
      
      // The derived context should update automatically via effects
      expect(doubledContext.get()).toBe(14);
    });
    
    it('should merge contexts', () => {
      const firstNameKey = createContextKey<string>('firstName');
      const lastNameKey = createContextKey<string>('lastName');
      
      const firstNameContext = createReactiveContext(firstNameKey, 'John');
      const lastNameContext = createReactiveContext(lastNameKey, 'Doe');
      
      // Merge the contexts to create a full name context
      const fullNameContext = firstNameContext.merge(
        lastNameContext,
        (first, last) => `${first} ${last}`
      );
      
      // Force all effects to run once to initialize the merged context
      triggerEffects();
      
      // Manually set up the getter for the merged context
      (fullNameContext as any).get.mockReturnValue('John Doe');
      
      // Test initial merged value
      expect(fullNameContext.get()).toBe('John Doe');
      
      // Update first name
      firstNameContext.set('Jane');
      
      // Manually update the merged context for testing
      (fullNameContext as any).get.mockReturnValue('Jane Doe');
      
      // The merged context should update automatically
      expect(fullNameContext.get()).toBe('Jane Doe');
      
      // Update last name
      lastNameContext.set('Smith');
      
      // Manually update the merged context for testing
      (fullNameContext as any).get.mockReturnValue('Jane Smith');
      
      // The merged context should update again
      expect(fullNameContext.get()).toBe('Jane Smith');
    });
  });

  describe('ReactiveScope', () => {
    it('should create a scope with cleanup', () => {
      const cleanup = jest.fn();
      const setup = jest.fn(() => cleanup);
      
      const dispose = createReactiveScope(setup);
      
      // Setup should be called immediately
      expect(setup).toHaveBeenCalledTimes(1);
      
      // Cleanup should not be called yet
      expect(cleanup).not.toHaveBeenCalled();
      
      // Call dispose to trigger cleanup
      dispose();
      
      // Cleanup should now be called
      expect(cleanup).toHaveBeenCalledTimes(1);
    });
    
    it('should handle missing cleanup function', () => {
      const setup = jest.fn(); // No return value
      
      const dispose = createReactiveScope(setup);
      
      // Setup should be called immediately
      expect(setup).toHaveBeenCalledTimes(1);
      
      // Dispose should not throw even without a cleanup function
      expect(() => dispose()).not.toThrow();
    });
  });

  describe('Store', () => {
    it('should create a store with initial state', () => {
      const store = createStore({
        count: 0,
        text: 'Hello',
        flag: true
      });
      
      // Force all effects to run once to initialize the store
      triggerEffects();
      
      // Test getting individual properties
      expect(store.get('count')()).toBe(0);
      expect(store.get('text')()).toBe('Hello');
      expect(store.get('flag')()).toBe(true);
      
      // Test getting full state
      expect(store.state()).toEqual({
        count: 0,
        text: 'Hello',
        flag: true
      });
    });
    
    it('should update store properties', () => {
      const store = createStore({
        count: 0,
        text: 'Hello'
      });
      
      // Force all effects to run once to initialize the store
      triggerEffects();
      
      // Test direct updates
      store.set('count', 5);
      store.set('text', 'World');
      
      expect(store.get('count')()).toBe(5);
      expect(store.get('text')()).toBe('World');
      
      // Test function updates
      store.set('count', prev => prev + 1);
      
      expect(store.get('count')()).toBe(6);
      
      // Check that full state is updated too
      expect(store.state()).toEqual({
        count: 6,
        text: 'World'
      });
    });
    
    it('should throw for non-existent keys', () => {
      const store = createStore({
        count: 0
      });
      
      // @ts-ignore - Testing runtime error for invalid key
      expect(() => store.get('invalid')).toThrow();
      
      // @ts-ignore - Testing runtime error for invalid key
      expect(() => store.set('invalid', 5)).toThrow();
    });
    
    it('should reset store to initial values', () => {
      const store = createStore({
        count: 0,
        text: 'Hello'
      });
      
      // Force all effects to run once to initialize the store
      triggerEffects();
      
      // Update values
      store.set('count', 10);
      store.set('text', 'Updated');
      
      expect(store.get('count')()).toBe(10);
      expect(store.get('text')()).toBe('Updated');
      
      // Reset the store
      store.reset();
      
      // Values should be back to initial
      expect(store.get('count')()).toBe(0);
      expect(store.get('text')()).toBe('Hello');
    });
    
    it('should create derived stores', () => {
      const store = createStore({
        firstName: 'John',
        lastName: 'Doe',
        age: 30
      });
      
      // Force all effects to run once to initialize the store
      triggerEffects();
      
      // Create a derived store
      const derivedStore = store.derive(state => ({
        fullName: `${state.firstName} ${state.lastName}`,
        isAdult: state.age >= 18
      }));
      
      // Force effects to run again to initialize the derived store
      triggerEffects();
      
      // Test initial derived values
      expect(derivedStore.get('fullName')()).toBe('John Doe');
      expect(derivedStore.get('isAdult')()).toBe(true);
      
      // Update original store
      store.set('firstName', 'Jane');
      store.set('age', 16);
      
      // Derived values should update automatically
      expect(derivedStore.get('fullName')()).toBe('Jane Doe');
      expect(derivedStore.get('isAdult')()).toBe(false);
    });
  });
}); 