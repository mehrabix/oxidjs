import { createSignalPair, ReadonlySignal } from './signal';
import { createEffect } from './effect';
import { batch } from './utils';

/**
 * Action type definition
 */
export type Action<T extends string = string> = {
  /** Unique identifier for the action type */
  type: T;
  /** Optional payload data associated with the action */
  payload?: any;
  /** When the action was dispatched */
  timestamp?: number;
  /** Optional metadata about the action */
  meta?: Record<string, any>;
};

/**
 * Action creator function type
 */
export type ActionCreator<T extends string = string> = {
  type: T;
  (...args: any[]): Action<T>;
};

/**
 * Action handler function type
 */
export type ActionHandler<T extends string = string, S = any> = (state: S, action: Action<T>) => S;

/**
 * Action history state
 */
export interface ActionHistory<T extends string = string> {
  /** All actions in chronological order */
  actions: Action<T>[];
  /** Current position in the action history */
  position: number;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
}

/**
 * Action manager for tracking and time-traveling through actions
 */
export interface ActionManager<T extends string = string, S = any> {
  /** Dispatch a new action */
  dispatch: (action: Action<T>) => void;
  /** Get the current state */
  state: ReadonlySignal<S>;
  /** Get the current state value */
  getState: () => S;
  /** Get the action history */
  history: ReadonlySignal<ActionHistory<T>>;
  /** Undo the last action */
  undo: () => void;
  /** Redo the previously undone action */
  redo: () => void;
  /** Jump to a specific action index */
  jumpToAction: (position: number) => void;
  /** Reset to initial state */
  reset: () => void;
  /** Subscribe to actions of a specific type */
  on: <P = any>(type: string, callback: (payload: P) => void) => () => void;
  /** Register a middleware to process actions */
  use: (middleware: ActionMiddleware<T>) => () => void;
}

/**
 * Middleware function for intercepting and transforming actions
 */
export type ActionMiddleware<T extends string = string> = {
  (action: Action<T>, next: (action: Action<T>) => Action<T>): Action<T>;
};

export type DispatchFunction<T extends string = string> = (action: Action<T>) => void;

/**
 * Options for creating an action manager
 */
export interface ActionManagerOptions<S> {
  /** Initial state */
  initialState: S;
  /** Maximum number of actions to keep in history */
  historyLimit?: number;
  /** Whether to enable time-travel features */
  enableTimeTravel?: boolean;
  /** Whether to persist actions to storage */
  persist?: boolean;
  /** Storage key when persisting */
  storageKey?: string;
  /** Custom storage implementation */
  storage?: Storage;
}

/**
 * Creates a typed action creator
 */
export function createAction<T extends string = string>(
  type: T,
  payloadCreator: (...args: any[]) => any = (payload) => payload
): ActionCreator<T> {
  const actionCreator = (...args: any[]): Action<T> => ({
    type,
    payload: payloadCreator(...args)
  });

  actionCreator.type = type;
  return actionCreator;
}

/**
 * Creates a group of related actions
 */
export function createActionGroup<P extends string = string>(
  prefix: P,
  actions: Record<string, (...args: any[]) => any>
): Record<string, ActionCreator<`${P}/${string}`>> {
  return Object.entries(actions).reduce((acc, [key, payloadCreator]) => {
    acc[key] = createAction(`${prefix}/${key}`, payloadCreator);
    return acc;
  }, {} as Record<string, ActionCreator<`${P}/${string}`>>);
}

/**
 * Creates a middleware function
 */
export function createMiddleware<T extends string = string>(
  middleware: (action: Action<T>, next: (action: Action<T>) => Action<T>) => Action<T>
): ActionMiddleware<T> {
  return middleware;
}

/**
 * Create an action manager for tracking and time-traveling through actions
 */
