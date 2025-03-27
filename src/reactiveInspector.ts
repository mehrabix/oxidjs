import { createSignalPair, ReadonlySignal } from './signal';
import { createEffect } from './effect';

/**
 * Metadata about a signal
 */
export interface SignalMeta {
  /** Unique identifier for this signal */
  id: string;
  /** User-friendly name for this signal */
  name: string;
  /** Type of signal (raw, computed, resource, etc.) */
  type: string;
  /** When the signal was created */
  createdAt: number;
  /** Last time the signal value changed */
  lastUpdatedAt: number;
  /** Number of times the signal has been updated */
  updateCount: number;
  /** IDs of signals this signal depends on */
  dependencies: string[];
  /** IDs of signals that depend on this signal */
  dependents: string[];
  /** Whether this signal is active (has subscribers) */
  active: boolean;
  /** Average compute time in milliseconds */
  avgComputeTime: number;
  /** Maximum compute time in milliseconds */
  maxComputeTime: number;
  /** Current value (may be redacted for privacy) */
  currentValue: any;
}

/**
 * Information about a signal update
 */
export interface UpdateRecord {
  /** Signal ID */
  signalId: string;
  /** Signal name */
  signalName: string;
  /** Timestamp when update occurred */
  timestamp: number;
  /** Previous value */
  previousValue: any;
  /** New value */
  newValue: any;
  /** Time taken to compute in milliseconds */
  computeTime: number;
  /** Whether update caused a rerender */
  causedRerender: boolean;
}

/**
 * Information about a detected cycle
 */
export interface CycleInfo {
  /** Cycle path as signal IDs */
  path: string[];
  /** Signal names in the cycle for better readability */
  names: string[];
  /** Timestamp when detected */
  detectedAt: number;
}

/**
 * Signal dependency graph
 */
export interface DependencyGraph {
  /** All signal nodes */
  nodes: SignalMeta[];
  /** Connections between signals */
  edges: Array<{
    from: string;
    to: string;
  }>;
}

/**
 * Signal performance metrics
 */
export interface PerformanceMetrics {
  /** Signal ID */
  signalId: string;
  /** Signal name */
  signalName: string;
  /** Update frequency (updates per second) */
  updateFrequency: number;
  /** Average computation time */
  avgComputeTime: number;
  /** Max computation time */
  maxComputeTime: number;
  /** Total computation time spent */
  totalComputeTime: number;
  /** Number of dependents */
  dependentCount: number;
  /** Estimated cost impact (higher means more expensive) */
  costImpact: number;
}

/**
 * A snapshot of the reactive system's state
 */
export interface SystemSnapshot {
  /** Timestamp when snapshot was taken */
  timestamp: number;
  /** All registered signals */
  signals: Record<string, SignalMeta>;
  /** Recent update records */
  recentUpdates: UpdateRecord[];
  /** Detected cycles */
  detectedCycles: CycleInfo[];
  /** Dependency graph */
  dependencyGraph: DependencyGraph;
  /** Performance metrics */
  performanceMetrics: PerformanceMetrics[];
}

/**
 * Options for the reactive inspector
 */
export interface InspectorOptions {
  /** How many update records to keep */
  maxUpdateRecords?: number;
  /** Whether to track signal values */
  trackValues?: boolean;
  /** Whether to redact certain values for privacy */
  redactSensitiveValues?: boolean;
  /** Whether to track dependency graph */
  trackDependencies?: boolean;
  /** Whether to track performance metrics */
  trackPerformance?: boolean;
  /** Whether to persist data between page reloads */
  persist?: boolean;
  /** Storage key if persistence is enabled */
  storageKey?: string;
  /** Whether to enable dev tools integration */
  enableDevTools?: boolean;
}

/**
 * Reactive inspector instance
 */
