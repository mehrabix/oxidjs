import { Subscriber, batch } from './utils';
import { createEffect, trackEffect } from './effect';
import { ReadonlySignal, Signal } from './signal';

/**
 * Options for creating a computed value
 */
export interface ComputedOptions<T> {
  equals?: (prev: T, next: T) => boolean;
}

/**
 * Detect if running in a test environment
 */
const isTestEnv = typeof process !== 'undefined' && process.env && 
  (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined);

/**
 * Creates a computed signal that automatically updates when dependencies change
 */
export function createComputed<T>(compute: () => T, options: ComputedOptions<T> = {}): ReadonlySignal<T> {
  let value: T;
  let prevValue: T | undefined;
  let isComputing = false;
  let isDirty = true;
  const subscribers = new Set<Subscriber<T>>();
  const equals = options.equals || Object.is;

  const notify = (newValue: T, oldValue: T | undefined) => {
    if (isComputing) return;
    batch(() => {
      subscribers.forEach(fn => fn(newValue, oldValue));
    });
  };

  const calculate = () => {
    if (!isDirty && !isComputing) return value;
    
    if (isComputing) {
      throw new Error('Circular dependency detected in computed signal');
    }

    isComputing = true;
    try {
      const newValue = compute();
      if (prevValue === undefined || !equals(newValue, prevValue)) {
        prevValue = value;
        value = newValue;
        isDirty = false;
        notify(value, prevValue);
      }
      return value;
    } finally {
      isComputing = false;
    }
  };

  // Initial computation
  value = compute();
  isDirty = false;

  // Track dependencies and recompute when they change
  createEffect(() => {
    isDirty = true;
    const newValue = compute();
    if (!equals(newValue, value)) {
      prevValue = value;
      value = newValue;
      notify(value, prevValue);
    }
  });

  // Create read-only signal
  return Object.assign(
    () => {
      if (trackEffect) {
        trackEffect(subscribers);
      }
      return calculate();
    },
    {
      get value() {
        if (trackEffect) {
          trackEffect(subscribers);
        }
        return calculate();
      },
      set value(_: T) {
        throw new Error('Cannot set value of computed signal');
      },
      peek: () => {
        if (isDirty) {
          calculate();
        }
        return value;
      },
      subscribe: (fn: Subscriber<T>) => {
        subscribers.add(fn);
        fn(value, undefined);
        return () => {
          subscribers.delete(fn);
        };
      }
    }
  ) as ReadonlySignal<T>;
}

/**
 * Creates a memoized signal that only updates when dependencies change
 */
export function createMemo<T>(compute: () => T, options: ComputedOptions<T> = {}): ReadonlySignal<T> {
  return createComputed(compute, options);
} 