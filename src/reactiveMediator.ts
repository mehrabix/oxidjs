import { createSignalPair, ReadonlySignal } from './signal';
import { createEffect } from './effect';
import { batch } from './utils';

/**
 * Event type for mediator
 */
export interface MediatorEvent<T = any> {
  /** Event type identifier */
  type: string;
  /** Event payload */
  payload: T;
  /** When the event was created */
  timestamp: number;
  /** Metadata about the event */
  meta?: Record<string, any>;
}

/**
 * Handler for mediator events
 */
export type EventHandler<T = any> = (event: MediatorEvent<T>) => void;

/**
 * Subscription options
 */
export interface SubscriptionOptions {
  /** Whether to receive past events that occurred before subscribing */
  includePast?: boolean;
  /** Maximum number of past events to receive */
  maxPastEvents?: number;
  /** Whether this is a one-time subscription that auto-unsubscribes */
  once?: boolean;
}

/**
 * A channel for specific event types
 */
export interface EventChannel<T = any> {
  /** Channel name */
  readonly name: string;
  /** Subscribe to this channel */
  subscribe: (handler: EventHandler<T>, options?: SubscriptionOptions) => () => void;
  /** Publish an event to this channel */
  publish: (payload: T, meta?: Record<string, any>) => void;
  /** Get the current value (latest event payload) */
  current: ReadonlySignal<T | undefined>;
  /** Get all events in this channel */
  events: ReadonlySignal<MediatorEvent<T>[]>;
  /** Clear all events from this channel */
  clear: () => void;
}

/**
 * A mediator for communication between components
 */
export interface Mediator {
  /** Get or create a channel with the given name */
  channel: <T = any>(name: string) => EventChannel<T>;
  /** Subscribe to events on the given channel */
  subscribe: <T = any>(
    channelName: string,
    handler: EventHandler<T>,
    options?: SubscriptionOptions
  ) => () => void;
  /** Publish an event to a channel */
  publish: <T = any>(
    channelName: string,
    payload: T,
    meta?: Record<string, any>
  ) => void;
  /** Clear all events */
  clear: () => void;
  /** Remove a channel */
  removeChannel: (name: string) => void;
  /** Get all channel names */
  channels: ReadonlySignal<string[]>;
}

/**
 * Options for creating a mediator
 */
export interface MediatorOptions {
  /** Maximum number of events to store per channel */
  maxEvents?: number;
  /** Whether to log events */
  logging?: boolean;
  /** Storage key for persistence */
  persistKey?: string;
}

/**
 * Create a reactive mediator for communication between components
 * 
 * @param options Mediator options
 * @returns A mediator instance
 */
export function createMediator(options: MediatorOptions = {}): Mediator {
  const {
    maxEvents = 100,
    logging = false,
    persistKey
  } = options;
  
  // Store channels by name
  const channels = new Map<string, EventChannel<any>>();
  
  // Signal for channel names
  const [getChannelNames, setChannelNames] = createSignalPair<string[]>([]);
  
  // Load persisted events if needed
  if (persistKey && typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(persistKey);
      if (stored) {
        const data = JSON.parse(stored);
        if (data && typeof data === 'object') {
          // Restore channels and events
          for (const [name, events] of Object.entries(data)) {
            if (Array.isArray(events)) {
              // Create the channel
              const channel = createChannel(name, events as MediatorEvent<any>[]);
              channels.set(name, channel);
            }
          }
          
          // Update channel names
          setChannelNames(Array.from(channels.keys()));
        }
      }
    } catch (e) {
      console.error('Failed to load persisted events:', e);
    }
  }
  
  // Save to storage if persistence is enabled
  if (persistKey && typeof window !== 'undefined') {
    createEffect(() => {
      // Collect all channel events
      const data: Record<string, MediatorEvent<any>[]> = {};
      
      for (const [name, channel] of channels.entries()) {
        data[name] = channel.events();
      }
      
      try {
        window.localStorage.setItem(persistKey, JSON.stringify(data));
      } catch (e) {
        console.error('Failed to persist events:', e);
      }
    });
  }
  
  // Create a channel with the given name
  function createChannel<T>(name: string, initialEvents: MediatorEvent<T>[] = []): EventChannel<T> {
    // Store subscribers
    const subscribers = new Set<{
      handler: EventHandler<T>;
      options: SubscriptionOptions;
    }>();
    
    // Store events
    const [getEvents, setEvents] = createSignalPair<MediatorEvent<T>[]>(initialEvents);
    
    // Store current value (latest event payload)
    const [getCurrent, setCurrent] = createSignalPair<T | undefined>(
      initialEvents.length > 0 ? initialEvents[initialEvents.length - 1].payload : undefined
    );
    
    // Subscribe to events
    const subscribe = (
      handler: EventHandler<T>,
      options: SubscriptionOptions = {}
    ): (() => void) => {
      const subscription = { handler, options };
      subscribers.add(subscription);
      
      // Handle past events if needed
      if (options.includePast) {
        const events = getEvents();
        const pastEvents = options.maxPastEvents
          ? events.slice(-options.maxPastEvents)
          : events;
        
        for (const event of pastEvents) {
          handler(event);
        }
      }
      
      // Return unsubscribe function
      return () => {
        subscribers.delete(subscription);
      };
    };
    
    // Publish an event
    const publish = (payload: T, meta: Record<string, any> = {}): void => {
      // Create event object
      const event: MediatorEvent<T> = {
        type: name,
        payload,
        timestamp: Date.now(),
        meta
      };
      
      // Log if enabled
      if (logging) {
        console.group(`Mediator Event: ${name}`);
        console.log('Payload:', payload);
        console.log('Meta:', meta);
        console.log('Timestamp:', new Date(event.timestamp).toISOString());
        console.groupEnd();
      }
      
      // Update events
      setEvents(prev => {
        const newEvents = [...prev, event];
        return newEvents.length > maxEvents
          ? newEvents.slice(-maxEvents)
          : newEvents;
      });
      
      // Update current value
      setCurrent(payload);
      
      // Notify subscribers
      for (const { handler, options } of subscribers) {
        handler(event);
        
        // Handle one-time subscriptions
        if (options.once) {
          subscribers.delete({ handler, options });
        }
      }
    };
    
    // Clear events
    const clear = (): void => {
      setEvents([]);
      setCurrent(undefined);
    };
    
    return {
      name,
      subscribe,
      publish,
      current: getCurrent,
      events: getEvents,
      clear
    };
  }
  
  // Get or create a channel
  const getChannel = <T>(name: string): EventChannel<T> => {
    if (!channels.has(name)) {
      const channel = createChannel<T>(name);
      channels.set(name, channel);
      setChannelNames(Array.from(channels.keys()));
    }
    
    return channels.get(name) as EventChannel<T>;
  };
  
  // Subscribe to events
  const subscribe = <T>(
    channelName: string,
    handler: EventHandler<T>,
    options: SubscriptionOptions = {}
  ): (() => void) => {
    const channel = getChannel<T>(channelName);
    return channel.subscribe(handler, options);
  };
  
  // Publish an event
  const publish = <T>(
    channelName: string,
    payload: T,
    meta: Record<string, any> = {}
  ): void => {
    const channel = getChannel<T>(channelName);
    channel.publish(payload, meta);
  };
  
  // Clear all events
  const clear = (): void => {
    batch(() => {
      for (const channel of channels.values()) {
        channel.clear();
      }
    });
  };
  
  // Remove a channel
  const removeChannel = (name: string): void => {
    if (channels.delete(name)) {
      setChannelNames(Array.from(channels.keys()));
    }
  };
  
  return {
    channel: getChannel,
    subscribe,
    publish,
    clear,
    removeChannel,
    channels: getChannelNames
  };
}