export interface ReactiveInspector {
  /** Register a signal with the inspector */
  registerSignal: (
    id: string,
    name: string,
    type: string,
    initialValue: any
  ) => void;
  /** Unregister a signal */
  unregisterSignal: (id: string) => void;
  /** Report a signal update */
  reportUpdate: (
    id: string,
    previousValue: any,
    newValue: any,
    computeTime: number
  ) => void;
  /** Report a dependency relationship */
  reportDependency: (dependentId: string, dependencyId: string) => void;
  /** Remove a dependency relationship */
  removeDependency: (dependentId: string, dependencyId: string) => void;
  /** Report a signal subscription */
  reportSubscription: (id: string) => void;
  /** Report a signal unsubscription */
  reportUnsubscription: (id: string) => void;
  /** Get the system snapshot */
  getSnapshot: () => SystemSnapshot;
  /** Get a signal's metadata */
  getSignalMeta: (id: string) => SignalMeta | undefined;
  /** Reset all inspector data */
  reset: () => void;
  /** Get system snapshot as a signal */
  snapshot: ReadonlySignal<SystemSnapshot>;
  /** Find problematic signals (most expensive) */
  findProblematicSignals: () => PerformanceMetrics[];
  /** Check for cycles in the dependency graph */
  checkForCycles: () => CycleInfo[];
  /** Export data as JSON */
  exportData: () => string;
  /** Import data from JSON */
  importData: (json: string) => void;
  /** Visualize the dependency graph */
  visualizeDependencyGraph: () => string;
}

/**
 * Create a reactive inspector
 */
