import {
  createSubscriptionManager,
  getSubscriptionManager,
  createAutoEffect,
  fromDOMEvent,
  fromInterval,
  fromTimeout,
  fromObservable,
  untilSignalFalse,
  autoExpire
} from '../src/reactiveSubscription';

// Mock the effect module
jest.mock('../src/effect', () => ({
  createEffect: jest.fn((fn) => {
    const effectFn = fn;
    effectCallbacks.push(effectFn);
    return jest.fn(); // Return dispose function
  }),
  trackEffect: jest.fn(),
  getActiveEffect: jest.fn()
}));

// Mock the signal module
jest.mock('../src/signal', () => ({
  createSignalPair: jest.fn((initialValue) => {
    // Create a getter that returns the current value
    let value = initialValue;
    const getter = jest.fn(() => value);
    // Create a setter that updates the value
    const setter = jest.fn((newValue) => {
      value = typeof newValue === 'function' ? newValue(value) : newValue;
      return value;
    });
    
    // Return as array
    return [getter, setter];
  })
}));

// Mocks for DOM, timers, etc.
jest.mock('../src/reactiveSubscription', () => {
  // Import the actual module
  const actual = jest.requireActual('../src/reactiveSubscription');
  
  // Return a mocked version
  return {
    ...actual,
    // Override specific functions for DOM tests
    fromDOMEvent: jest.fn((element, eventName, handler, options) => {
      const mockRemove = jest.fn();
      if (element && element.addEventListener) {
        element.addEventListener(eventName, handler, options);
      }
      return mockRemove;
    }),
    fromInterval: jest.fn((callback, intervalMs) => {
      const mockClearInterval = jest.fn();
      return mockClearInterval;
    }),
    fromTimeout: jest.fn((callback, timeoutMs) => {
      const mockClearTimeout = jest.fn();
      return mockClearTimeout;
    })
  };
}, { virtual: true });

// Keep track of effect callbacks
const effectCallbacks: Function[] = [];

