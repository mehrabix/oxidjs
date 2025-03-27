import { createHistory } from '../src/reactiveHistory';

describe('ReactiveHistory', () => {
  it('should initialize with the provided initial state', () => {
    const history = createHistory({
      initialState: { count: 0 }
    });
    
    expect(history.state()).toEqual({ count: 0 });
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });
  
  it('should track state changes in history', () => {
    const history = createHistory({
      initialState: { count: 0 }
    });
    
    // Make a state change
    history.setState({ count: 1 }, true);
    
    // Current state should reflect the change
    expect(history.state()).toEqual({ count: 1 });
    
    // Should be able to undo now
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
    
    // Past should include the initial state
    expect(history.past()).toHaveLength(1);
    expect(history.past()[0].state).toEqual({ count: 0 });
  });
  
  it('should undo and redo state changes', () => {
    const history = createHistory({
      initialState: { count: 0 }
    });
    
    // Make two state changes
    history.setState({ count: 1 }, true);
    history.setState({ count: 2 }, true);
    
    // Undo one step
    history.undo();
    
    // State should be back to the first change
    expect(history.state()).toEqual({ count: 1 });
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(true);
    
    // Redo the step
    history.redo();
    
    // State should be back to the latest
    expect(history.state()).toEqual({ count: 2 });
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });
  
  it('should clear history when requested', () => {
    const history = createHistory({
      initialState: { count: 0 }
    });
    
    // Make some state changes
    history.setState({ count: 1 }, true);
    history.setState({ count: 2 }, true);
    
    // Clear history
    history.clear();
    
    // State should remain the same
    expect(history.state()).toEqual({ count: 2 });
    
    // But history should be cleared
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.past()).toHaveLength(0);
    expect(history.future()).toHaveLength(0);
  });
  
  it('should reset to initial state', () => {
    const history = createHistory({
      initialState: { count: 0 }
    });
    
    // Make some state changes
    history.setState({ count: 10 }, true);
    
    // Reset
    history.reset();
    
    // State should be back to initial
    expect(history.state()).toEqual({ count: 0 });
    
    // History should be cleared
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.past()).toHaveLength(0);
    expect(history.future()).toHaveLength(0);
  });
  
  it('should support history with explicit push', () => {
    const history = createHistory({
      initialState: { count: 0 },
      autoPush: false
    });
    
    // Change state without pushing to history
    history.setState({ count: 1 });
    
    // No history should be recorded yet
    expect(history.canUndo()).toBe(false);
    
    // Explicitly push current state to history
    history.push();
    
    // Change state again
    history.setState({ count: 2 });
    
    // Should be able to undo now
    expect(history.canUndo()).toBe(true);
    
    // Undo
    history.undo();
    
    // State should be back to 1
    expect(history.state()).toEqual({ count: 1 });
  });
  
  it('should group related actions', () => {
    const history = createHistory({
      initialState: { count: 0 }
    });
    
    // Start a group
    history.startGroup('Increment multiple times');
    
    // Make multiple state changes within the group
    history.setState({ count: 1 }, true);
    history.setState({ count: 2 }, true);
    history.setState({ count: 3 }, true);
    
    // End the group
    history.endGroup();
    
    // All three changes should be treated as one in history
    expect(history.past()).toHaveLength(1);
    
    // Undo should revert all changes at once
    history.undo();
    
    // State should be back to initial
    expect(history.state()).toEqual({ count: 0 });
  });
  
  it('should enforce maximum history size', () => {
    const history = createHistory({
      initialState: { count: 0 },
      maxHistory: 2
    });
    
    // Make three state changes
    history.setState({ count: 1 }, true);
    history.setState({ count: 2 }, true);
    history.setState({ count: 3 }, true);
    
    // Only the two most recent states should be in history
    expect(history.past()).toHaveLength(2);
    
    // First state should have been discarded
    expect(history.past()[0].state).toEqual({ count: 1 });
    expect(history.past()[1].state).toEqual({ count: 2 });
    
    // We should only be able to undo twice
    history.undo(); // to count: 2
    history.undo(); // to count: 1
    
    // Can't undo further
    expect(history.canUndo()).toBe(false);
    expect(history.state()).toEqual({ count: 1 });
  });
  
  it('should skip duplicate states when configured', () => {
    const history = createHistory({
      initialState: { count: 0 },
      skipDuplicates: true
    });
    
    // Make a state change
    history.setState({ count: 1 }, true);
    
    // Make the same state change again
    history.setState({ count: 1 }, true);
    
    // Only one entry should be in history
    expect(history.past()).toHaveLength(1);
    
    // Make a different change
    history.setState({ count: 2 }, true);
    
    // Now there should be two entries
    expect(history.past()).toHaveLength(2);
  });
  
  it('should notify of history changes', () => {
    const history = createHistory({
      initialState: { count: 0 }
    });
    
    // Set up a change listener
    const changeEvents: string[] = [];
    const unsubscribe = history.onChange(event => {
      changeEvents.push(event.type);
    });
    
    // Make changes and operations
    history.setState({ count: 1 }, true); // push
    history.undo(); // undo
    history.redo(); // redo
    history.clear(); // clear
    
    // Should have recorded all events
    expect(changeEvents).toContain('push');
    expect(changeEvents).toContain('undo');
    expect(changeEvents).toContain('redo');
    expect(changeEvents).toContain('clear');
    
    // Cleanup listener
    unsubscribe();
  });
  
  it('should support jumping to a specific point in history', () => {
    const history = createHistory({
      initialState: { count: 0 }
    });
    
    // Build up some history
    history.setState({ count: 10 }, true);
    history.setState({ count: 20 }, true);
    history.setState({ count: 30 }, true);
    history.setState({ count: 40 }, true);
    
    // Jump to the second state (index 1 in past array)
    history.goTo(1);
    
    // State should be at that point
    expect(history.state()).toEqual({ count: 20 });
    
    // Future should contain the states we skipped
    expect(history.future()).toHaveLength(2);
    expect(history.future()[0].state).toEqual({ count: 30 });
    expect(history.future()[1].state).toEqual({ count: 40 });
  });
  
  it('should get the full history for debugging', () => {
    const history = createHistory({
      initialState: { count: 0 }
    });
    
    // Build up some history
    history.setState({ count: 10 }, true);
    history.undo();
    history.setState({ count: 20 }, true);
    
    // Get the full history
    const fullHistory = history.getHistory();
    
    // Should include past, present, and future
    expect(fullHistory.past).toBeDefined();
    expect(fullHistory.present).toBeDefined();
    expect(fullHistory.future).toBeDefined();
    
    // Present should match current state
    expect(fullHistory.present.state).toEqual({ count: 20 });
    
    // Past should include initial state
    expect(fullHistory.past[0].state).toEqual({ count: 0 });
    
    // Future should be empty (we're at the latest state)
    expect(fullHistory.future).toHaveLength(0);
  });
}); 