export function createReactiveInspector(
  options: InspectorOptions = {}
): ReactiveInspector {
  const {
    maxUpdateRecords = 100,
    trackValues = true,
    redactSensitiveValues = true,
    trackDependencies = true,
    trackPerformance = true,
    persist = false,
    storageKey = 'reactive_inspector',
    enableDevTools = false
  } = options;
  
  // Signal metadata storage
  const signals: Record<string, SignalMeta> = {};
  
  // Recent update records
  const updates: UpdateRecord[] = [];
  
  // Detected cycles
  const cycles: CycleInfo[] = [];
  
  // Time window for calculating update frequency (ms)
  const UPDATE_FREQUENCY_WINDOW = 5000;
  
  // Update timestamps by signal for calculating frequency
  const updateTimestamps: Record<string, number[]> = {};
  
  // Create state signal
  const initialSnapshot: SystemSnapshot = {
    timestamp: Date.now(),
    signals: {},
    recentUpdates: [],
    detectedCycles: [],
    dependencyGraph: { nodes: [], edges: [] },
    performanceMetrics: []
  };
  
  const [getSnapshot, setSnapshot] = createSignalPair<SystemSnapshot>(initialSnapshot);
  
  /**
   * Update the snapshot state
   */
  function updateSnapshot(): void {
    // Calculate dependency graph
    const graph: DependencyGraph = {
      nodes: Object.values(signals),
      edges: []
    };
    
    if (trackDependencies) {
      for (const signal of Object.values(signals)) {
        for (const depId of signal.dependencies) {
          graph.edges.push({
            from: depId,
            to: signal.id
          });
        }
      }
    }
    
    // Calculate performance metrics
    const metrics: PerformanceMetrics[] = [];
    
    if (trackPerformance) {
      for (const signal of Object.values(signals)) {
        // Calculate update frequency
        const now = Date.now();
        const recentUpdates = (updateTimestamps[signal.id] || [])
          .filter(timestamp => now - timestamp < UPDATE_FREQUENCY_WINDOW);
        
        const updateFrequency = recentUpdates.length / (UPDATE_FREQUENCY_WINDOW / 1000);
        
        // Calculate cost impact
        const dependentCount = signal.dependents.length;
        const costImpact = updateFrequency * dependentCount * signal.avgComputeTime;
        
        metrics.push({
          signalId: signal.id,
          signalName: signal.name,
          updateFrequency,
          avgComputeTime: signal.avgComputeTime,
          maxComputeTime: signal.maxComputeTime,
          totalComputeTime: signal.updateCount * signal.avgComputeTime,
          dependentCount,
          costImpact
        });
      }
      
      // Sort by cost impact (most expensive first)
      metrics.sort((a, b) => b.costImpact - a.costImpact);
    }
    
    // Update snapshot
    setSnapshot({
      timestamp: Date.now(),
      signals,
      recentUpdates: [...updates],
      detectedCycles: [...cycles],
      dependencyGraph: graph,
      performanceMetrics: metrics
    });
  }
  
  /**
   * Process a value according to privacy settings
   */
  function processValue(value: any): any {
    if (!trackValues) {
      return '[Value tracking disabled]';
    }
    
    if (redactSensitiveValues) {
      // Redact potential sensitive data
      if (value === null || value === undefined) {
        return value;
      }
      
      if (typeof value === 'object') {
        // If it's an object, we show the structure but redact specific values
        if (Array.isArray(value)) {
          return `Array(${value.length})`;
        }
        
        // For objects, show keys but not values
        return `Object{${Object.keys(value).join(', ')}}`;
      }
      
      // For sensitive looking string values
      if (typeof value === 'string') {
        // Redact if it looks like a password, token, key, or long string
        if (
          value.length > 20 || 
          /password|token|secret|key|auth/i.test(value)
        ) {
          return '[REDACTED]';
        }
      }
    }
    
    return value;
  }
  
  /**
   * Register a signal with the inspector
   */
  function registerSignal(
    id: string,
    name: string,
    type: string,
    initialValue: any
  ): void {
    signals[id] = {
      id,
      name,
      type,
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      updateCount: 0,
      dependencies: [],
      dependents: [],
      active: false,
      avgComputeTime: 0,
      maxComputeTime: 0,
      currentValue: processValue(initialValue)
    };
    
    updateTimestamps[id] = [];
    updateSnapshot();
  }
  
  /**
   * Unregister a signal
   */
  function unregisterSignal(id: string): void {
    if (!signals[id]) {
      return;
    }
    
    // Remove from dependents and dependencies lists
    for (const depId of signals[id].dependencies) {
      if (signals[depId]) {
        signals[depId].dependents = signals[depId].dependents.filter(
          did => did !== id
        );
      }
    }
    
    for (const depId of signals[id].dependents) {
      if (signals[depId]) {
        signals[depId].dependencies = signals[depId].dependencies.filter(
          did => did !== id
        );
      }
    }
    
    // Remove the signal
    delete signals[id];
    delete updateTimestamps[id];
    
    updateSnapshot();
  }
  
  /**
   * Report a signal update
   */
  function reportUpdate(
    id: string,
    previousValue: any,
    newValue: any,
    computeTime: number
  ): void {
    if (!signals[id]) {
      return;
    }
    
    const now = Date.now();
    
    // Update timestamps for calculating frequency
    if (!updateTimestamps[id]) {
      updateTimestamps[id] = [];
    }
    updateTimestamps[id].push(now);
    
    // Keep only recent timestamps for frequency calculation
    updateTimestamps[id] = updateTimestamps[id].filter(
      ts => now - ts < UPDATE_FREQUENCY_WINDOW
    );
    
    // Record the update
    const updateRecord: UpdateRecord = {
      signalId: id,
      signalName: signals[id].name,
      timestamp: now,
      previousValue: processValue(previousValue),
      newValue: processValue(newValue),
      computeTime,
      causedRerender: signals[id].active
    };
    
    // Update recent updates list
    updates.unshift(updateRecord);
    if (updates.length > maxUpdateRecords) {
      updates.length = maxUpdateRecords;
    }
    
    // Update signal metadata
    const signal = signals[id];
    
    // Update compute time metrics
    const newAvgTime = 
      (signal.avgComputeTime * signal.updateCount + computeTime) / 
      (signal.updateCount + 1);
    
    signals[id] = {
      ...signal,
      lastUpdatedAt: now,
      updateCount: signal.updateCount + 1,
      avgComputeTime: newAvgTime,
      maxComputeTime: Math.max(signal.maxComputeTime, computeTime),
      currentValue: processValue(newValue)
    };
    
    updateSnapshot();
  }
  
  /**
   * Report a dependency relationship
   */
  function reportDependency(dependentId: string, dependencyId: string): void {
    if (!trackDependencies) return;
    
    if (!signals[dependentId] || !signals[dependencyId]) {
      return;
    }
    
    // Avoid duplicate dependencies
    if (!signals[dependentId].dependencies.includes(dependencyId)) {
      signals[dependentId].dependencies.push(dependencyId);
    }
    
    // Add to dependents list
    if (!signals[dependencyId].dependents.includes(dependentId)) {
      signals[dependencyId].dependents.push(dependentId);
    }
    
    // Check for cycles
    const newCycles = checkForCycles();
    if (newCycles.length > 0) {
      // Only add unique cycles
      for (const cycle of newCycles) {
        const cycleKey = cycle.path.join('-');
        if (!cycles.some(c => c.path.join('-') === cycleKey)) {
          cycles.push(cycle);
        }
      }
    }
    
    updateSnapshot();
  }
  
  /**
   * Remove a dependency relationship
   */
  function removeDependency(dependentId: string, dependencyId: string): void {
    if (!trackDependencies) return;
    
    if (!signals[dependentId] || !signals[dependencyId]) {
      return;
    }
    
    // Remove from dependencies list
    signals[dependentId].dependencies = signals[dependentId].dependencies.filter(
      id => id !== dependencyId
    );
    
    // Remove from dependents list
    signals[dependencyId].dependents = signals[dependencyId].dependents.filter(
      id => id !== dependentId
    );
    
    updateSnapshot();
  }
  
  /**
   * Report a signal subscription
   */
  function reportSubscription(id: string): void {
    if (!signals[id]) {
      return;
    }
    
    signals[id].active = true;
    updateSnapshot();
  }
  
  /**
   * Report a signal unsubscription
   */
  function reportUnsubscription(id: string): void {
    if (!signals[id]) {
      return;
    }
    
    signals[id].active = false;
    updateSnapshot();
  }
  
  /**
   * Get a signal's metadata
   */
  function getSignalMeta(id: string): SignalMeta | undefined {
    return signals[id];
  }
  
  /**
   * Reset all inspector data
   */
  function reset(): void {
    for (const id in signals) {
      delete signals[id];
    }
    
    updates.length = 0;
    cycles.length = 0;
    
    for (const id in updateTimestamps) {
      delete updateTimestamps[id];
    }
    
    updateSnapshot();
  }
  
  /**
   * Find problematic signals (most expensive)
   */
  function findProblematicSignals(): PerformanceMetrics[] {
    if (!trackPerformance) {
      return [];
    }
    
    // Calculate metrics on demand
    const metrics: PerformanceMetrics[] = [];
    
    for (const signal of Object.values(signals)) {
      // Calculate update frequency
      const now = Date.now();
      const recentUpdates = (updateTimestamps[signal.id] || [])
        .filter(timestamp => now - timestamp < UPDATE_FREQUENCY_WINDOW);
      
      const updateFrequency = recentUpdates.length / (UPDATE_FREQUENCY_WINDOW / 1000);
      
      // Calculate cost impact
      const dependentCount = signal.dependents.length;
      const costImpact = updateFrequency * dependentCount * signal.avgComputeTime;
      
      metrics.push({
        signalId: signal.id,
        signalName: signal.name,
        updateFrequency,
        avgComputeTime: signal.avgComputeTime,
        maxComputeTime: signal.maxComputeTime,
        totalComputeTime: signal.updateCount * signal.avgComputeTime,
        dependentCount,
        costImpact
      });
    }
    
    // Sort by cost impact (most expensive first)
    return metrics.sort((a, b) => b.costImpact - a.costImpact);
  }
  
  /**
   * Check for cycles in the dependency graph
   */
  function checkForCycles(): CycleInfo[] {
    if (!trackDependencies) {
      return [];
    }
    
    const result: CycleInfo[] = [];
    const visited = new Set<string>();
    const path: string[] = [];
    const onPath = new Set<string>();
    
    function dfs(signalId: string): void {
      if (onPath.has(signalId)) {
        // Found a cycle
        const cycleStart = path.indexOf(signalId);
        const cyclePath = path.slice(cycleStart).concat(signalId);
        
        result.push({
          path: cyclePath,
          names: cyclePath.map(id => signals[id]?.name || id),
          detectedAt: Date.now()
        });
        return;
      }
      
      if (visited.has(signalId)) {
        return;
      }
      
      visited.add(signalId);
      onPath.add(signalId);
      path.push(signalId);
      
      const signal = signals[signalId];
      if (signal) {
        for (const depId of signal.dependents) {
          dfs(depId);
        }
      }
      
      path.pop();
      onPath.delete(signalId);
    }
    
    // Check from each signal
    for (const id in signals) {
      if (!visited.has(id)) {
        dfs(id);
      }
    }
    
    return result;
  }
  
  /**
   * Export data as JSON
   */
  function exportData(): string {
    return JSON.stringify({
      timestamp: Date.now(),
      signals,
      updates,
      cycles
    }, null, 2);
  }
  
  /**
   * Import data from JSON
   */
  function importData(json: string): void {
    try {
      const data = JSON.parse(json);
      
      // Reset current data
      reset();
      
      // Import data
      Object.assign(signals, data.signals || {});
      
      if (data.updates && Array.isArray(data.updates)) {
        updates.push(...data.updates.slice(0, maxUpdateRecords));
      }
      
      if (data.cycles && Array.isArray(data.cycles)) {
        cycles.push(...data.cycles);
      }
      
      // Reconstruct update timestamps
      for (const update of updates) {
        if (!updateTimestamps[update.signalId]) {
          updateTimestamps[update.signalId] = [];
        }
        updateTimestamps[update.signalId].push(update.timestamp);
      }
      
      updateSnapshot();
    } catch (err) {
      console.error('Failed to import inspector data:', err);
    }
  }
  
  /**
   * Generate a DOT format representation of the dependency graph
   * Can be visualized with tools like Graphviz
   */
  function visualizeDependencyGraph(): string {
    if (!trackDependencies) {
      return 'Dependency tracking is disabled';
    }
    
    let dot = 'digraph DependencyGraph {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box, style=filled, fontname="Arial"];\n\n';
    
    // Add nodes
    for (const signal of Object.values(signals)) {
      const color = signal.active ? 'lightblue' : 'lightgrey';
      const label = `${signal.name}\\n(${signal.type})\\nUpdates: ${signal.updateCount}`;
      dot += `  "${signal.id}" [label="${label}", fillcolor="${color}"];\n`;
    }
    
    dot += '\n';
    
    // Add edges
    for (const signal of Object.values(signals)) {
      for (const depId of signal.dependencies) {
        dot += `  "${depId}" -> "${signal.id}";\n`;
      }
    }
    
    dot += '}\n';
    
    return dot;
  }
  
  // Set up persistence if required
  if (persist && typeof window !== 'undefined') {
    // Load from localStorage on init
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        importData(stored);
      }
    } catch (err) {
      console.error('Failed to load inspector state:', err);
    }
    
    // Set up effect to save to localStorage
    createEffect(() => {
      try {
        window.localStorage.setItem(storageKey, exportData());
      } catch (err) {
        console.error('Failed to save inspector state:', err);
      }
    });
  }
  
  // Set up dev tools integration if enabled
  if (enableDevTools && typeof window !== 'undefined') {
    // Create a custom window property for dev tools access
    (window as any).__REACTIVE_INSPECTOR__ = {
      getSnapshot: () => getSnapshot(),
      findProblematicSignals,
      checkForCycles,
      visualizeDependencyGraph,
      exportData,
      reset
    };
    
    console.log(
      '%cReactive Inspector: Available via window.__REACTIVE_INSPECTOR__',
      'color: #4CAF50; font-weight: bold; font-size: 12px;'
    );
  }
  
  // Return the public API
  return {
    registerSignal,
    unregisterSignal,
    reportUpdate,
    reportDependency,
    removeDependency,
    reportSubscription,
    reportUnsubscription,
    getSnapshot,
    getSignalMeta,
    reset,
    snapshot: getSnapshot,
    findProblematicSignals,
    checkForCycles,
    exportData,
    importData,
    visualizeDependencyGraph
  };
}

// Singleton inspector instance
let globalInspector: ReactiveInspector | null = null;

/**
 * Get or create the global inspector instance
 */
export function getInspector(options?: InspectorOptions): ReactiveInspector {
  if (!globalInspector) {
    globalInspector = createReactiveInspector(options);
  }
  return globalInspector;
}

/**
 * Reset the global inspector
 */
export function resetInspector(): void {
  if (globalInspector) {
    globalInspector.reset();
  }
}

/**
 * Enable inspector hooks for all signals
 * This function should be called early to patch signal creation
 */
export function enableInspectorHooks(): void {
  // This would typically patch the internal signal implementation
  // to automatically register with the inspector
  console.warn(
    'enableInspectorHooks() needs to be implemented by patching the signal implementation'
  );
} 