export function createActionManager<T extends string = string, S = any>(
  initialState: S,
  options: ActionManagerOptions<S> = { initialState }
): ActionManager<T, S> {
  const {
    historyLimit = 100,
    enableTimeTravel = true,
    persist = false,
    storageKey = 'oxidjs-actions',
    storage = typeof window !== 'undefined' ? window.localStorage : null
  } = options;
  
  // Create signals for state and history
  const [getState, setState] = createSignalPair<S>(initialState);
  const [getHistory, setHistory] = createSignalPair<ActionHistory<T>>({
    actions: [],
    position: -1,
    canUndo: false,
    canRedo: false
  });
  
  // Action listeners by type
  const listeners = new Map<string, Set<(payload: any) => void>>();
  
  // Middleware stack
  const middlewares: ActionMiddleware<T>[] = [];
  
  // Save to storage if persistence is enabled
  if (persist && storage) {
    createEffect(() => {
      const state = getState();
      const history = getHistory();
      
      try {
        storage.setItem(storageKey, JSON.stringify({
          state,
          actions: history.actions
        }));
      } catch (e) {
        console.error('Failed to persist actions:', e);
      }
    });
  }
  
  // Process an action through middleware
  const processAction = (action: Action<T>) => {
    const processedAction = { ...action };
    
    if (middlewares.length === 0) {
      // No middleware, apply directly
      completeAction(processedAction);
      return;
    }
    
    // Create middleware chain
    let index = 0;
    
    const next = (nextAction: Action<T>): Action<T> => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++];
        return middleware(nextAction, next);
      }
      return nextAction;
    };
    
    // Start middleware chain
    const result = next(processedAction);
    completeAction(result);
  };
  
  // Complete action processing after middleware
  const completeAction = (action: Action<T>) => {
    // Get current history
    const history = getHistory();
    
    // If we're not at the end of history (due to undo/redo),
    // we need to truncate the future actions
    const newActions = history.position < history.actions.length - 1
      ? history.actions.slice(0, history.position + 1)
      : history.actions.slice();
    
    // Add the new action
    newActions.push(action);
    
    // Limit history length if needed
    if (newActions.length > historyLimit) {
      newActions.shift();
    }
    
    // Update state and history
    batch(() => {
      setState(initialState);
      
      setHistory({
        actions: newActions,
        position: newActions.length - 1,
        canUndo: newActions.length > 1,
        canRedo: false
      });
    });
    
    // Notify listeners
    const typeListeners = listeners.get(action.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        listener(action.payload);
      }
    }
  };
  
  // Dispatch a new action
  const dispatch = (action: Action<T>) => {
    processAction(action);
  };
  
  // Undo the last action
  const undo = () => {
    if (!enableTimeTravel) return;
    
    const history = getHistory();
    if (!history.canUndo) return;
    
    const newPosition = history.position - 1;
    if (newPosition < 0) return;
    
    // Update state and history position
    batch(() => {
      setState(initialState);
      setHistory({
        actions: history.actions,
        position: newPosition,
        canUndo: newPosition > 0,
        canRedo: true
      });
    });
  };
  
  // Redo a previously undone action
  const redo = () => {
    if (!enableTimeTravel) return;
    
    const history = getHistory();
    if (!history.canRedo) return;
    
    const newPosition = history.position + 1;
    if (newPosition >= history.actions.length) return;
    
    // Apply the next action
    const action = history.actions[newPosition];
    
    // Update state and history position
    batch(() => {
      setState(initialState);
      setHistory({
        actions: history.actions,
        position: newPosition,
        canUndo: true,
        canRedo: newPosition < history.actions.length - 1
      });
    });
    
    // Notify listeners
    const typeListeners = listeners.get(action.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        listener(action.payload);
      }
    }
  };
  
  // Jump to a specific action in history
  const jumpToAction = (position: number) => {
    if (!enableTimeTravel) return;
    
    const history = getHistory();
    if (position < 0 || position >= history.actions.length) return;
    
    // Update state and history position
    batch(() => {
      setState(initialState);
      setHistory({
        actions: history.actions,
        position,
        canUndo: position > 0,
        canRedo: position < history.actions.length - 1
      });
    });
  };
  
  // Reset to initial state
  const reset = () => {
    batch(() => {
      setState(initialState);
      setHistory({
        actions: [],
        position: -1,
        canUndo: false,
        canRedo: false
      });
    });
  };
  
  // Subscribe to actions of a specific type
  const on = <P = any>(
    type: string,
    callback: (payload: P) => void
  ): (() => void) => {
    if (!listeners.has(type)) {
      listeners.set(type, new Set());
    }
    
    listeners.get(type)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const typeListeners = listeners.get(type);
      if (typeListeners) {
        typeListeners.delete(callback);
        if (typeListeners.size === 0) {
          listeners.delete(type);
        }
      }
    };
  };
  
  // Register middleware
  const use = (middleware: ActionMiddleware<T>): (() => void) => {
    middlewares.push(middleware);
    
    // Return function to remove middleware
    return () => {
      const index = middlewares.indexOf(middleware);
      if (index !== -1) {
        middlewares.splice(index, 1);
      }
    };
  };
  
  return {
    dispatch,
    state: getState,
    getState: () => getState(),
    history: getHistory,
    undo,
    redo,
    jumpToAction,
    reset,
    on,
    use
  };
}

