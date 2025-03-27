import { createReactiveInspector, ReactiveInspector } from '../src/reactiveInspector';

describe('ReactiveInspector', () => {
  let inspector: ReactiveInspector;

  beforeEach(() => {
    inspector = createReactiveInspector({
      maxUpdateRecords: 100,
      trackValues: true,
      enableDevTools: false
    });
    // Reset before each test
    inspector.reset();
  });

  it('should register signals and track their metadata', () => {
    // Register a signal
    inspector.registerSignal('signal1', 'Test Signal', 'raw', 'initial value');
    
    // Get metadata for the signal
    const meta = inspector.getSignalMeta('signal1');
    
    // Verify metadata is tracked correctly
    expect(meta).toBeDefined();
    expect(meta?.name).toBe('Test Signal');
    expect(meta?.type).toBe('raw');
    expect(meta?.currentValue).toBe('initial value');
    expect(meta?.dependencies).toEqual([]);
    expect(meta?.dependents).toEqual([]);
    expect(meta?.updateCount).toBe(0);
  });

  it('should track signal updates', () => {
    // Register a signal
    inspector.registerSignal('signal1', 'Test Signal', 'raw', 'initial value');
    
    // Report an update
    inspector.reportUpdate('signal1', 'initial value', 'updated value', 0.5);
    
    // Get snapshot
    const snapshot = inspector.getSnapshot();
    
    // Verify update was tracked
    expect(snapshot.signals['signal1'].updateCount).toBe(1);
    expect(snapshot.signals['signal1'].currentValue).toBe('updated value');
    expect(snapshot.recentUpdates.length).toBe(1);
    expect(snapshot.recentUpdates[0].signalId).toBe('signal1');
    expect(snapshot.recentUpdates[0].previousValue).toBe('initial value');
    expect(snapshot.recentUpdates[0].newValue).toBe('updated value');
    expect(snapshot.recentUpdates[0].computeTime).toBe(0.5);
  });

  it('should track dependencies between signals', () => {
    // Register signals
    inspector.registerSignal('dep', 'Dependency', 'raw', 'dep value');
    inspector.registerSignal('derived', 'Derived', 'computed', 'derived value');
    
    // Report dependency relationship
    inspector.reportDependency('derived', 'dep');
    
    // Get snapshot
    const snapshot = inspector.getSnapshot();
    
    // Verify dependency relationship is tracked
    expect(snapshot.signals['derived'].dependencies).toContain('dep');
    expect(snapshot.signals['dep'].dependents).toContain('derived');
    
    // Dependency graph should include this relationship
    const graph = snapshot.dependencyGraph;
    const edge = graph.edges.find(e => e.from === 'dep' && e.to === 'derived');
    expect(edge).toBeDefined();
  });

  it('should remove dependencies when specified', () => {
    // Setup dependencies
    inspector.registerSignal('dep', 'Dependency', 'raw', 'dep value');
    inspector.registerSignal('derived', 'Derived', 'computed', 'derived value');
    inspector.reportDependency('derived', 'dep');
    
    // Remove dependency
    inspector.removeDependency('derived', 'dep');
    
    // Get snapshot
    const snapshot = inspector.getSnapshot();
    
    // Verify dependency relationship is removed
    expect(snapshot.signals['derived'].dependencies).not.toContain('dep');
    expect(snapshot.signals['dep'].dependents).not.toContain('derived');
  });

  it('should track subscription status of signals', () => {
    // Register a signal
    inspector.registerSignal('signal1', 'Test Signal', 'raw', 'value');
    
    // Initially not active
    expect(inspector.getSignalMeta('signal1')?.active).toBe(false);
    
    // Report subscription
    inspector.reportSubscription('signal1');
    
    // Should be active
    expect(inspector.getSignalMeta('signal1')?.active).toBe(true);
    
    // Report unsubscription
    inspector.reportUnsubscription('signal1');
    
    // Should be inactive again
    expect(inspector.getSignalMeta('signal1')?.active).toBe(false);
  });

  it('should detect cycles in the dependency graph', () => {
    // Create a cycle: A -> B -> C -> A
    inspector.registerSignal('A', 'Signal A', 'computed', 'A');
    inspector.registerSignal('B', 'Signal B', 'computed', 'B');
    inspector.registerSignal('C', 'Signal C', 'computed', 'C');
    
    inspector.reportDependency('A', 'B');
    inspector.reportDependency('B', 'C');
    inspector.reportDependency('C', 'A');
    
    // Check for cycles
    const cycles = inspector.checkForCycles();
    
    // Should detect the cycle
    expect(cycles.length).toBeGreaterThan(0);
    const cycle = cycles[0];
    
    // The cycle path should contain our signals
    expect(cycle.path).toContain('A');
    expect(cycle.path).toContain('B');
    expect(cycle.path).toContain('C');
  });

  it('should unregister signals', () => {
    // Register a signal
    inspector.registerSignal('signal1', 'Test Signal', 'raw', 'value');
    
    // Verify it exists
    expect(inspector.getSignalMeta('signal1')).toBeDefined();
    
    // Unregister it
    inspector.unregisterSignal('signal1');
    
    // Should be gone
    expect(inspector.getSignalMeta('signal1')).toBeUndefined();
  });

  it('should identify problematic signals', () => {
    // Register signals with different performance characteristics
    inspector.registerSignal('fast', 'Fast Signal', 'raw', 'value');
    inspector.registerSignal('slow', 'Slow Signal', 'computed', 'value');
    
    // Report updates with different compute times
    inspector.reportUpdate('fast', 'old', 'new', 0.1);
    inspector.reportUpdate('slow', 'old', 'new', 10.0);
    
    // Get problematic signals
    const problematic = inspector.findProblematicSignals();
    
    // Should identify the slow signal
    expect(problematic.length).toBeGreaterThan(0);
    const slowSignal = problematic.find(s => s.signalId === 'slow');
    expect(slowSignal).toBeDefined();
    expect(slowSignal?.avgComputeTime).toBe(10.0);
  });

  it('should reset all inspector data', () => {
    // Register a signal and report updates
    inspector.registerSignal('signal1', 'Test Signal', 'raw', 'initial');
    inspector.reportUpdate('signal1', 'initial', 'updated', 0.5);
    
    // Verify data exists
    expect(inspector.getSignalMeta('signal1')).toBeDefined();
    expect(inspector.getSnapshot().recentUpdates.length).toBeGreaterThan(0);
    
    // Reset
    inspector.reset();
    
    // All data should be cleared
    expect(inspector.getSignalMeta('signal1')).toBeUndefined();
    expect(inspector.getSnapshot().recentUpdates.length).toBe(0);
  });

  it('should export and import data', () => {
    // Register a signal and create dependencies
    inspector.registerSignal('A', 'Signal A', 'raw', 'A value');
    inspector.registerSignal('B', 'Signal B', 'computed', 'B value');
    inspector.reportDependency('B', 'A');
    
    // Export the data
    const exportedData = inspector.exportData();
    
    // Reset
    inspector.reset();
    
    // Verify data is gone
    expect(inspector.getSignalMeta('A')).toBeUndefined();
    
    // Import the data back
    inspector.importData(exportedData);
    
    // Verify data is restored
    expect(inspector.getSignalMeta('A')).toBeDefined();
    expect(inspector.getSignalMeta('A')?.name).toBe('Signal A');
    expect(inspector.getSignalMeta('B')?.dependencies).toContain('A');
  });
}); 