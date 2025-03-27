import { createSignalPair, ReadonlySignal } from './signal';
import { batch } from './utils';

/**
 * A state record in the history
 */
export interface HistoryRecord<T> {
  /** The state data */
  state: T;
  /** Timestamp when this record was created */
  timestamp: number;
  /** Optional metadata for this record */
  metadata?: any;
}

/**
 * A group of states that should be treated as a single change
 */
export interface HistoryGroup<T> {
  /** Records in this group */
  records: HistoryRecord<T>[];
  /** Label for this group */
  label: string;
  /** Timestamp when this group was created */
  timestamp: number;
}

/**
 * History change event types
 */
export type HistoryChangeType = 
  | 'push' 
  | 'undo' 
  | 'redo' 
  | 'reset' 
  | 'clear' 
  | 'group';

/**
 * History change event 
 */
export interface HistoryChangeEvent<T> {
  /** Type of change */
  type: HistoryChangeType;
  /** Current state */
  current: T;
  /** Previous state (if available) */
  previous?: T;
  /** Next state (if available - undo) */
  next?: T;
}

/**
 * Options for creating a history controller
 */
export interface HistoryOptions<T> {
  /** Initial state */
  initialState: T;
  /** Maximum number of states to track */
  maxHistory?: number;
  /** Function to compare states for equality */
  equals?: (a: T, b: T) => boolean;
  /** Whether to skip duplicate states */
  skipDuplicates?: boolean;
  /** Whether to push state automatically when it changes */
  autoPush?: boolean;
  /** Whether to persist history to localStorage */
  persist?: boolean;
  /** Storage key for persistence */
  storageKey?: string;
  /** Whether to throttle auto-push */
  throttleAutoPush?: boolean;
  /** Throttle time in milliseconds */
  throttleMs?: number;
}

/**
 * A reactive history controller
 */
export interface ReactiveHistory<T> {
  /** Current state */
  state: ReadonlySignal<T>;
  
  /** Set a new state value (optionally pushing to history) */
  setState: (value: T, pushToHistory?: boolean) => void;
  
  /** Push current state to history */
  push: (metadata?: any) => void;
  
  /** Go back in history */
  undo: () => boolean;
  
  /** Go forward in history */
  redo: () => boolean;
  
  /** Clear all history */
  clear: () => void;
  
  /** Reset to initial state and clear history */
  reset: () => void;
  
  /** Start grouping history actions */
  startGroup: (label: string) => void;
  
  /** End current group */
  endGroup: () => void;
  
  /** Can undo? */
  canUndo: ReadonlySignal<boolean>;
  
  /** Can redo? */
  canRedo: ReadonlySignal<boolean>;
  
  /** Past states (oldest first) */
  past: ReadonlySignal<HistoryRecord<T>[]>;
  
  /** Future states (newest first) */
  future: ReadonlySignal<HistoryRecord<T>[]>;
  
  /** Go to a specific index in history */
  goTo: (index: number) => boolean;
  
  /** Subscribe to history changes */
  onChange: (callback: (event: HistoryChangeEvent<T>) => void) => () => void;
  
  /** Get full history for debugging */
  getHistory: () => {
    past: HistoryRecord<T>[];
    present: HistoryRecord<T>;
    future: HistoryRecord<T>[];
  };
}

/**
 * Create a reactive history controller
 */
