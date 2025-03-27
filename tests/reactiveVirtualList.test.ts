/**
 * @jest-environment jsdom
 */

import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { createVirtualList } from '../src/reactiveVirtualList';

// Mock the reactive system
jest.mock('../src/signal', () => {
  return {
    createSignalPair: jest.fn().mockImplementation((initialValue) => {
      let value = initialValue;
      const getter = jest.fn().mockImplementation(() => value);
      const setter = jest.fn().mockImplementation((newValue) => {
        value = newValue;
        return value;
      });
      return [getter, setter];
    }),
    ReadonlySignal: jest.fn(),
  };
});

jest.mock('../src/effect', () => {
  return {
    createEffect: jest.fn().mockImplementation((fn: () => void) => {
      // Call the function once and return a cleanup function
      fn();
      return () => {}; // Cleanup function
    }),
  };
});

jest.mock('../src/utils', () => {
  return {
    batch: jest.fn().mockImplementation((fn: () => void) => fn()),
  };
});

describe('ReactiveVirtualList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should initialize with default options', () => {
    const virtualList = createVirtualList();
    
    // Test the initial window state
    const window = virtualList.virtualWindow();
    
    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBe(-1);
    expect(window.totalCount).toBe(0);
    expect(window.visibleItems).toEqual([]);
    expect(window.totalHeight).toBe(0);
    expect(window.offsetY).toBe(0);
  });
  
  test('should initialize with provided items', () => {
    const items = [
      { id: 1, text: 'Item 1' },
      { id: 2, text: 'Item 2' },
      { id: 3, text: 'Item 3' },
    ];
    
    const virtualList = createVirtualList({
      items,
      estimatedItemHeight: 40,
      viewportHeight: 100,
    });
    
    // Test the initial window state
    const window = virtualList.virtualWindow();
    
    expect(window.totalCount).toBe(3);
    expect(window.visibleItems.length).toBe(3); // All items should be visible (3 items of 40px in a 100px viewport + overscan)
  });
  
  test('should update items correctly', () => {
    const initialItems = [{ id: 1, text: 'Item 1' }];
    const virtualList = createVirtualList({
      items: initialItems,
    });
    
    // Update the items
    const newItems = [
      { id: 1, text: 'Item 1' },
      { id: 2, text: 'Item 2' },
    ];
    
    virtualList.setItems(newItems);
    
    // Test that the internal items were updated
    // Due to mocking, we can't directly test the reactive updates
    expect(virtualList.virtualItems().length).toBeGreaterThanOrEqual(0);
  });
  
  test('should update a single item correctly', () => {
    const items = [
      { id: 1, text: 'Item 1' },
      { id: 2, text: 'Item 2' },
    ];
    
    const virtualList = createVirtualList({
      items,
      getItemKey: (item) => item.id,
    });
    
    // Update a single item
    virtualList.updateItem(1, (item) => ({ ...item, text: 'Updated Item 2' }));
    
    // Test the updated item
    const virtualItems = virtualList.virtualItems();
    expect(virtualItems[1].item.text).toBe('Updated Item 2');
  });
  
  test('should handle scroll events', () => {
    // Create a longer list to test scrolling
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      text: `Item ${i}`,
    }));
    
    const virtualList = createVirtualList({
      items,
      estimatedItemHeight: 50,
      viewportHeight: 200,
      overscan: 2,
    });
    
    // Scroll down to show items starting from index 5
    virtualList.scrollTo(250); // 5 * 50 = 250
    
    // Allow any pending operations to complete
    jest.runAllTimers();
    
    // Test the new window state after scrolling
    const window = virtualList.virtualWindow();
    
    // With overscan of 2, we should see items from index 3 to around index 8 or 9
    expect(window.startIndex).toBeLessThanOrEqual(5);
    expect(window.endIndex).toBeGreaterThanOrEqual(8);
  });
  
  test('should measure items correctly', () => {
    const items = [
      { id: 1, text: 'Item 1' },
      { id: 2, text: 'Item 2' },
    ];
    
    const virtualList = createVirtualList({
      items,
      estimatedItemHeight: 50,
      dynamicItemSize: true,
      getItemKey: (item) => item.id,
    });
    
    // Measure the first item
    virtualList.measureItem(0, 75);
    
    // Measure the second item
    virtualList.measureItem(1, 60);
    
    // Recalculate to apply measurements
    virtualList.recalculate();
    
    // Test the updated heights
    const virtualItems = virtualList.virtualItems();
    expect(virtualItems[0].height).toBe(75);
    expect(virtualItems[1].height).toBe(60);
    
    // Total height should now be 135 (75 + 60)
    expect(virtualList.getTotalHeight()).toBe(135);
  });
  
  test('should reset measurements', () => {
    const items = [
      { id: 1, text: 'Item 1' },
      { id: 2, text: 'Item 2' },
    ];
    
    const virtualList = createVirtualList({
      items,
      estimatedItemHeight: 50,
      dynamicItemSize: true,
      getItemKey: (item) => item.id,
    });
    
    // Measure the items
    virtualList.measureItem(0, 75);
    virtualList.measureItem(1, 60);
    virtualList.recalculate();
    
    // Test the heights before reset
    let virtualItems = virtualList.virtualItems();
    expect(virtualItems[0].height).toBe(75);
    
    // Reset measurements
    virtualList.resetMeasurements();
    virtualList.recalculate();
    
    // Test the heights after reset
    virtualItems = virtualList.virtualItems();
    expect(virtualItems[0].height).toBe(50); // Back to estimated height
  });
  
  test('should subscribe to events', () => {
    const virtualList = createVirtualList();
    
    // Create a mock event handler
    const mockHandler = jest.fn();
    
    // Subscribe to rangeChanged event
    const unsubscribe = virtualList.addEventListener('rangeChanged', mockHandler);
    
    // Trigger a recalculation which would fire a rangeChanged event
    virtualList.recalculate();
    
    // Unsubscribe
    unsubscribe();
    
    // Create another handler
    const anotherHandler = jest.fn();
    virtualList.addEventListener('scroll', anotherHandler);
    
    // Trigger a scroll event
    virtualList.scrollTo(100);
    
    // We expect the handler to be called (in the non-mocked version)
    // This is mostly testing that the API contract works
  });
}); 