import { isFunction } from './utils';
import { createEffect, EffectOptions, untrack } from './effect';
import { Signal } from './signal';

/**
 * Source that can be watched, including signals, refs, and getter functions
 */
export type WatchSource<T = any> = (() => T) | Signal<T> | { value: T };

/**
 * Source value accessor mapping
 */
type MapSources<T> = {
  [K in keyof T]: T[K] extends WatchSource<infer V> ? V : never;
};

/**
 * Options for the watch function
 */
export interface WatchOptions extends EffectOptions {
  immediate?: boolean;
  deep?: boolean;
}

/**
 * Watch one or more reactive sources and run a callback when they change
 * @param source The source(s) to watch
 * @param callback The callback to run when the source changes
 * @param options Options for the watch
 * @returns A function to stop watching
 */
export function watch<T>(
  source: WatchSource<T>,
  callback: (value: T, oldValue: T | undefined) => void,
  options: WatchOptions = {}
): () => void {
  return doWatch(source, callback, options);
}

/**
 * Watch multiple sources and run a callback when any of them change
 * @param sources An array of sources to watch
 * @param callback The callback to run when any source changes
 * @param options Options for the watch
 * @returns A function to stop watching
 */
export function watchSources<T extends ReadonlyArray<WatchSource>>(
  sources: T,
  callback: (values: MapSources<T>, oldValues: MapSources<T>) => void,
  options: WatchOptions = {}
): () => void {
  return doWatch(sources, callback, options);
}

/**
 * Internal watch implementation
 */
function doWatch<T = any>(
  source: T | WatchSource<T> | WatchSource<T>[],
  callback: any,
  options: WatchOptions
): () => void {
  const { immediate = false, deep = false, ...effectOptions } = options;
  
  let oldValue: any = undefined;
  let oldValues: any[] = [];
  let isFirstRun = true;
  
  // Getter for the source value
  const getter = () => {
    if (Array.isArray(source) && !isFunction(source)) {
      return source.map((s) => getWatchValue(s));
    }
    return getWatchValue(source as WatchSource);
  };
  
  // Call the callback with current and previous values
  const callCallback = (newValue: any) => {
    if (Array.isArray(source) && !isFunction(source)) {
      callback(newValue, oldValues);
      oldValues = [...newValue];
    } else {
      callback(newValue, oldValue);
      oldValue = newValue;
    }
  };
  
  // Create the effect to run when sources change
  const effect = () => {
    const newValue = getter();
    
    if (isFirstRun) {
      if (immediate) {
        untrack(() => callCallback(newValue));
      } else {
        if (Array.isArray(source) && !isFunction(source)) {
          oldValues = [...newValue];
        } else {
          oldValue = newValue;
        }
      }
      isFirstRun = false;
    } else {
      untrack(() => callCallback(newValue));
    }
    
    return newValue;
  };
  
  // Create and run the effect
  return createEffect(effect, effectOptions);
}

/**
 * Get the current value from a watch source
 */
function getWatchValue<T>(source: WatchSource<T>): T {
  if (isFunction(source)) {
    return source();
  }
  if ('value' in source) {
    return source.value;
  }
  if (typeof source === 'function') {
    return (source as any)();
  }
  return source as unknown as T;
} 