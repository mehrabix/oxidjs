import { createSignalPair, Signal, ReadonlySignal } from './signal';
import { createEffect } from './effect';
import { batch } from './utils';

/**
 * A context key for strongly-typed contexts
 */
export interface ContextKey<_T> extends Symbol {}

/**
 * Create a strongly-typed context key
 */
export function createContextKey<T>(description?: string): ContextKey<T> {
  return Symbol(description) as ContextKey<T>;
}

/**
 * Context value with reactive capabilities
 */
export interface ReactiveContext<T> {
  /** Get current context value */
  get: ReadonlySignal<T>;
  /** Update context value */
  set: (value: T | ((prev: T) => T)) => void;
  /** Run a function with a specific context value */
  provide: <R>(value: T, fn: () => R) => R;
  /** Create a derived context that transforms this context */
  derive: <R>(transform: (value: T) => R) => ReactiveContext<R>;
  /** Merge with another context */
  merge: <R>(other: ReactiveContext<R>, merger: (a: T, b: R) => T) => ReactiveContext<T>;
}

/**
 * Stack of contexts for each key
 */
const contextStacks = new Map<ContextKey<any>, any[]>();

/**
 * Get the current context value for a key
 */
function getCurrentContext<T>(key: ContextKey<T>): T | undefined {
  const stack = contextStacks.get(key);
  if (!stack || stack.length === 0) {
    return undefined;
  }
  return stack[stack.length - 1];
}

/**
 * Create a reactive context
 * 
 * @param key The context key
 * @param defaultValue Optional default value
 * @returns A reactive context object
 */
export function createReactiveContext<T>(
  key: ContextKey<T>,
  defaultValue?: T
): ReactiveContext<T> {
  // Initialize context stack if needed
  if (!contextStacks.has(key)) {
    contextStacks.set(key, defaultValue !== undefined ? [defaultValue] : []);
  }
  
  // Create signal for the context
  const [get, set] = createSignalPair<T>(
    getCurrentContext(key) ?? defaultValue as T
  );
  
  // Setup effect to track context changes
  createEffect(() => {
    const currentValue = getCurrentContext(key);
    if (currentValue !== undefined) {
      set(currentValue);
    } else if (defaultValue !== undefined) {
      set(defaultValue);
    }
  });
  
  // Run a function with a specific context value
  const provide = <R>(value: T, fn: () => R): R => {
    const stack = contextStacks.get(key) || [];
    contextStacks.set(key, [...stack, value]);
    
    try {
      // Use batching to avoid potential multiple updates
      return batch(() => fn());
    } finally {
      const currentStack = contextStacks.get(key) || [];
      contextStacks.set(key, currentStack.slice(0, -1));
    }
  };
  
  // Create a derived context
  const derive = <R>(transform: (value: T) => R): ReactiveContext<R> => {
    // Create a new context key for the derived context
    const derivedKey = createContextKey<R>(`${key.toString()}.derived`);
    
    // Create the derived context
    const derivedContext = createReactiveContext(derivedKey);
    
    // Keep the derived context in sync with the source
    createEffect(() => {
      const value = get();
      const transformed = transform(value);
      derivedContext.set(transformed);
    });
    
    return derivedContext;
  };
  
  // Merge with another context
  const merge = <R>(
    other: ReactiveContext<R>,
    merger: (a: T, b: R) => T
  ): ReactiveContext<T> => {
    // Create a new context key for the merged context
    const mergedKey = createContextKey<T>(`${key.toString()}.merged`);
    
    // Create the merged context
    const mergedContext = createReactiveContext(mergedKey);
    
    // Keep the merged context in sync with both source contexts
    createEffect(() => {
      const valueA = get();
      const valueB = other.get();
      const merged = merger(valueA, valueB);
      mergedContext.set(merged);
    });
    
    return mergedContext;
  };
  
  return { get, set, provide, derive, merge };
}

/**
 * Create a reactive scope that automatically cleans up
 * 
 * @param setup Setup function that returns a cleanup function
 * @returns Function to manually trigger cleanup
 */
export function createReactiveScope(
  setup: () => (() => void) | void
): () => void {
  const cleanupFn = setup();
  return () => {
    if (cleanupFn) cleanupFn();
  };
}

/**
 * Automatically share reactive state between components/modules
 */
export interface Store<T extends Record<string, any>> {
  /** Get a specific state property */
  get<K extends keyof T>(key: K): ReadonlySignal<T[K]>;
  /** Set a specific state property */
  set<K extends keyof T>(key: K, value: T[K] | ((prev: T[K]) => T[K])): void;
  /** Get the entire state object */
  state: ReadonlySignal<T>;
  /** Reset the store to initial values */
  reset(): void;
  /** Create a derived store */
  derive<R extends Record<string, any>>(
    derivation: (state: T) => R
  ): Store<R>;
}

/**
 * Create a reactive store for global/shared state
 * 
 * @param initialState Initial state object
 * @returns A reactive store
 */
export function createStore<T extends Record<string, any>>(
  initialState: T
): Store<T> {
  // Create signals for each state property
  const signals = new Map<keyof T, [Signal<any>, (value: any) => void]>();
  
  for (const key in initialState) {
    if (Object.prototype.hasOwnProperty.call(initialState, key)) {
      signals.set(key, createSignalPair(initialState[key]));
    }
  }
  
  // Get a specific state property
  const get = <K extends keyof T>(key: K): ReadonlySignal<T[K]> => {
    if (!signals.has(key)) {
      throw new Error(`Store key "${String(key)}" does not exist`);
    }
    return signals.get(key)![0] as ReadonlySignal<T[K]>;
  };
  
  // Set a specific state property
  const set = <K extends keyof T>(
    key: K,
    value: T[K] | ((prev: T[K]) => T[K])
  ): void => {
    if (!signals.has(key)) {
      throw new Error(`Store key "${String(key)}" does not exist`);
    }
    
    const setter = signals.get(key)![1];
    
    if (typeof value === 'function') {
      const prevValue = signals.get(key)![0]();
      setter((value as Function)(prevValue));
    } else {
      setter(value);
    }
  };
  
  // Create a signal for the full state
  const [state, setState] = createSignalPair<T>({...initialState});
  
  // Keep the full state signal in sync
  for (const key in initialState) {
    if (Object.prototype.hasOwnProperty.call(initialState, key)) {
      const signal = signals.get(key)![0];
      
      createEffect(() => {
        const value = signal();
        setState(prev => ({...prev, [key]: value}));
      });
    }
  }
  
  // Reset the store to initial values
  const reset = (): void => {
    batch(() => {
      for (const key in initialState) {
        if (Object.prototype.hasOwnProperty.call(initialState, key)) {
          set(key, initialState[key]);
        }
      }
    });
  };
  
  // Create a derived store
  const derive = <R extends Record<string, any>>(
    derivation: (state: T) => R
  ): Store<R> => {
    // Create the derived store
    const derivedInitialState = derivation({...initialState});
    const derivedStore = createStore(derivedInitialState);
    
    // Keep the derived store in sync with the source
    createEffect(() => {
      const currentState = state();
      const derivedState = derivation(currentState);
      
      // Update all the derived state properties
      batch(() => {
        for (const key in derivedState) {
          if (Object.prototype.hasOwnProperty.call(derivedState, key)) {
            derivedStore.set(key, derivedState[key]);
          }
        }
      });
    });
    
    return derivedStore;
  };
  
  return { get, set, state, reset, derive };
} 