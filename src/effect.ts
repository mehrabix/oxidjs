import { queueMicrotask, Subscriber } from './utils';

/**
 * Effect function type
 */
export type EffectFunction<T = void> = () => T;

/**
 * Effect cleanup function type
 */
export type EffectCleanup = () => void;

/**
 * Effect options
 */
export interface EffectOptions {
  scheduler?: (effect: EffectFunction) => void;
  onCleanup?: (registerCleanup: (fn: EffectCleanup) => void) => void;
}

/**
 * Global tracking state
 */
let activeEffect: EffectFunction | null = null;
let effectStack: EffectFunction[] = [];

/**
 * Track the effect for a set of subscribers
 */
export function trackEffect<T>(subscribers: Set<Subscriber<T>>): void {
  if (activeEffect && !subscribers.has(activeEffect as Subscriber<T>)) {
    subscribers.add(activeEffect as Subscriber<T>);
  }
}

/**
 * Trigger effects for a set of subscribers
 */
export function triggerEffects<T>(
  subscribers: Set<Subscriber<T>>,
  value: T,
  prevValue?: T
): void {
  // Create a new Set to avoid issues if subscribers are modified during iteration
  const effects = new Set(subscribers);
  effects.forEach(effect => {
    if (effect !== activeEffect) {
      effect(value, prevValue);
    }
  });
}

/**
 * Detect if running in a test environment
 */
const isTestEnv = typeof process !== 'undefined' && process.env && 
  (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined);

/**
 * Run an effect synchronously
 */
function runSync(fn: EffectFunction): void {
  fn();
}

/**
 * Queue an effect to run in the next microtask
 */
function queueEffect(fn: EffectFunction): void {
  queueMicrotask(fn);
}

/**
 * Create and run an effect with automatic dependency tracking
 * @param fn The effect function to run
 * @param options Options for the effect
 * @returns A function to dispose the effect
 */
export function createEffect<T = void>(
  fn: EffectFunction<T>,
  options: EffectOptions = {}
): () => void {
  const { scheduler = queueEffect, onCleanup } = options;
  
  let cleanup: EffectCleanup | undefined;
  let isDisposed = false;
  
  // The actual effect function that will be executed
  const effect = () => {
    if (isDisposed) return;

    // Run cleanup if it exists before re-running the effect
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }
    
    // Save the current active effect
    const prevEffect = activeEffect;
    const prevStack = effectStack;
    
    // Set up the effect context
    activeEffect = effect;
    effectStack = [...prevStack, effect];
    
    try {
      const result = fn();
      
      // Handle cleanup registration
      if (onCleanup) {
        onCleanup((cleanupFn: EffectCleanup) => {
          cleanup = cleanupFn;
        });
      }
      
      return result;
    } finally {
      // Restore the previous effect context
      activeEffect = prevEffect;
      effectStack = prevStack;
    }
  };
  
  // Run the effect immediately
  effect();
  
  // Return a function to dispose the effect
  return () => {
    isDisposed = true;
    if (cleanup) {
      cleanup();
    }
  };
}

/**
 * Run a function once without tracking dependencies
 */
export function untrack<T>(fn: () => T): T {
  const prevEffect = activeEffect;
  activeEffect = null;
  try {
    return fn();
  } finally {
    activeEffect = prevEffect;
  }
}

/**
 * Get the current active effect
 */
export function getActiveEffect(): EffectFunction | null {
  return activeEffect;
} 