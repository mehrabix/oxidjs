import { ReadonlySignal } from './signal';
import { createComputed } from './computed';

/**
 * Type for injection key
 */
export interface InjectionKey<_T> extends Symbol {}

/**
 * Global context for dependency injection
 */
const globalContext = new Map<InjectionKey<any> | string, any>();

/**
 * Scope contexts for hierarchical dependency injection
 */
const scopeStack: Map<InjectionKey<any> | string, any>[] = [];

/**
 * Create an injection key with a specific type
 * @param description Optional description for debugging
 * @returns A typed injection key
 */
export function createInjectionKey<T>(description?: string): InjectionKey<T> {
  return Symbol(description) as InjectionKey<T>;
}

/**
 * Provide a value in the current scope
 * @param key The injection key or string name
 * @param value The value to provide
 */
export function provide<T>(key: InjectionKey<T> | string, value: T): void {
  const currentScope = scopeStack[scopeStack.length - 1] || globalContext;
  currentScope.set(key, value);
}

/**
 * Inject a value from the closest scope that provides it
 * @param key The injection key or string name
 * @param defaultValue Optional default value if not provided
 * @returns The injected value
 */
export function inject<T>(key: InjectionKey<T> | string, defaultValue?: T): T {
  // Search from most specific to least specific scope
  for (let i = scopeStack.length - 1; i >= 0; i--) {
    const scope = scopeStack[i];
    if (scope.has(key)) {
      const value = scope.get(key);
      // For test compatibility, return the signal object directly if it's a signal
      if (typeof value === 'function' && 'subscribe' in value) {
        return value;
      }
      return value;
    }
  }
  
  // Check global context as fallback
  if (globalContext.has(key)) {
    const value = globalContext.get(key);
    // For test compatibility, return the signal object directly if it's a signal
    if (typeof value === 'function' && 'subscribe' in value) {
      return value;
    }
    return value;
  }
  
  // Return default value or throw error
  if (arguments.length > 1) {
    return defaultValue as T;
  }
  
  throw new Error(`Injection key "${key.toString()}" not found`);
}

/**
 * Create a new scope for dependency injection
 * @param callback Function to execute within the new scope
 * @returns The result of the callback
 */
export function createScope<T>(callback: () => T): T {
  const newScope = new Map<InjectionKey<any> | string, any>();
  scopeStack.push(newScope);
  
  try {
    return callback();
  } finally {
    scopeStack.pop();
  }
}

/**
 * Convert a value to a readonly signal
 */
function valueToSignal<T>(value: T): ReadonlySignal<T> {
  if (typeof value === 'function' && 'subscribe' in value && 'peek' in value) {
    return value as unknown as ReadonlySignal<T>;
  }
  return createComputed(() => value);
}

/**
 * Get the reactive value that's provided
 * @param key The injection key or string name
 * @param defaultValue Optional default value if not provided
 * @returns A readonly signal with the injected value
 */
export function injectSignal<T>(
  key: InjectionKey<T> | string,
  defaultValue?: T
): ReadonlySignal<T> {
  // Search from most specific to least specific scope
  for (let i = scopeStack.length - 1; i >= 0; i--) {
    const scope = scopeStack[i];
    if (scope.has(key)) {
      const value = scope.get(key);
      return valueToSignal(value);
    }
  }
  
  // Check global context as fallback
  if (globalContext.has(key)) {
    const value = globalContext.get(key);
    return valueToSignal(value);
  }
  
  // Return default value or throw error
  if (arguments.length > 1) {
    return valueToSignal(defaultValue as T);
  }
  
  throw new Error(`Injection key "${key.toString()}" not found`);
} 