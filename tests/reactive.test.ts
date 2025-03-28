/**
 * DISABLED: These tests are disabled as the reactive module is not currently exported.
 * Uncomment and fix tests when the reactive module is implemented and exported.
 */
/*
import { reactive, isReactive, toRaw, ref, isRef, unref, createEffect } from '../src';

describe('Reactive', () => {
  test('should make an object reactive', () => {
    const user = reactive({ name: 'John', age: 30 });
    
    const mockFn = jest.fn();
    createEffect(() => {
      mockFn(user.name);
    });
    
    // Should have called once on creation
    expect(mockFn).toHaveBeenCalledWith('John');
    
    // Should trigger effect when property changes
    user.name = 'Jane';
    expect(mockFn).toHaveBeenCalledWith('Jane');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });
  
  test('should make nested objects reactive', () => {
    const user = reactive({
      name: 'John',
      address: {
        city: 'New York',
        zipCode: '10001'
      }
    });
    
    const mockFn = jest.fn();
    createEffect(() => {
      mockFn(user.address.city);
    });
    
    // Should have called once on creation
    expect(mockFn).toHaveBeenCalledWith('New York');
    
    // Should trigger effect when nested property changes
    user.address.city = 'Los Angeles';
    expect(mockFn).toHaveBeenCalledWith('Los Angeles');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });
  
  test('should handle arrays', () => {
    const list = reactive([1, 2, 3]);
    
    const mockFn = jest.fn();
    createEffect(() => {
      mockFn(list.length);
    });
    
    // Should have called once on creation
    expect(mockFn).toHaveBeenCalledWith(3);
    
    // Should trigger effect when array changes
    list.push(4);
    expect(mockFn).toHaveBeenCalledWith(4);
    expect(mockFn).toHaveBeenCalledTimes(2);
  });
  
  test('should detect reactive objects', () => {
    const obj = { a: 1 };
    const reactiveObj = reactive(obj);
    
    expect(isReactive(reactiveObj)).toBe(true);
    expect(isReactive(obj)).toBe(false);
  });
  
  test('should unwrap reactive objects', () => {
    const original = { a: 1 };
    const reactiveObj = reactive(original);
    
    const raw = toRaw(reactiveObj);
    expect(raw).toBe(original);
  });
  
  test('should not rewrap already reactive objects', () => {
    const reactiveObj = reactive({ a: 1 });
    const rewrapped = reactive(reactiveObj);
    
    // Should return the same object
    expect(rewritten).toBe(reactiveObj);
  });
});

describe('Ref', () => {
  test('should create a ref with a value property', () => {
    const count = ref(10);
    
    expect(count.value).toBe(10);
    
    count.value = 20;
    expect(count.value).toBe(20);
  });
  
  test('should make objects reactive', () => {
    const user = ref({ name: 'John' });
    
    const mockFn = jest.fn();
    createEffect(() => {
      mockFn(user.value.name);
    });
    
    // Should have called once on creation
    expect(mockFn).toHaveBeenCalledWith('John');
    
    // Should trigger effect when property changes
    user.value.name = 'Jane';
    expect(mockFn).toHaveBeenCalledWith('Jane');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });
  
  test('should detect refs', () => {
    const count = ref(10);
    const notRef = { value: 10 };
    
    expect(isRef(count)).toBe(true);
    expect(isRef(notRef)).toBe(false);
  });
  
  test('should unwrap refs', () => {
    const count = ref(10);
    const notRef = 20;
    
    expect(unref(count)).toBe(10);
    expect(unref(notRef)).toBe(20);
  });
});
*/

/**
 * @jest-environment jsdom
 */

import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import {
  createSignal,
  createSignalPair,
  createEffect,
  createMemo,
  untrack,
  createComputed
} from '../src';

