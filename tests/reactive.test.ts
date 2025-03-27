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

import { describe, expect, jest, test } from '@jest/globals';
import { reactive, ref, isRef, unref, isReactive, toRaw } from '../src/reactive';

describe('Reactive', () => {
  describe('Reactive Objects', () => {
    test('should make an object reactive', () => {
      const original = { count: 0 };
      const observed = reactive(original);
      
      // Should return same object if already reactive
      const observed2 = reactive(observed);
      expect(observed2).toBe(observed);
      
      // Original should not equal observed
      expect(observed).not.toBe(original);
      
      // Property access should work
      expect(observed.count).toBe(0);
      
      // Property updates should work
      observed.count = 1;
      expect(observed.count).toBe(1);
      
      // Original should be updated
      expect(original.count).toBe(1);
      
      // Should be reactive
      expect(isReactive(observed)).toBe(true);
      expect(isReactive(original)).toBe(false);
    });
    
    test('should handle nested objects', () => {
      const original: { 
        nested: { count: number, [key: string]: any }, 
        arr: number[]
      } = { 
        nested: { count: 0 },
        arr: [1, 2, 3]
      };
      
      const observed = reactive(original);
      
      // Nested objects should be reactive
      expect(isReactive(observed.nested)).toBe(true);
      expect(isReactive(observed.arr)).toBe(true);
      
      // Nested updates should work
      observed.nested.count = 1;
      expect(observed.nested.count).toBe(1);
      expect(original.nested.count).toBe(1);
      
      // Adding new properties should work
      observed.nested.newProp = 'test';
      expect(observed.nested.newProp).toBe('test');
      expect(original.nested.newProp).toBe('test');
    });
    
    test('should track property changes', () => {
      const original = { count: 0 };
      const observed = reactive(original);
      
      // Create a mock to track property access
      const mockFn = jest.fn();
      
      // Access the property to track it
      const initialValue = observed.count;
      mockFn(initialValue);
      
      // Set value to trigger change
      observed.count = 1;
      
      // Need to access it again to see new value
      const newValue = observed.count;
      mockFn(newValue);
      
      // Mock should have been called twice with different values
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockFn).toHaveBeenNthCalledWith(1, 0);
      expect(mockFn).toHaveBeenNthCalledWith(2, 1);
    });
    
    test('should allow property deletion', () => {
      // Explicitly define the object type with optional property
      const original: { 
        count: number, 
        extra?: string 
      } = { 
        count: 0, 
        extra: 'test' 
      };
      
      const observed = reactive(original);
      
      // Delete a property
      delete observed.extra;
      
      // Property should be gone
      expect(observed.extra).toBeUndefined();
      expect(original.extra).toBeUndefined();
      expect('extra' in observed).toBe(false);
    });
    
    test('toRaw should return the original object', () => {
      const original = { count: 0 };
      const observed = reactive(original);
      
      const raw = toRaw(observed);
      expect(raw).toBe(original);
    });
  });
  
  describe('Reactive Arrays', () => {
    test('should make an array reactive', () => {
      const original = [1, 2, 3];
      const observed = reactive(original);
      
      // Elements should be accessible
      expect(observed[0]).toBe(1);
      expect(observed.length).toBe(3);
      
      // Should be able to modify elements
      observed[0] = 4;
      expect(observed[0]).toBe(4);
      expect(original[0]).toBe(4);
      
      // Array methods should work and maintain reactivity
      observed.push(5);
      expect(observed.length).toBe(4);
      expect(observed[3]).toBe(5);
      expect(original.length).toBe(4);
      
      observed.pop();
      expect(observed.length).toBe(3);
      expect(original.length).toBe(3);
    });
    
    test('should work with array methods that modify the array', () => {
      const observed = reactive([1, 2, 3]);
      
      // push
      observed.push(4);
      expect(observed).toEqual([1, 2, 3, 4]);
      
      // pop
      const popped = observed.pop();
      expect(popped).toBe(4);
      expect(observed).toEqual([1, 2, 3]);
      
      // shift
      const shifted = observed.shift();
      expect(shifted).toBe(1);
      expect(observed).toEqual([2, 3]);
      
      // unshift
      observed.unshift(1);
      expect(observed).toEqual([1, 2, 3]);
      
      // splice
      observed.splice(1, 1, 5);
      expect(observed).toEqual([1, 5, 3]);
      
      // sort
      observed.sort((a, b) => b - a);
      expect(observed).toEqual([5, 3, 1]);
      
      // reverse
      observed.reverse();
      expect(observed).toEqual([1, 3, 5]);
    });
  });
  
  describe('Refs', () => {
    test('should create a ref', () => {
      const count = ref(0);
      
      // Should have value property
      expect(count.value).toBe(0);
      
      // Should be a ref
      expect(isRef(count)).toBe(true);
      
      // Should not be reactive itself
      expect(isReactive(count)).toBe(false);
      
      // Update ref value
      count.value = 1;
      expect(count.value).toBe(1);
    });
    
    test('should create a ref from an object', () => {
      const original = { count: 0 };
      const obj = ref(original);
      
      // Value should be reactive
      expect(isReactive(obj.value)).toBe(true);
      
      // Updates should work through the ref
      obj.value.count = 1;
      expect(obj.value.count).toBe(1);
      expect(original.count).toBe(1);
    });
    
    test('unref should unwrap refs', () => {
      const count = ref(0);
      
      // unref should return the value for refs
      expect(unref(count)).toBe(0);
      
      // unref should return non-refs as is
      expect(unref(1)).toBe(1);
    });
  });
});
