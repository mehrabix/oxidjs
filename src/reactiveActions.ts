import { createSignalPair, ReadonlySignal } from './signal';
import { createEffect } from './effect';
import { batch } from './utils';

/**
 * Action type definition
 */
export interface Action<T = any> {
  /** Unique identifier for the action type */
  type: string;
  /** Optional payload data associated with the action */
  payload?: T;
  /** When the action was dispatched */
  timestamp: number;
  /** Optional metadata about the action */
  meta?: Record<string, any>;
}

/**
 * Action creator function type
 */
export type ActionCreator<T = any> = (payload: T) => Action<T>;

/**
 * Action handler function type
 */
export type ActionHandler<T = any, R = any> = (state: R, action: Action<T>) => R;

/**
 * Action history state
 */
export interface ActionHistory<T = any> {
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
export interface ActionManager<T = any, S = any> {
  /** Dispatch a new action */
  dispatch: (action: Action<T>) => void;
  /** Get the current state */
  state: ReadonlySignal<S>;
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
  use: (middleware: ActionMiddleware<T, S>) => () => void;
}

/**
 * Middleware function for intercepting and transforming actions
 */
export type ActionMiddleware<T = any, S = any> = 
  (action: Action<T>, state: S, next: (action: Action<T>) => void) => void;

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
 * 
 * @param type Action type string
 * @returns An action creator function
 */
export function createAction<T = void>(type: string): ActionCreator<T> {
  return (payload: T): Action<T> => ({
    type,
    payload,
    timestamp: Date.now()
  });
}

/**
 * Create an action manager for tracking and time-traveling through actions
 * 
 * @param reducer Main reducer function to handle actions
 * @param options Configuration options
 * @returns An action manager instance
 */
export function createActionManager<T = any, S = any>(
  reducer: (state: S, action: Action<T>) => S,
  options: ActionManagerOptions<S>
): ActionManager<T, S> {
  const {
    initialState,
    historyLimit = 100,
    enableTimeTravel = true,
    persist = false,
    storageKey = 'oxidjs-actions',
    storage = typeof window !== 'undefined' ? window.localStorage : null
  } = options;
  
  // Load persisted state if enabled
  let startingState = initialState;
  let startingHistory: Action<T>[] = [];
  
  if (persist && storage) {
    try {
      const savedData = storage.getItem(storageKey);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed.state) startingState = parsed.state;
        if (parsed.actions) startingHistory = parsed.actions;
      }
    } catch (e) {
      console.error('Failed to load persisted actions:', e);
    }
  }
  
  // Create signals for state and history
  const [getState, setState] = createSignalPair<S>(startingState);
  const [getHistory, setHistory] = createSignalPair<ActionHistory<T>>({
    actions: startingHistory,
    position: startingHistory.length - 1,
    canUndo: startingHistory.length > 0,
    canRedo: false
  });
  
  // Action listeners by type
  const listeners = new Map<string, Set<(payload: any) => void>>();
  
  // Middleware stack
  const middlewares: ActionMiddleware<T, S>[] = [];
  
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
  
  // Apply an action using the reducer
  const applyAction = (action: Action<T>): S => {
    return reducer(getState(), action);
  };
  
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
    const state = getState();
    
    const next = (nextAction: Action<T>) => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++];
        middleware(nextAction, state, next);
      } else {
        completeAction(nextAction);
      }
    };
    
    // Start middleware chain
    next(processedAction);
  };
  
  // Complete action processing after middleware
  const completeAction = (action: Action<T>) => {
    // Apply the action to get new state
    const newState = applyAction(action);
    
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
      setState(newState);
      
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
    // Process the action through middleware
    processAction(action);
  };
  
  // Undo the last action
  const undo = () => {
    if (!enableTimeTravel) return;
    
    const history = getHistory();
    if (!history.canUndo) return;
    
    const newPosition = history.position - 1;
    if (newPosition < 0) return;
    
    // Recompute state by replaying actions up to the new position
    let newState = initialState;
    for (let i = 0; i <= newPosition; i++) {
      newState = reducer(newState, history.actions[i]);
    }
    
    // Update state and history position
    batch(() => {
      setState(newState);
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
    const newState = reducer(getState(), action);
    
    // Update state and history position
    batch(() => {
      setState(newState);
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
    
    // Recompute state by replaying actions up to the target position
    let newState = initialState;
    for (let i = 0; i <= position; i++) {
      newState = reducer(newState, history.actions[i]);
    }
    
    // Update state and history position
    batch(() => {
      setState(newState);
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
  const use = (middleware: ActionMiddleware<T, S>): (() => void) => {
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
export function loggerMiddleware<T, S>(): ActionMiddleware<T, S> {
  return (action, state, next) => {
    console.group(`Action: ${action.type}`);
    console.log('Payload:', action.payload);
    console.log('Timestamp:', new Date(action.timestamp).toISOString());
    console.log('Previous State:', state);
    
    // Pass to next middleware
    next(action);
    
    // Log the new state after applying the action
    console.log('New State:', state);
    console.groupEnd();
  };
}

/**
 * Filter actions based on a predicate
 */
export function filterMiddleware<T, S>(
  predicate: (action: Action<T>) => boolean
): ActionMiddleware<T, S> {
  return (action, _state, next) => {
    if (predicate(action)) {
      next(action);
    }
    // Otherwise, the action is ignored
  };
}

/**
 * Throttle actions of the same type
 */
export function throttleMiddleware<T, S>(
  duration: number = 300
): ActionMiddleware<T, S> {
  const throttled = new Map<string, number>();
  
  return (action, _state, next) => {
    const now = Date.now();
    const lastTime = throttled.get(action.type) || 0;
    
    if (now - lastTime >= duration) {
      throttled.set(action.type, now);
      next(action);
    }
  };
}

/**
 * Creates a reducer that handles different action types with different handlers
 */
export function createReducer<S>(
  initialState: S, 
  handlers: Record<string, ActionHandler<any, S>>
): (state: S, action: Action) => S {
  return (state = initialState, action) => {
    if (Object.prototype.hasOwnProperty.call(handlers, action.type)) {
      return handlers[action.type](state, action);
    }
    return state;
  };
} 