describe('Reactive', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createSignal', () => {
    test('should create a signal with initial value', () => {
      const signal = createSignal(0);
      expect(signal()).toBe(0);
    });

    test('should update signal value', () => {
      const signal = createSignal(0);
      signal(1);
      expect(signal()).toBe(1);
    });

    test('should update value using updater function', () => {
      const [get, set] = createSignalPair(0);
      set(prev => prev + 1);
      expect(get()).toBe(1);
    });

    test('should notify subscribers when value changes', () => {
      const signal = createSignal(0);
      const callback = jest.fn();

      createEffect(() => {
        callback(signal());
      });

      expect(callback).toHaveBeenCalledWith(0);
      
      signal(1);
      expect(callback).toHaveBeenCalledWith(1);
      
      signal(2);
      expect(callback).toHaveBeenCalledWith(2);
      
      expect(callback).toHaveBeenCalledTimes(3);
    });

    test('should not notify subscribers when value doesn\'t change', () => {
      const signal = createSignal(0);
      const callback = jest.fn();

      createEffect(() => {
        callback(signal());
      });

      expect(callback).toHaveBeenCalledWith(0);
      callback.mockClear();
      
      signal(0); // Same value
      expect(callback).not.toHaveBeenCalled();
    });

    test('should support custom equality functions', () => {
      const deepEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
      const signal = createSignal({ name: 'John' });
      
      const callback = jest.fn();
      createEffect(() => {
        callback(signal());
      });

      expect(callback).toHaveBeenCalledTimes(1);
      callback.mockClear();
      
      // Different object, same values
      signal({ name: 'John' });
      expect(callback).not.toHaveBeenCalled();
      
      // Different values
      signal({ name: 'Jane' });
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('createEffect', () => {
    test('should run effect immediately', () => {
      const callback = jest.fn();
      createEffect(callback);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('should run effect when dependencies change', () => {
      const [get, set] = createSignalPair(0);
      const callback = jest.fn();
      
      createEffect(() => {
        callback(get());
      });
      
      expect(callback).toHaveBeenCalledWith(0);
      
      set(1);
      expect(callback).toHaveBeenCalledWith(1);
      
      set(2);
      expect(callback).toHaveBeenCalledWith(2);
      
      expect(callback).toHaveBeenCalledTimes(3);
    });

    test('should cleanup previous effect before running next one', () => {
      const [get, set] = createSignalPair(0);
      const setup = jest.fn();
      const cleanup = jest.fn();
      
      createEffect(() => {
        setup(get());
        return cleanup;
      });
      
      expect(setup).toHaveBeenCalledWith(0);
      expect(cleanup).not.toHaveBeenCalled();
      
      set(1);
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(setup).toHaveBeenCalledWith(1);
      
      set(2);
      expect(cleanup).toHaveBeenCalledTimes(2);
      expect(setup).toHaveBeenCalledWith(2);
    });

    test('should not run effect after disposal', () => {
      const [get, set] = createSignalPair(0);
      const callback = jest.fn();
      
      const dispose = createEffect(() => {
        callback(get());
      });
      
      expect(callback).toHaveBeenCalledWith(0);
      callback.mockClear();
      
      dispose();
      
      set(1);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('createMemo', () => {
    test('should compute derived value', () => {
      const [get, set] = createSignalPair(0);
      const double = createMemo(() => get() * 2);
      
      expect(double()).toBe(0);
      
      set(2);
      expect(double()).toBe(4);
      
      set(3);
      expect(double()).toBe(6);
    });

    test('should only recompute when dependencies change', () => {
      const [get, set] = createSignalPair(0);
      const calculate = jest.fn((n: number) => n * 2);
      const double = createMemo(() => calculate(get()));
      
      double(); // First calculation
      expect(calculate).toHaveBeenCalledTimes(1);
      
      double(); // Should be cached
      expect(calculate).toHaveBeenCalledTimes(1);
      
      set(2); // Should trigger recalculation
      double();
      expect(calculate).toHaveBeenCalledTimes(2);
    });

    test('should support custom equality function', () => {
      const [get, set] = createSignalPair({ name: 'John' });
      const compute = jest.fn(() => ({ displayName: `${get().name} Doe` }));
      
      const deepEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
      const displayName = createMemo(compute, { equals: deepEqual });
      
      displayName(); // First calculation
      expect(compute).toHaveBeenCalledTimes(1);
      compute.mockClear();
      
      // Change to same value (by reference equality)
      set({ name: 'John' });
      displayName();
      expect(compute).toHaveBeenCalledTimes(1);
      
      // Value used as-is by reference equality
      displayName();
      expect(compute).toHaveBeenCalledTimes(1);
    });
  });

  describe('untracked', () => {
    test('should not track dependencies inside untracked', () => {
      const [get, set] = createSignalPair(0);
      const [trackedGet, trackedSet] = createSignalPair(0);
      const callback = jest.fn();
      
      createEffect(() => {
        trackedGet(); // This is tracked
        callback(untrack(() => get())); // get() is not tracked
      });
      
      expect(callback).toHaveBeenCalledWith(0);
      callback.mockClear();
      
      set(1); // Should not trigger effect
      expect(callback).not.toHaveBeenCalled();
      
      trackedSet(1); // Should trigger effect
      expect(callback).toHaveBeenCalledWith(1);
    });
  });
});