export function createHistory<T>(
  options: HistoryOptions<T>
): ReactiveHistory<T> {
  const {
    initialState,
    maxHistory = 50,
    equals = Object.is,
    skipDuplicates = true,
    autoPush = false,
    persist = false,
    storageKey = 'reactive_history',
    throttleAutoPush = true,
    throttleMs = 500
  } = options;
  
  // Initialize state
  const [getState, setState] = createSignalPair<T>(initialState);
  
  // History stacks
  const [getPast, setPast] = createSignalPair<HistoryRecord<T>[]>([]);
  const [getFuture, setFuture] = createSignalPair<HistoryRecord<T>[]>([]);
  
  // Keep track of current state as a record too
  let currentRecord: HistoryRecord<T> = {
    state: initialState,
    timestamp: Date.now()
  };
  
  // Derived values for can undo/redo
  const [getCanUndo, setCanUndo] = createSignalPair(false);
  const [getCanRedo, setCanRedo] = createSignalPair(false);
  
  // Grouping
  let isGrouping = false;
  let currentGroup: HistoryGroup<T> | null = null;
  
  // Event listeners
  const changeListeners = new Set<(event: HistoryChangeEvent<T>) => void>();
  
  // Throttling for auto-push
  let throttleTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingPush = false;
  
  // Load persisted history if enabled
  if (persist && typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const { past, present, future } = JSON.parse(stored);
        
        if (past && present && future) {
          setPast(past);
          currentRecord = present;
          setState(present.state);
          setFuture(future);
          
          updateDerivedState();
        }
      }
    } catch (err) {
      console.error('Failed to load history from localStorage:', err);
    }
  }
  
  /**
   * Persist history to localStorage
   */
  function persistHistory(): void {
    if (persist && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            past: getPast(),
            present: currentRecord,
            future: getFuture()
          })
        );
      } catch (err) {
        console.error('Failed to save history to localStorage:', err);
      }
    }
  }
  
  /**
   * Notify listeners of a change
   */
  function notifyChange(
    type: HistoryChangeType,
    previous?: T,
    next?: T
  ): void {
    const event: HistoryChangeEvent<T> = {
      type,
      current: getState(),
      previous,
      next
    };
    
    for (const listener of changeListeners) {
      listener(event);
    }
  }
  
  /**
   * Update can undo/redo derived state
   */
  function updateDerivedState(): void {
    batch(() => {
      setCanUndo(getPast().length > 0);
      setCanRedo(getFuture().length > 0);
    });
  }
  
  /**
   * Push current state to history
   */
  function push(metadata?: any): void {
    const currentState = getState();
    const past = getPast();
    
    // If we're grouping, add to the current group
    if (isGrouping && currentGroup) {
      // Skip if this state is the same as the last one in the group
      const lastInGroup = currentGroup.records[currentGroup.records.length - 1];
      
      if (skipDuplicates && lastInGroup && equals(lastInGroup.state, currentState)) {
        return;
      }
      
      // Update current record 
      currentRecord = {
        state: currentState,
        timestamp: Date.now(),
        metadata
      };
      
      // Add to group
      currentGroup.records.push(currentRecord);
      
      return;
    }
    
    // Skip if this state is the same as the current one
    if (skipDuplicates && equals(currentRecord.state, currentState)) {
      return;
    }
    
    // Create new record
    const newRecord: HistoryRecord<T> = {
      state: currentState,
      timestamp: Date.now(),
      metadata
    };
    
    // Update stacks
    setPast([...past, currentRecord]);
    setFuture([]);
    
    // Limit history size
    if (past.length > maxHistory) {
      setPast(past.slice(past.length - maxHistory));
    }
    
    // Update current record
    currentRecord = newRecord;
    
    updateDerivedState();
    notifyChange('push', currentRecord.state);
    persistHistory();
  }
  
  /**
   * Set state with option to push to history
   */
  function setStateWithHistory(newState: T, pushToHistory = false): void {
    const previousState = getState();
    
    // Skip if the state hasn't changed
    if (skipDuplicates && equals(previousState, newState)) {
      return;
    }
    
    // Update state
    setState(newState);
    
    // Optionally push to history
    if (pushToHistory) {
      push();
    }
    // Handle auto-push
    else if (autoPush) {
      if (throttleAutoPush && throttleMs > 0) {
        pendingPush = true;
        
        // Only set a new timeout if one isn't already pending
        if (throttleTimeout === null) {
          throttleTimeout = setTimeout(() => {
            if (pendingPush) {
              push();
              pendingPush = false;
            }
            throttleTimeout = null;
          }, throttleMs);
        }
      } else {
        push();
      }
    }
  }
  
  /**
   * Undo the last action
   */
  function undo(): boolean {
    const past = getPast();
    
    if (past.length === 0) {
      return false;
    }
    
    const previousRecord = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    
    batch(() => {
      // Move current state to future
      setFuture([currentRecord, ...getFuture()]);
      
      // Set previous state as current
      currentRecord = previousRecord;
      setState(previousRecord.state);
      
      // Update past
      setPast(newPast);
      
      updateDerivedState();
    });
    
    notifyChange('undo', getState(), previousRecord.state);
    persistHistory();
    
    return true;
  }
  
  /**
   * Redo the last undone action
   */
  function redo(): boolean {
    const future = getFuture();
    
    if (future.length === 0) {
      return false;
    }
    
    const nextRecord = future[0];
    const newFuture = future.slice(1);
    
    batch(() => {
      // Move current state to past
      setPast([...getPast(), currentRecord]);
      
      // Set next state as current
      currentRecord = nextRecord;
      setState(nextRecord.state);
      
      // Update future
      setFuture(newFuture);
      
      updateDerivedState();
    });
    
    notifyChange('redo', getState(), nextRecord.state);
    persistHistory();
    
    return true;
  }
  
  /**
   * Clear all history
   */
  function clear(): void {
    batch(() => {
      setPast([]);
      setFuture([]);
      updateDerivedState();
    });
    
    notifyChange('clear');
    persistHistory();
  }
  
  /**
   * Reset to initial state
   */
  function reset(): void {
    batch(() => {
      setState(initialState);
      currentRecord = {
        state: initialState,
        timestamp: Date.now()
      };
      setPast([]);
      setFuture([]);
      updateDerivedState();
    });
    
    notifyChange('reset');
    persistHistory();
  }
  
  /**
   * Start a new history group
   */
  function startGroup(label: string): void {
    // End any existing group first
    if (isGrouping) {
      endGroup();
    }
    
    isGrouping = true;
    currentGroup = {
      records: [currentRecord],
      label,
      timestamp: Date.now()
    };
    
    notifyChange('group');
  }
  
  /**
   * End current history group
   */
  function endGroup(): void {
    if (!isGrouping || !currentGroup) {
      return;
    }
    
    isGrouping = false;
    
    // If we only have the initial record, no need to do anything
    if (currentGroup.records.length <= 1) {
      currentGroup = null;
      return;
    }
    
    // Take the last record as the current one
    currentRecord = currentGroup.records[currentGroup.records.length - 1];
    
    // Add the first record to the past
    const past = getPast();
    setPast([...past, currentGroup.records[0]]);
    
    // Limit history size
    if (past.length > maxHistory) {
      setPast(past.slice(past.length - maxHistory));
    }
    
    setFuture([]);
    updateDerivedState();
    
    currentGroup = null;
    
    persistHistory();
  }
  
  /**
   * Go to a specific index in history
   */
  function goTo(index: number): boolean {
    const past = getPast();
    
    if (index < 0 || index > past.length) {
      return false;
    }
    
    if (index === past.length) {
      // This is the current state, nothing to do
      return true;
    }
    
    // Get the target record
    const targetRecord = past[index];
    
    // Records before target stay in past
    const newPast = past.slice(0, index);
    
    // Current and records after target go to future
    const recordsAfterTarget = past.slice(index + 1);
    
    batch(() => {
      setPast(newPast);
      setFuture([currentRecord, ...recordsAfterTarget, ...getFuture()]);
      currentRecord = targetRecord;
      setState(targetRecord.state);
      
      updateDerivedState();
    });
    
    notifyChange('undo', getState(), targetRecord.state);
    persistHistory();
    
    return true;
  }
  
  /**
   * Subscribe to history changes
   */
  function onChange(callback: (event: HistoryChangeEvent<T>) => void): () => void {
    changeListeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      changeListeners.delete(callback);
    };
  }
  
  /**
   * Get full history (for debugging)
   */
  function getHistory() {
    return {
      past: getPast(),
      present: currentRecord,
      future: getFuture()
    };
  }
  
  // Update initial derived state
  updateDerivedState();
  
  return {
    state: getState,
    setState: setStateWithHistory,
    push,
    undo,
    redo,
    clear,
    reset,
    startGroup,
    endGroup,
    canUndo: getCanUndo,
    canRedo: getCanRedo,
    past: getPast,
    future: getFuture,
    goTo,
    onChange,
    getHistory
  };
}

/**
 * Create a state history that automatically tracks a signal
 */
export function createStateHistory<T>(
  signal: ReadonlySignal<T>,
  setter: (value: T) => void,
  options: Omit<HistoryOptions<T>, 'initialState'> = {}
): ReactiveHistory<T> {
  // Create history controller
  const history = createHistory<T>({
    initialState: signal(),
    ...options
  });
  
  // Set up auto-tracking
  let isFromHistory = false;
  
  // When the history state changes, update the signal
  history.onChange((event) => {
    isFromHistory = true;
    setter(event.current);
    isFromHistory = false;
  });
  
  // When the signal changes externally, update history
  const originalSetState = history.setState;
  history.setState = (value: T, pushToHistory = false) => {
    if (isFromHistory) {
      return; // Prevent recursive updates
    }
    originalSetState(value, pushToHistory);
  };
  
  return history;
} 