import { createVirtualList, connectVirtualList, createInfiniteList } from '../src/reactiveVirtualList';

// Mock DOM elements for tests
class MockElement {
  style: { [key: string]: string } = {};
  offsetHeight: number = 100;
  offsetWidth: number = 100;
  scrollTop: number = 0;
  
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  
  getBoundingClientRect(): DOMRect {
    return {
      top: 0,
      left: 0,
      right: this.offsetWidth,
      bottom: this.offsetHeight,
      width: this.offsetWidth,
      height: this.offsetHeight,
      x: 0,
      y: 0,
      toJSON: () => {}
    };
  }
}

// Mock for ResizeObserver
class MockResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

// Mock for IntersectionObserver
class MockIntersectionObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

describe('ReactiveVirtualList Advanced Features', () => {
  // Setup global mocks
  beforeAll(() => {
    // @ts-ignore
    global.ResizeObserver = MockResizeObserver;
    // @ts-ignore
    global.IntersectionObserver = MockIntersectionObserver;
  });
  
  describe('Virtual list item measurements', () => {
    it('should measure items and update their heights', () => {
      // Create a virtual list with 100 items
      const items = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` }));
      const list = createVirtualList({
        items,
        estimatedItemHeight: 50,
        viewportHeight: 500
      });
      
      // Initial window should use estimated heights
      const initialWindow = list.virtualWindow();
      expect(initialWindow.totalHeight).toBe(100 * 50); // 100 items * 50px
      
      // Measure an item with a different height
      list.measureItem(5, 100); // Item 5 is 100px tall
      
      // Window should be recalculated
      const updatedWindow = list.virtualWindow();
      
      // Total height should be increased by 50px (the difference for item 5)
      expect(updatedWindow.totalHeight).toBe(100 * 50 + 50); // 5050px
      
      // Measure another item
      list.measureItem(10, 75); // Item 10 is 75px tall
      
      // Window should be recalculated again
      const finalWindow = list.virtualWindow();
      
      // Total height should be 5050 + 25 = 5075px
      expect(finalWindow.totalHeight).toBe(100 * 50 + 50 + 25); // 5075px
    });
    
    it('should reset measurements when requested', () => {
      // Create a virtual list with measured items
      const items = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      const list = createVirtualList({
        items,
        estimatedItemHeight: 50
      });
      
      // Measure some items
      list.measureItem(0, 100);
      list.measureItem(1, 75);
      
      // Verify measurements were applied
      const before = list.virtualWindow();
      expect(before.totalHeight).toBe(10 * 50 + 50 + 25); // 575px
      
      // Reset measurements
      list.resetMeasurements();
      
      // Verify all items use estimated height again
      const after = list.virtualWindow();
      expect(after.totalHeight).toBe(10 * 50); // 500px
    });
  });
  
  describe('Item updates and scrolling', () => {
    it('should update a specific item', () => {
      // Create list with items
      const items = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
      ];
      
      const list = createVirtualList({ items });
      
      // Update item at index 1
      list.updateItem(1, item => ({ ...item, name: 'Robert' }));
      
      // Check that item was updated
      const virtualItems = list.virtualItems();
      expect(virtualItems[1].item.name).toBe('Robert');
      
      // Other items should be unchanged
      expect(virtualItems[0].item.name).toBe('Alice');
      expect(virtualItems[2].item.name).toBe('Charlie');
    });
    
    it('should scroll to a specific item', () => {
      // Create a list with many items
      const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      const list = createVirtualList({
        items,
        estimatedItemHeight: 50,
        viewportHeight: 200
      });
      
      // Mock scrollToItem implementation
      const scrollTo = jest.spyOn(list, 'scrollTo');
      
      // Scroll to item 50
      list.scrollToItem(50);
      
      // Should call scrollTo with the correct offset
      // Item 50 should be at position 50 * 50 = 2500
      expect(scrollTo).toHaveBeenCalledWith(2500);
      
      // Cleanup
      scrollTo.mockRestore();
    });
  });
  
  describe('Event listeners', () => {
    it('should register and notify event listeners', () => {
      const list = createVirtualList();
      
      // Create event handlers
      const scrollHandler = jest.fn();
      const rangeChangedHandler = jest.fn();
      
      // Register event listeners
      const unsubscribeScroll = list.addEventListener('scroll', scrollHandler);
      const unsubscribeRange = list.addEventListener('rangeChanged', rangeChangedHandler);
      
      // Trigger scrolling
      list.scrollTo(100);
      
      // Scroll handler should be called
      expect(scrollHandler).toHaveBeenCalled();
      
      // Force recalculation to trigger range changed
      list.recalculate();
      
      // Range changed handler should be called
      expect(rangeChangedHandler).toHaveBeenCalled();
      
      // Unsubscribe
      unsubscribeScroll();
      unsubscribeRange();
      
      // Reset mocks
      scrollHandler.mockReset();
      rangeChangedHandler.mockReset();
      
      // Trigger events again
      list.scrollTo(200);
      list.recalculate();
      
      // Handlers should not be called after unsubscribe
      expect(scrollHandler).not.toHaveBeenCalled();
      expect(rangeChangedHandler).not.toHaveBeenCalled();
    });
  });
  
  describe('DOM Connection', () => {
    it('should connect a virtual list to DOM elements', () => {
      // Create a virtual list
      const items = Array.from({ length: 20 }, (_, i) => ({ id: i }));
      const list = createVirtualList({ items });
      
      // Create mock DOM elements
      const viewport = new MockElement();
      const content = new MockElement();
      
      // Mock render callback
      const onRender = jest.fn();
      
      // Connect to DOM
      const cleanup = connectVirtualList(list, {
        viewport: viewport as unknown as HTMLElement,
        content: content as unknown as HTMLElement,
        onRender
      });
      
      // Should set up viewport height
      expect(list.getScrollInfo().viewportHeight).toBe(viewport.offsetHeight);
      
      // Should set up event listeners
      expect(viewport.addEventListener).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function),
        expect.anything()
      );
      
      // Simulate scroll event
      list.scrollTo(50);
      
      // Should update content height
      expect(content.style.height).toBe(`${list.getTotalHeight()}px`);
      
      // Render callback should be called
      expect(onRender).toHaveBeenCalledWith(list.virtualItems());
      
      // Cleanup
      cleanup();
      
      // Should remove event listeners
      expect(viewport.removeEventListener).toHaveBeenCalled();
    });
  });
  
  describe('Infinite List', () => {
    it('should create an infinite list that loads more items on demand', async () => {
      // Mock load more function
      const loadMore = jest.fn().mockImplementation((startIndex, stopIndex) => {
        const newItems = [];
        for (let i = startIndex; i < stopIndex; i++) {
          newItems.push({ id: i, name: `Item ${i}` });
        }
        return Promise.resolve(newItems);
      });
      
      // Create infinite list
      const infiniteList = createInfiniteList({
        loadMore,
        pageSize: 10,
        initialLoad: true
      });
      
      // Initial load should be triggered
      expect(loadMore).toHaveBeenCalledWith(0, 10);
      
      // Reset mock for next test
      loadMore.mockClear();
      
      // Load more items
      await infiniteList.loadMore();
      
      // Should call loadMore with next range
      expect(loadMore).toHaveBeenCalledWith(10, 20);
      
      // Should track loading state
      expect(infiniteList.isLoading()).toBe(false);
      
      // Load more again
      const loadPromise = infiniteList.loadMore();
      
      // Should be in loading state during load
      expect(infiniteList.isLoading()).toBe(true);
      
      // Wait for load to complete
      await loadPromise;
      
      // Should resolve loading state
      expect(infiniteList.isLoading()).toBe(false);
    });
    
    it('should handle end of data in infinite list', async () => {
      // Mock load more function that returns empty array after first call
      const loadMore = jest.fn()
        .mockImplementationOnce(() => Promise.resolve([{ id: 1 }, { id: 2 }]))
        .mockImplementationOnce(() => Promise.resolve([]));
      
      // Create infinite list
      const infiniteList = createInfiniteList({
        loadMore,
        initialLoad: true
      });
      
      // First load succeeds
      expect(infiniteList.hasMore()).toBe(true);
      
      // Load more - should get empty array
      await infiniteList.loadMore();
      
      // Should set hasMore to false
      expect(infiniteList.hasMore()).toBe(false);
    });
  });
}); 