/**
 * Record details about an action for logging or debugging
 */
export function loggerMiddleware<T extends string>(): ActionMiddleware<T> {
  return (action: Action<T>, next: (action: Action<T>) => Action<T>) => {
    console.group(`Action: ${action.type}`);
    console.log('Payload:', action.payload);
    if (action.timestamp) {
      console.log('Timestamp:', new Date(action.timestamp).toISOString());
    }
    
    // Pass to next middleware and return result
    const result = next(action);
    
    console.groupEnd();
    return result;
  };
}

/**
 * Filter actions based on a predicate
 */
export function filterMiddleware<T extends string>(
  predicate: (action: Action<T>) => boolean
): ActionMiddleware<T> {
  return (action: Action<T>, next: (action: Action<T>) => Action<T>) => {
    if (predicate(action)) {
      return next(action);
    }
    return action;
  };
}

/**
 * Throttle actions of the same type
 */
export function throttleMiddleware<T extends string>(
  duration: number = 300
): ActionMiddleware<T> {
  const throttled = new Map<T, number>();
  
  return (action: Action<T>, next: (action: Action<T>) => Action<T>) => {
    const now = Date.now();
    const lastTime = throttled.get(action.type) || 0;
    
    if (now - lastTime >= duration) {
      throttled.set(action.type, now);
      return next(action);
    }
    return action;
  };
}

/**
 * Creates a reducer that handles different action types with different handlers
 */
export function createReducer<S = any, T extends string = string>(
  initialState: S,
  builder: (builder: {
    addCase: <A extends T>(
      actionCreator: ActionCreator<A>,
      reducer: (state: S, action: Action<A>) => S
    ) => void;
    addDefaultCase: (reducer: (state: S, action: Action<T>) => S) => void;
    addMatcher: (
      matcher: (action: Action<T>) => boolean,
      reducer: (state: S, action: Action<T>) => S
    ) => void;
  }) => void
): (state: S | undefined, action: Action<T>) => S {
  const handlers: Record<string, (state: S, action: Action<T>) => S> = {};
  let defaultHandler: ((state: S, action: Action<T>) => S) | undefined;

  const builderObj = {
    addCase: <A extends T>(
      actionCreator: ActionCreator<A>,
      reducer: (state: S, action: Action<A>) => S
    ) => {
      handlers[actionCreator.type] = reducer as (state: S, action: Action<T>) => S;
    },
    addDefaultCase: (reducer: (state: S, action: Action<T>) => S) => {
      defaultHandler = reducer;
    },
    addMatcher: (
      matcher: (action: Action<T>) => boolean,
      reducer: (state: S, action: Action<T>) => S
    ) => {
      handlers[matcher.toString()] = reducer;
    }
  };

  builder(builderObj);

  return (state: S | undefined = initialState, action: Action<T>): S => {
    const handler = handlers[action.type] || defaultHandler;
    if (handler) {
      return handler(state, action);
    }
    return state;
  };
}

// Default action manager instance
const defaultActionManager = createActionManager<string, any>(
  {} as any,
  { initialState: {} as any }
);

// Export dispatch function from default manager
export const dispatch = (action: Action) => {
  defaultActionManager.dispatch(action);
};

// Export getActions function
export const getActions = () => defaultActionManager.state;

// Export subscribe function
export const subscribe = (callback: (action: Action) => void) => {
  return defaultActionManager.on('*', callback);
};

// Export applyMiddleware function
export function applyMiddleware<T extends string>(
  ...middlewares: ActionMiddleware<T>[]
): (dispatch: DispatchFunction<T>) => DispatchFunction<T> {
  return (dispatch) => {
    // Create the base dispatch function that returns the action
    const baseDispatch = (action: Action<T>): Action<T> => {
      dispatch(action);
      return action;
    };

    // Return the new dispatch function
    return (action: Action<T>): void => {
      let index = 0;
      
      const next = (nextAction: Action<T>): Action<T> => {
        if (index < middlewares.length) {
          const middleware = middlewares[index++];
          return middleware(nextAction, next);
        }
        return baseDispatch(nextAction);
      };

      // Start middleware chain and dispatch result
      const result = next(action);
      if (result !== action) {
        dispatch(result);
      }
    };
  };
} 