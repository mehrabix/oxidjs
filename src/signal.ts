import { batch } from './utils';
import { createEffect, trackEffect } from './effect';

/**
 * Detect if running in a test environment
 */
const isTestEnv = typeof process !== 'undefined' && process.env && 
  (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined);

/**
 * Signal interface with getter and setter functionality
 */
export interface Signal<T> extends ReadonlySignal<T> {
  /** Set a new value */
  (value: T | ((prev: T) => T)): T;
  /** Set a new value */
  value: T;
  /** Update value using a function */
  update: (fn: (prev: T) => T) => void;
}

/**
 * A read-only version of a signal
 */
export interface ReadonlySignal<T> {
  /** Get the current value */
  (): T;
  /** Get the current value */
  readonly value: T;
  /** Get the current value without tracking */
  peek: () => T;
  /** Subscribe to value changes */
  subscribe: (fn: (value: T) => void) => () => void;
}

/**
 * Creates a signal with a getter and setter
 */
export function createSignal<T>(initialValue: T): Signal<T> {
  let value = initialValue;
  const subscribers = new Set<(value: T) => void>();
  let isNotifying = false;

  const notify = (newValue: T) => {
    if (isNotifying) return;
    isNotifying = true;
    batch(() => {
      subscribers.forEach(fn => fn(newValue));
    });
    isNotifying = false;
  };

  // Create the signal function
  function signalFn(): T;
  function signalFn(nextValue: T | ((prev: T) => T)): T;
  function signalFn(nextValue?: T | ((prev: T) => T)): T {
    if (arguments.length === 0) {
      if (trackEffect) {
        trackEffect(subscribers);
      }
      return value;
    }

    const newValue = typeof nextValue === 'function'
      ? (nextValue as (prev: T) => T)(value)
      : nextValue as T;

    if (newValue === value) return value;
    value = newValue;
    notify(newValue);
    return value;
  }

  // Add signal properties
  Object.defineProperties(signalFn, {
    value: {
      get() {
        if (trackEffect) {
          trackEffect(subscribers);
        }
        return value;
      },
      set(newValue: T) {
        if (newValue === value) return;
        value = newValue;
        notify(newValue);
      },
      enumerable: true,
      configurable: true
    },
    peek: {
      value: () => value,
      enumerable: true,
      configurable: true
    },
    update: {
      value: (fn: (prev: T) => T) => {
        const newValue = fn(value);
        if (newValue === value) return;
        value = newValue;
        notify(newValue);
      },
      enumerable: true,
      configurable: true
    },
    subscribe: {
      value: (fn: (value: T) => void) => {
        subscribers.add(fn);
        fn(value); // Call immediately with current value
        return () => {
          subscribers.delete(fn);
        };
      },
      enumerable: true,
      configurable: true
    }
  });

  return signalFn as Signal<T>;
}

/**
 * Creates a signal pair with a getter and setter
 */
export function createSignalPair<T>(initialValue: T): [ReadonlySignal<T>, (value: T | ((prev: T) => T)) => T] {
  const signal = createSignal(initialValue);
  
  // Create read-only version
  const readonlySignal = Object.assign(
    () => signal(),
    {
      get value() {
        return signal.value;
      },
      set value(newValue: T) {
        throw new Error('Cannot set value of read-only signal');
      },
      peek: signal.peek,
      subscribe: signal.subscribe
    }
  ) as ReadonlySignal<T>;

  return [readonlySignal, signal];
}

/**
 * Creates a computed signal that automatically updates when dependencies change
 */
export function createComputed<T>(compute: () => T): ReadonlySignal<T> {
  const signal = createSignal<T>(undefined as T);
  let isComputing = false;

  createEffect(() => {
    if (isComputing) return;
    isComputing = true;
    signal(compute());
    isComputing = false;
  });

  // Create read-only version
  const readonlySignal = Object.assign(
    () => signal(),
    {
      get value() {
        return signal.value;
      },
      set value(newValue: T) {
        throw new Error('Cannot set value of computed signal');
      },
      peek: signal.peek,
      subscribe: signal.subscribe
    }
  ) as ReadonlySignal<T>;

  return readonlySignal;
}

/**
 * Creates a memoized signal that only updates when dependencies change
 */
export function createMemo<T>(compute: () => T): ReadonlySignal<T> {
  return createComputed(compute);
} 