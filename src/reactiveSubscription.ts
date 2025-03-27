import { ReadonlySignal, createSignalPair } from './signal';
import { createEffect } from './effect';

/**
 * A function to unsubscribe or clean up a subscription
 */
export type Unsubscribe = () => void;

/**
 * A subscription with an associated cleanup function
 */
export interface Subscription {
  /** Unique identifier for this subscription */
  id: string;
  /** Optional name for debugging */
  name?: string;
  /** When this subscription was created */
  createdAt: number;
  /** Clean up this subscription */
  unsubscribe: Unsubscribe;
  /** Whether the subscription is active */
  active: boolean;
}

/**
 * A subscription group for managing related subscriptions
 */
export interface SubscriptionGroup {
  /** Unique identifier for this group */
  id: string;
  /** Human-readable name */
  name: string;
  /** All subscriptions in this group */
  subscriptions: Map<string, Subscription>;
  /** When this group was created */
  createdAt: number;
  /** Whether all subscriptions in this group are active */
  active: boolean;
}

/**
 * Subscription manager state
 */
export interface SubscriptionManagerState {
  /** All active subscriptions */
  subscriptions: Map<string, Subscription>;
  /** Subscription groups */
  groups: Map<string, SubscriptionGroup>;
  /** Whether all subscriptions are active */
  active: boolean;
}

/**
 * A subscription manager
 */
export interface SubscriptionManager {
  /** Add a subscription */
  add: (
    unsubscribeFn: Unsubscribe,
    options?: { id?: string; name?: string; group?: string }
  ) => string;
  
  /** Remove a subscription by ID */
  remove: (id: string) => boolean;
  
  /** Pause a subscription without removing it */
  pause: (id: string) => boolean;
  
  /** Resume a paused subscription */
  resume: (id: string) => boolean;
  
  /** Pause all subscriptions */
  pauseAll: () => void;
  
  /** Resume all subscriptions */
  resumeAll: () => void;
  
  /** Clean up all subscriptions */
  cleanup: () => void;
  
  /** Create a subscription group */
  createGroup: (name: string, id?: string) => string;
  
  /** Add subscription to a group */
  addToGroup: (subscriptionId: string, groupId: string) => boolean;
  
  /** Remove subscription from a group */
  removeFromGroup: (subscriptionId: string, groupId: string) => boolean;
  
  /** Pause all subscriptions in a group */
  pauseGroup: (groupId: string) => boolean;
  
  /** Resume all subscriptions in a group */
  resumeGroup: (groupId: string) => boolean;
  
  /** Get active state */
  isActive: ReadonlySignal<boolean>;
  
  /** Get all subscriptions */
  getSubscriptions: () => Map<string, Subscription>;
  
  /** Get all groups */
  getGroups: () => Map<string, SubscriptionGroup>;
  
  /** Get a specific subscription */
  getSubscription: (id: string) => Subscription | undefined;
  
  /** Get a specific group */
  getGroup: (id: string) => SubscriptionGroup | undefined;
}

/**
 * Generate a unique ID for subscriptions or groups
 */