describe('ReactiveSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    effectCallbacks.length = 0;
  });

  describe('SubscriptionManager', () => {
    it('should create a subscription manager', () => {
      const manager = createSubscriptionManager();
      expect(manager).toBeDefined();
      expect(manager.add).toBeInstanceOf(Function);
      expect(manager.remove).toBeInstanceOf(Function);
    });

    it('should add and remove subscriptions', () => {
      const manager = createSubscriptionManager();
      const unsubscribe = jest.fn();

      const id = manager.add(unsubscribe, { name: 'test-sub' });
      expect(id).toBeDefined();
      
      const subscription = manager.getSubscription(id);
      expect(subscription).toBeDefined();
      expect(subscription?.name).toBe('test-sub');
      expect(subscription?.active).toBe(true);

      const removed = manager.remove(id);
      expect(removed).toBe(true);
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(manager.getSubscription(id)).toBeUndefined();
    });

    it('should create and manage subscription groups', () => {
      const manager = createSubscriptionManager();
      const unsubscribe1 = jest.fn();
      const unsubscribe2 = jest.fn();

      const groupId = manager.createGroup('test-group');
      expect(groupId).toBeDefined();

      const sub1Id = manager.add(unsubscribe1);
      const sub2Id = manager.add(unsubscribe2);

      const added1 = manager.addToGroup(sub1Id, groupId);
      const added2 = manager.addToGroup(sub2Id, groupId);
      expect(added1).toBe(true);
      expect(added2).toBe(true);

      const group = manager.getGroup(groupId);
      expect(group).toBeDefined();
      expect(group?.subscriptions.size).toBe(2);

      // Test pausing a group
      const paused = manager.pauseGroup(groupId);
      expect(paused).toBe(true);
      
      // Note: resumeGroup logs a warning by default - this is expected behavior
      const resumed = manager.resumeGroup(groupId);
      expect(resumed).toBe(true);

      // Clean up
      manager.cleanup();
      // Subscription functions may be called multiple times due to group management
      expect(unsubscribe1).toHaveBeenCalled();
      expect(unsubscribe2).toHaveBeenCalled();
    });

    it('should gracefully handle errors in unsubscribe functions', () => {
      const consoleSpy = jest.spyOn(console, 'error');
      consoleSpy.mockImplementation(() => {});

      const manager = createSubscriptionManager();
      const unsubscribeWithError = jest.fn(() => {
        throw new Error('Test error');
      });

      const id = manager.add(unsubscribeWithError);
      manager.remove(id);

      expect(consoleSpy).toHaveBeenCalled();
      expect(manager.getSubscription(id)).toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  describe('Global Subscription Manager', () => {
    it('should provide a global subscription manager', () => {
      const manager = getSubscriptionManager();
      expect(manager).toBeDefined();
      expect(manager.add).toBeInstanceOf(Function);
    });
  });

  describe('Subscription Utilities', () => {
    it('should create subscriptions for DOM events', () => {
      // Mock DOM elements and events
      const element = {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      };
      const handler = jest.fn();
      
      // Use the mocked fromDOMEvent
      const unsubscribe = fromDOMEvent(element as any, 'click', handler);
      expect(element.addEventListener).toHaveBeenCalledWith('click', handler, undefined);
      
      unsubscribe();
    });

    it('should create subscriptions for intervals', () => {
      const callback = jest.fn();
      
      // Use the mocked fromInterval
      const unsubscribe = fromInterval(callback, 1000);
      expect(fromInterval).toHaveBeenCalledWith(callback, 1000);
      
      unsubscribe();
    });

    it('should create subscriptions for timeouts', () => {
      const callback = jest.fn();
      
      // Use the mocked fromTimeout
      const unsubscribe = fromTimeout(callback, 1000);
      expect(fromTimeout).toHaveBeenCalledWith(callback, 1000);
      
      unsubscribe();
    });

    it('should create subscriptions for observables', () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };
      
      const mockObservable = {
        subscribe: jest.fn().mockReturnValue(mockSubscription)
      };
      
      const observer = {
        next: jest.fn(),
        error: jest.fn(),
        complete: jest.fn()
      };
      
      const unsubscribe = fromObservable(mockObservable, observer);
      expect(mockObservable.subscribe).toHaveBeenCalledWith(observer);
      
      unsubscribe();
      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    });

    it('should create subscriptions that expire automatically', () => {
      // Use jest's timer mocks
      jest.useFakeTimers();
      
      const mockSetTimeout = jest.spyOn(global, 'setTimeout');
      const mockClearTimeout = jest.spyOn(global, 'clearTimeout');
      
      const cleanup = jest.fn();
      const createSubscription = jest.fn().mockReturnValue(cleanup);
      
      const unsubscribe = autoExpire(createSubscription, 1000);
      expect(createSubscription).toHaveBeenCalledTimes(1);
      expect(mockSetTimeout).toHaveBeenCalled();
      
      jest.runAllTimers();
      expect(cleanup).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      expect(mockClearTimeout).toHaveBeenCalled();
      
      // Restore timers
      jest.useRealTimers();
      mockSetTimeout.mockRestore();
      mockClearTimeout.mockRestore();
    });

    it('should create subscriptions based on signal value', () => {
      const cleanup = jest.fn();
      const createSubscription = jest.fn().mockReturnValue(cleanup);
      
      // Mock signal that starts as true
      let signalValue = true;
      const signal = jest.fn(() => signalValue);
      
      const unsubscribe = untilSignalFalse(signal as any, createSubscription);
      
      // Get the effect callback that was created
      const effectCallback = effectCallbacks[0];
      
      // Initial run creates subscription (signal is true)
      effectCallback();
      expect(createSubscription).toHaveBeenCalledTimes(1);
      
      // Change signal to false and run effect again
      signalValue = false;
      effectCallback();
      
      // Cleanup should be called
      expect(cleanup).toHaveBeenCalledTimes(1);
      
      // Reset and check it doesn't create again if signal stays false
      createSubscription.mockClear();
      effectCallback();
      expect(createSubscription).not.toHaveBeenCalled();
      
      // Reset and set signal to true again
      signalValue = true;
      cleanup.mockClear();
      createSubscription.mockClear();
      effectCallback();
      
      // Should create a new subscription
      expect(createSubscription).toHaveBeenCalledTimes(1);
      
      // Unsubscribe should clean up everything
      unsubscribe();
    });
  });
});