/**
 * Create a type-safe channels object from an interface
 */
export function createChannels<T extends Record<string, any>>(
  mediator: Mediator
): T {
  const channels: Partial<T> = {};
  
  // Use a proxy to create channels on demand
  return new Proxy(channels as T, {
    get(_target, prop) {
      const name = prop.toString();
      
      // If the channel doesn't exist yet, create it
      if (!(name in channels)) {
        // Create a channel with the property name
        const channelName = name;
        
        // Create the channel with appropriate type
        // This requires a type assertion since we can't index with string|symbol
        channels[name as keyof T] = mediator.channel(channelName) as any;
      }
      
      // Return the channel
      return channels[name as keyof T];
    }
  });
}

/**
 * Helper to create a one-time listener
 */
export function once<T>(
  channel: EventChannel<T>,
  handler: (payload: T) => void
): () => void {
  return channel.subscribe(
    event => handler(event.payload),
    { once: true }
  );
}

/**
 * Create a signal that syncs with a channel's current value
 */
export function createChannelSignal<T>(
  channel: EventChannel<T>,
  initialValue?: T
): [ReadonlySignal<T | undefined>, (value: T) => void] {
  // Create a signal
  const [get, set] = createSignalPair<T | undefined>(
    channel.current() !== undefined ? channel.current() : initialValue
  );
  
  // Subscribe to channel updates
  createEffect(() => {
    const value = channel.current();
    if (value !== undefined) {
      set(value);
    }
  });
  
  // Create setter that publishes to channel
  const publishValue = (value: T): void => {
    channel.publish(value);
  };
  
  return [get, publishValue];
}

/**
 * Send a request through the mediator and wait for a response
 */
export function request<TReq, TRes>(
  mediator: Mediator,
  requestChannel: string,
  responseChannel: string,
  payload: TReq,
  timeout: number = 5000
): Promise<TRes> {
  return new Promise<TRes>((resolve, reject) => {
    // Generate a unique ID for this request
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Request timed out after ${timeout}ms`));
    }, timeout);
    
    // Subscribe to response
    const unsubscribe = mediator.subscribe<TRes>(
      responseChannel,
      event => {
        if (event.meta?.requestId === requestId) {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve(event.payload);
        }
      }
    );
    
    // Send request
    mediator.publish<TReq>(requestChannel, payload, { requestId });
  });
}

/**
 * Create a responder for requests
 */
export function createResponder<TReq, TRes>(
  mediator: Mediator,
  requestChannel: string,
  responseChannel: string,
  handler: (payload: TReq) => TRes | Promise<TRes>
): () => void {
  return mediator.subscribe<TReq>(
    requestChannel,
    async event => {
      try {
        const requestId = event.meta?.requestId;
        const result = await handler(event.payload);
        
        mediator.publish<TRes>(responseChannel, result, { requestId });
      } catch (error) {
        console.error(`Error in responder for ${requestChannel}:`, error);
      }
    }
  );
} 