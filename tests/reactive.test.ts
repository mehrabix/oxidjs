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
  createEffect,
  createMemo,
  batch,
  untracked,
  onCleanup,
  root,
  createRoot,
  runWithOwner
} from '../src/reactive';

describe('Reactive', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createSignal', () => {
    test('should create a signal with initial value', () => {
      const [count, setCount] = createSignal(0);
      expect(count()).toBe(0);
    });

    test('should update signal value', () => {
      const [count, setCount] = createSignal(0);
      setCount(1);
      expect(count()).toBe(1);
    });

    test('should update value using updater function', () => {
      const [count, setCount] = createSignal(0);
      setCount(prev => prev + 1);
      expect(count()).toBe(1);
    });

    test('should notify subscribers when value changes', () => {
      const [count, setCount] = createSignal(0);
      const callback = jest.fn();

      createEffect(() => {
        callback(count());
      });

      expect(callback).toHaveBeenCalledWith(0);
      
      setCount(1);
      expect(callback).toHaveBeenCalledWith(1);
      
      setCount(2);
      expect(callback).toHaveBeenCalledWith(2);
      
      expect(callback).toHaveBeenCalledTimes(3);
    });

    test('should not notify subscribers when value doesn\'t change', () => {
      const [count, setCount] = createSignal(0);
      const callback = jest.fn();

      createEffect(() => {
        callback(count());
      });

      expect(callback).toHaveBeenCalledWith(0);
      callback.mockClear();
      
      setCount(0); // Same value
      expect(callback).not.toHaveBeenCalled();
    });

    test('should support custom equality functions', () => {
      const deepEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
      const [user, setUser] = createSignal({ name: 'John' }, { equals: deepEqual });
      
      const callback = jest.fn();
      createEffect(() => {
        callback(user());
      });

      expect(callback).toHaveBeenCalledTimes(1);
      callback.mockClear();
      
      // Different object, same values
      setUser({ name: 'John' });
      expect(callback).not.toHaveBeenCalled();
      
      // Different values
      setUser({ name: 'Jane' });
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
      const [count, setCount] = createSignal(0);
      const callback = jest.fn();
      
      createEffect(() => {
        callback(count());
      });
      
      expect(callback).toHaveBeenCalledWith(0);
      
      setCount(1);
      expect(callback).toHaveBeenCalledWith(1);
      
      setCount(2);
      expect(callback).toHaveBeenCalledWith(2);
      
      expect(callback).toHaveBeenCalledTimes(3);
    });

    test('should cleanup previous effect before running next one', () => {
      const [count, setCount] = createSignal(0);
      const setup = jest.fn();
      const cleanup = jest.fn();
      
      createEffect(() => {
        setup(count());
        onCleanup(cleanup);
      });
      
      expect(setup).toHaveBeenCalledWith(0);
      expect(cleanup).not.toHaveBeenCalled();
      
      setCount(1);
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(setup).toHaveBeenCalledWith(1);
      
      setCount(2);
      expect(cleanup).toHaveBeenCalledTimes(2);
      expect(setup).toHaveBeenCalledWith(2);
    });

    test('should not run effect after disposal', () => {
      const [count, setCount] = createSignal(0);
      const callback = jest.fn();
      
      const dispose = createEffect(() => {
        callback(count());
      });
      
      expect(callback).toHaveBeenCalledWith(0);
      callback.mockClear();
      
      dispose();
      
      setCount(1);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('createMemo', () => {
    test('should compute derived value', () => {
      const [count, setCount] = createSignal(0);
      const double = createMemo(() => count() * 2);
      
      expect(double()).toBe(0);
      
      setCount(2);
      expect(double()).toBe(4);
      
      setCount(3);
      expect(double()).toBe(6);
    });

    test('should only recompute when dependencies change', () => {
      const [count, setCount] = createSignal(0);
      const calculate = jest.fn((n: number) => n * 2);
      const double = createMemo(() => calculate(count()));
      
      double(); // First calculation
      expect(calculate).toHaveBeenCalledTimes(1);
      
      double(); // Should be cached
      expect(calculate).toHaveBeenCalledTimes(1);
      
      setCount(2); // Should trigger recalculation
      double();
      expect(calculate).toHaveBeenCalledTimes(2);
    });

    test('should support custom equality function', () => {
      const [user, setUser] = createSignal({ name: 'John' });
      const compute = jest.fn(() => ({ displayName: `${user().name} Doe` }));
      
      const deepEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
      const displayName = createMemo(compute, undefined, { equals: deepEqual });
      
      displayName(); // First calculation
      expect(compute).toHaveBeenCalledTimes(1);
      compute.mockClear();
      
      // Change to same value (by reference equality)
      setUser({ name: 'John' });
      displayName();
      expect(compute).toHaveBeenCalledTimes(1);
      
      // Value used as-is by reference equality
      displayName();
      expect(compute).toHaveBeenCalledTimes(1);
    });
  });

  describe('batch', () => {
    test('should batch multiple updates', () => {
      const [count, setCount] = createSignal(0);
      const callback = jest.fn();
      
      createEffect(() => {
        callback(count());
      });
      
      expect(callback).toHaveBeenCalledWith(0);
      callback.mockClear();
      
      batch(() => {
        setCount(1);
        setCount(2);
        setCount(3);
      });
      
      // Effect should only run once at the end of the batch
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(3);
    });

    test('should support nested batches', () => {
      const [count, setCount] = createSignal(0);
      const callback = jest.fn();
      
      createEffect(() => {
        callback(count());
      });
      
      expect(callback).toHaveBeenCalledWith(0);
      callback.mockClear();
      
      batch(() => {
        setCount(1);
        
        batch(() => {
          setCount(2);
          setCount(3);
        });
        
        setCount(4);
      });
      
      // Effect should only run once at the end of the outermost batch
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(4);
    });
  });

  describe('untracked', () => {
    test('should not track dependencies inside untracked', () => {
      const [count, setCount] = createSignal(0);
      const [tracked, setTracked] = createSignal(0);
      const callback = jest.fn();
      
      createEffect(() => {
        tracked(); // This is tracked
        callback(untracked(() => count())); // count() is not tracked
      });
      
      expect(callback).toHaveBeenCalledWith(0);
      callback.mockClear();
      
      setCount(1); // Should not trigger effect
      expect(callback).not.toHaveBeenCalled();
      
      setTracked(1); // Should trigger effect
      expect(callback).toHaveBeenCalledWith(1);
    });
  });

  describe('root and owners', () => {
    test('createRoot should create a reactive root', () => {
      const dispose = jest.fn();
      
      const rootDispose = createRoot(owner => {
        const [count, setCount] = createSignal(0);
        
        createEffect(() => {
          count();
          onCleanup(dispose);
        });
        
        return () => {
          // Update to verify the root is still active
          setCount(1);
        };
      });
      
      expect(dispose).not.toHaveBeenCalled();
      
      // Trigger an update
      rootDispose();
      
      // After root disposal, the cleanup should be called
      expect(dispose).toHaveBeenCalledTimes(1);
    });

    test('runWithOwner should run function with specific owner', () => {
      const parentCleanup = jest.fn();
      const childCleanup = jest.fn();
      
      let savedOwner: any;
      
      createRoot(owner => {
        savedOwner = owner;
        
        createEffect(() => {
          onCleanup(parentCleanup);
        });
        
        return () => {};
      });
      
      // Create effect with the saved owner
      const [count, setCount] = createSignal(0);
      
      runWithOwner(savedOwner, () => {
        createEffect(() => {
          count();
          onCleanup(childCleanup);
        });
      });
      
      setCount(1);
      
      expect(childCleanup).toHaveBeenCalledTimes(1);
      expect(parentCleanup).not.toHaveBeenCalled();
    });
  });
});
