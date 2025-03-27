import { describe, expect, jest, test } from '@jest/globals';
import {
  createContextKey,
  createReactiveContext,
  createReactiveScope,
  createStore
} from '../src/reactiveContext';

// Mock effect module
jest.mock('../src/effect', () => {
  return {
    createEffect: jest.fn().mockImplementation((fn: any) => {
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
      const setter = jest.fn().mockImplementation((newValue: any) => {
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

// Mock utils module
jest.mock('../src/utils', () => {
  return {
    batch: jest.fn().mockImplementation((fn: any) => fn())
  };
});

describe('ReactiveContext', () => {
  describe('Context Keys', () => {
    test('should create unique context keys', () => {
      const key1 = createContextKey<string>('key1');
      const key2 = createContextKey<string>('key2');
      
      expect(key1).not.toBe(key2);
      expect(typeof key1).toBe('symbol');
      expect(typeof key2).toBe('symbol');
      expect(key1.description).toBe('key1');
      expect(key2.description).toBe('key2');
    });
  });
  
  describe('ReactiveContext', () => {
    test('should create reactive context with default value', () => {
      const key = createContextKey<string>('test');
      const context = createReactiveContext(key, 'default');
      
      expect(context.get()).toBe('default');
    });
    
    test('should provide and consume context values', () => {
      const key = createContextKey<string>('test');
      const context = createReactiveContext(key, 'default');
      
      // Function that uses the context
      const result = context.provide('provided', () => {
        return context.get();
      });
      
      expect(result).toBe('provided');
      // After the provide scope, it should be back to default
      expect(context.get()).toBe('default');
    });
    
    test('should create derived contexts', () => {
      const key = createContextKey<number>('test');
      const context = createReactiveContext(key, 10);
      
      // Create a derived context that doubles the value
      const derivedContext = context.derive(value => value * 2);
      
      expect(derivedContext.get()).toBe(20);
      
      // Updating the source context should update the derived context
      context.set(15);
      expect(derivedContext.get()).toBe(30);
    });
    
    test('should merge contexts', () => {
      const keyA = createContextKey<number>('a');
      const keyB = createContextKey<number>('b');
      
      const contextA = createReactiveContext(keyA, 5);
      const contextB = createReactiveContext(keyB, 10);
      
      // Create a merged context that adds the values
      const mergedContext = contextA.merge(contextB, (a, b) => a + b);
      
      expect(mergedContext.get()).toBe(15);
      
      // Updating the source contexts should update the merged context
      contextA.set(7);
      expect(mergedContext.get()).toBe(17);
      
      contextB.set(13);
      expect(mergedContext.get()).toBe(20);
    });
    
    test('should nest context providers', () => {
      const key = createContextKey<string>('test');
      const context = createReactiveContext(key, 'default');
      
      // Nested providers
      const result = context.provide('outer', () => {
        return context.provide('inner', () => {
          return context.get();
        });
      });
      
      expect(result).toBe('inner');
      // After all providers, it should be back to default
      expect(context.get()).toBe('default');
    });
  });
  
  describe('ReactiveScope', () => {
    test('should set up and clean up resources', () => {
      const setup = jest.fn();
      const cleanup = jest.fn();
      
      setup.mockReturnValue(cleanup);
      
      const dispose = createReactiveScope(setup);
      
      // Setup should be called
      expect(setup).toHaveBeenCalledTimes(1);
      
      // Cleanup not called yet
      expect(cleanup).not.toHaveBeenCalled();
      
      // Dispose should call cleanup
      dispose();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });
    
    test('should handle no cleanup function', () => {
      const setup = jest.fn();
      setup.mockReturnValue(undefined);
      
      const dispose = createReactiveScope(setup);
      
      // Setup should be called
      expect(setup).toHaveBeenCalledTimes(1);
      
      // Dispose should not throw
      expect(() => dispose()).not.toThrow();
    });
  });
  
  describe('Store', () => {
    test('should create a store with initial state', () => {
      const store = createStore({
        count: 0,
        text: 'hello'
      });
      
      expect(store.state()).toEqual({ count: 0, text: 'hello' });
      expect(store.get('count')()).toBe(0);
      expect(store.get('text')()).toBe('hello');
    });
    
    test('should update store values', () => {
      const store = createStore({
        count: 0,
        text: 'hello'
      });
      
      // Update with value
      store.set('count', 5);
      expect(store.get('count')()).toBe(5);
      
      // Update with function
      store.set('count', prev => prev + 2);
      expect(store.get('count')()).toBe(7);
      
      // State should have both updates
      expect(store.state()).toEqual({ count: 7, text: 'hello' });
    });
    
    test('should throw for non-existent keys', () => {
      const store = createStore({
        count: 0
      });
      
      // @ts-ignore - Testing runtime error for unknown key
      expect(() => store.get('unknown')).toThrow();
      
      // @ts-ignore - Testing runtime error for unknown key
      expect(() => store.set('unknown', 5)).toThrow();
    });
    
    test('should reset to initial values', () => {
      const store = createStore({
        count: 0,
        text: 'hello'
      });
      
      // Make some changes
      store.set('count', 10);
      store.set('text', 'world');
      
      // Reset
      store.reset();
      
      // Should be back to initial values
      expect(store.state()).toEqual({ count: 0, text: 'hello' });
    });
    
    test('should create derived stores', () => {
      const store = createStore({
        count: 5,
        multiplier: 2
      });
      
      // Create derived store
      const derivedStore = store.derive(state => ({
        doubled: state.count * state.multiplier,
        isPositive: state.count > 0
      }));
      
      // Check derived values
      expect(derivedStore.state()).toEqual({
        doubled: 10,
        isPositive: true
      });
      
      // Update source store
      store.set('count', 10);
      expect(derivedStore.state().doubled).toBe(20);
      
      store.set('multiplier', 3);
      expect(derivedStore.state().doubled).toBe(30);
      
      // Negative value should update isPositive
      store.set('count', -5);
      expect(derivedStore.state().isPositive).toBe(false);
    });
  });
}); 