function generateId(prefix: string = 'sub'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a subscription manager
 */
export function createSubscriptionManager(): SubscriptionManager {
  // State
  const subscriptions = new Map<string, Subscription>();
  const groups = new Map<string, SubscriptionGroup>();
  const [getActive, setActive] = createSignalPair(true);
  
  /**
   * Add a new subscription
   */
  function add(
    unsubscribeFn: Unsubscribe,
    options: { id?: string; name?: string; group?: string } = {}
  ): string {
    const { id = generateId(), name, group } = options;
    
    // Create the subscription
    const subscription: Subscription = {
      id,
      name,
      createdAt: Date.now(),
      unsubscribe: unsubscribeFn,
      active: getActive()
    };
    
    // Add to subscriptions map
    subscriptions.set(id, subscription);
    
    // Add to specified group if provided
    if (group && groups.has(group)) {
      addToGroup(id, group);
    }
    
    return id;
  }
  
  /**
   * Remove a subscription by ID
   */
  function remove(id: string): boolean {
    if (!subscriptions.has(id)) {
      return false;
    }
    
    // Get the subscription
    const subscription = subscriptions.get(id)!;
    
    // Clean up first
    if (subscription.active) {
      try {
        subscription.unsubscribe();
      } catch (err) {
        console.error(`Error unsubscribing from ${id}:`, err);
      }
    }
    
    // Remove from any groups it's in
    for (const group of groups.values()) {
      if (group.subscriptions.has(id)) {
        group.subscriptions.delete(id);
      }
    }
    
    // Remove from main map
    subscriptions.delete(id);
    
    return true;
  }
  
  /**
   * Pause a subscription
   */
  function pause(id: string): boolean {
    if (!subscriptions.has(id)) {
      return false;
    }
    
    const subscription = subscriptions.get(id)!;
    
    if (subscription.active) {
      try {
        subscription.unsubscribe();
      } catch (err) {
        console.error(`Error pausing subscription ${id}:`, err);
      }
      
      // Update active state
      subscription.active = false;
      subscriptions.set(id, subscription);
    }
    
    return true;
  }
  
  /**
   * Resume a subscription
   */
  function resume(id: string): boolean {
    if (!subscriptions.has(id)) {
      return false;
    }
    
    const subscription = subscriptions.get(id)!;
    
    if (!subscription.active && getActive()) {
      // We can't actually reactivate the subscription since we don't store
      // the original subscription logic, just the cleanup function.
      // This is intentional - subscriptions should be designed to be disposable.
      console.warn(
        `Cannot resume subscription ${id} - subscriptions are not resumable by default`
      );
      
      // Update active state anyway
      subscription.active = true;
      subscriptions.set(id, subscription);
    }
    
    return true;
  }
  
  /**
   * Pause all subscriptions
   */
  function pauseAll(): void {
    if (!getActive()) {
      return; // Already paused
    }
    
    // Update global active state
    setActive(false);
    
    // Pause all subscriptions
    for (const subscription of subscriptions.values()) {
      if (subscription.active) {
        try {
          subscription.unsubscribe();
        } catch (err) {
          console.error(`Error pausing subscription ${subscription.id}:`, err);
        }
        
        subscription.active = false;
      }
    }
    
    // Update groups
    for (const group of groups.values()) {
      group.active = false;
    }
  }
  
  /**
   * Resume all subscriptions
   */
  function resumeAll(): void {
    if (getActive()) {
      return; // Already active
    }
    
    // Update global active state
    setActive(true);
    
    // Mark subscriptions as active (can't actually reactivate them)
    for (const subscription of subscriptions.values()) {
      subscription.active = true;
    }
    
    // Update groups
    for (const group of groups.values()) {
      group.active = true;
    }
    
    console.warn(
      'Subscriptions have been marked as active, but they cannot be re-established automatically.'
    );
  }
  
  /**
   * Clean up all subscriptions
   */
  function cleanup(): void {
    // Clean up each active subscription
    for (const subscription of subscriptions.values()) {
      if (subscription.active) {
        try {
          subscription.unsubscribe();
        } catch (err) {
          console.error(`Error cleaning up subscription ${subscription.id}:`, err);
        }
      }
    }
    
    // Clear maps
    subscriptions.clear();
    groups.clear();
  }
  
  /**
   * Create a subscription group
   */
  function createGroup(name: string, id: string = generateId('group')): string {
    const group: SubscriptionGroup = {
      id,
      name,
      subscriptions: new Map(),
      createdAt: Date.now(),
      active: getActive()
    };
    
    groups.set(id, group);
    return id;
  }
  
  /**
   * Add a subscription to a group
   */
  function addToGroup(subscriptionId: string, groupId: string): boolean {
    if (!subscriptions.has(subscriptionId) || !groups.has(groupId)) {
      return false;
    }
    
    const subscription = subscriptions.get(subscriptionId)!;
    const group = groups.get(groupId)!;
    
    // Add to group
    group.subscriptions.set(subscriptionId, subscription);
    
    return true;
  }
  
  /**
   * Remove a subscription from a group
   */
  function removeFromGroup(subscriptionId: string, groupId: string): boolean {
    if (!groups.has(groupId)) {
      return false;
    }
    
    const group = groups.get(groupId)!;
    
    if (!group.subscriptions.has(subscriptionId)) {
      return false;
    }
    
    // Remove from group
    group.subscriptions.delete(subscriptionId);
    
    return true;
  }
  
  /**
   * Pause all subscriptions in a group
   */
  function pauseGroup(groupId: string): boolean {
    if (!groups.has(groupId)) {
      return false;
    }
    
    const group = groups.get(groupId)!;
    
    if (!group.active) {
      return true; // Already paused
    }
    
    // Pause each subscription in the group
    for (const subscription of group.subscriptions.values()) {
      if (subscription.active) {
        try {
          subscription.unsubscribe();
        } catch (err) {
          console.error(`Error pausing subscription ${subscription.id}:`, err);
        }
        
        subscription.active = false;
        subscriptions.set(subscription.id, subscription);
      }
    }
    
    // Update group state
    group.active = false;
    
    return true;
  }
  
  /**
   * Resume all subscriptions in a group
   */
  function resumeGroup(groupId: string): boolean {
    if (!groups.has(groupId)) {
      return false;
    }
    
    const group = groups.get(groupId)!;
    
    if (group.active) {
      return true; // Already active
    }
    
    // Can't actually resume the subscriptions
    console.warn(
      `Cannot resume subscriptions in group ${groupId} - subscriptions are not resumable by default`
    );
    
    // Mark as active anyway
    group.active = true;
    
    // Mark subscriptions as active
    for (const subscription of group.subscriptions.values()) {
      subscription.active = true;
      subscriptions.set(subscription.id, subscription);
    }
    
    return true;
  }
  
  /**
   * Get a specific subscription
   */
  function getSubscription(id: string): Subscription | undefined {
    return subscriptions.get(id);
  }
  
  /**
   * Get a specific group
   */
  function getGroup(id: string): SubscriptionGroup | undefined {
    return groups.get(id);
  }
  
  /**
   * Get all subscriptions
   */
  function getSubscriptions(): Map<string, Subscription> {
    return new Map(subscriptions);
  }
  
  /**
   * Get all groups
   */
  function getGroups(): Map<string, SubscriptionGroup> {
    return new Map(groups);
  }
  
  return {
    add,
    remove,
    pause,
    resume,
    pauseAll,
    resumeAll,
    cleanup,
    createGroup,
    addToGroup,
    removeFromGroup,
    pauseGroup,
    resumeGroup,
    isActive: getActive,
    getSubscriptions,
    getGroups,
    getSubscription,
    getGroup
  };
}

/**
 * A global subscription manager instance
 */
let globalManager: SubscriptionManager | null = null;

/**
 * Get the global subscription manager
 */
export function getSubscriptionManager(): SubscriptionManager {
  if (!globalManager) {
    globalManager = createSubscriptionManager();
  }
  return globalManager;
}

/**
 * Options for creating an auto-cleaning effect
 */
export interface AutoEffectOptions {
  /** Whether to run the effect immediately */
  immediate?: boolean;
  /** Name for debugging */
  name?: string;
  /** Group to add the subscription to */
  group?: string;
  /** Whether to ignore errors */
  ignoreErrors?: boolean;
}

/**
 * Create an effect that automatically cleans up when not needed
 */
export function createAutoEffect(
  effectFn: () => Unsubscribe | void,
  options: AutoEffectOptions = {}
): Unsubscribe {
  const {
    immediate = true,
    name,
    group,
    ignoreErrors = false
  } = options;
  
  // Get subscription manager
  const manager = getSubscriptionManager();
  
  // Create the effect
  let cleanup: Unsubscribe | void;
  let subId: string | null = null;
  
  // The actual effect that will run
  const runEffect = () => {
    // Clean up previous if any
    if (cleanup) {
      try {
        cleanup();
      } catch (err) {
        if (!ignoreErrors) {
          console.error('Error cleaning up previous effect:', err);
        }
      }
    }
    
    // Run the effect and get new cleanup
    try {
      cleanup = effectFn();
      
      // If it returned a cleanup function, register it
      if (typeof cleanup === 'function') {
        // Remove previous subscription if any
        if (subId) {
          manager.remove(subId);
        }
        
        // Register new cleanup
        subId = manager.add(cleanup, { name, group });
      }
    } catch (err) {
      if (!ignoreErrors) {
        console.error('Error in auto-effect:', err);
      }
    }
  };
  
  // Create reactive effect
  const dispose = createEffect(runEffect);
  
  // Initial run if requested
  if (immediate) {
    runEffect();
  }
  
  // Return function to dispose everything
  return () => {
    dispose();
    
    if (subId) {
      manager.remove(subId);
      subId = null;
    }
  };
}

/**
 * Create a subscription for a DOM event
 */
export function fromDOMEvent<K extends keyof HTMLElementEventMap>(
  element: HTMLElement | Window | Document,
  eventName: K, 
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
): Unsubscribe {
  element.addEventListener(eventName, handler as EventListener, options);
  
  return () => {
    element.removeEventListener(eventName, handler as EventListener, options);
  };
}

/**
 * Create a subscription for an interval
 */
export function fromInterval(
  callback: () => void,
  intervalMs: number
): Unsubscribe {
  const id = setInterval(callback, intervalMs);
  return () => clearInterval(id);
}

/**
 * Create a subscription for a timeout
 */
export function fromTimeout(
  callback: () => void,
  timeoutMs: number
): Unsubscribe {
  const id = setTimeout(callback, timeoutMs);
  return () => clearTimeout(id);
}

/**
 * Create a subscription for an observable-like object
 */
export function fromObservable<T>(
  observable: { subscribe: (observer: any) => any },
  observer: { next?: (value: T) => void; error?: (err: any) => void; complete?: () => void }
): Unsubscribe {
  const subscription = observable.subscribe(observer);
  
  return () => {
    if (subscription && typeof subscription.unsubscribe === 'function') {
      subscription.unsubscribe();
    }
  };
}

/**
 * Create a subscription that automatically unsubscribes when a signal becomes falsey
 */
export function untilSignalFalse<T>(
  signal: ReadonlySignal<T>,
  createSubscriptionFn: () => Unsubscribe
): Unsubscribe {
  let currentCleanup: Unsubscribe | null = null;
  
  // Watch the signal
  const dispose = createEffect(() => {
    const value = signal();
    
    // Clean up existing subscription if signal becomes falsey
    if (!value && currentCleanup) {
      currentCleanup();
      currentCleanup = null;
      return;
    }
    
    // Create new subscription if signal is truthy and no current subscription
    if (value && !currentCleanup) {
      currentCleanup = createSubscriptionFn();
    }
  });
  
  // Return function to clean up everything
  return () => {
    dispose();
    
    if (currentCleanup) {
      currentCleanup();
      currentCleanup = null;
    }
  };
}

/**
 * Create a subscription that automatically unsubscribes after a specified time
 */
export function autoExpire(
  createSubscriptionFn: () => Unsubscribe,
  expiryMs: number
): Unsubscribe {
  let subscription: Unsubscribe | null = null;
  let timeoutId: ReturnType<typeof setTimeout>;
  
  // Create the subscription
  subscription = createSubscriptionFn();
  
  // Set up expiration
  timeoutId = setTimeout(() => {
    if (subscription) {
      subscription();
      subscription = null;
    }
  }, expiryMs);
  
  // Return function to clean up everything
  return () => {
    clearTimeout(timeoutId);
    
    if (subscription) {
      subscription();
      subscription = null;
    }
  };
} 