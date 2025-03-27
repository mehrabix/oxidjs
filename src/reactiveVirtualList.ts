import { createSignalPair, ReadonlySignal } from './signal';
import { createEffect } from './effect';
import { batch } from './utils';

/**
 * Configuration options for the virtual list
 */
export interface VirtualListOptions<T> {
  /** Initial items array */
  items?: T[];
  /** Estimated item height (can be overridden with dynamic measurement) */
  estimatedItemHeight?: number;
  /** Height of the viewport/container */
  viewportHeight?: number;
  /** Extra buffer items to render outside viewport (above + below) */
  overscan?: number;
  /** Whether to dynamically measure item heights after rendering */
  dynamicItemSize?: boolean;
  /** Key function to generate stable keys for items */
  getItemKey?: (item: T, index: number) => string | number;
  /** Whether to defer measurements to animation frame */
  deferMeasurements?: boolean;
  /** Whether to keep measurements when items change */
  keepMeasurements?: boolean;
}

/**
 * Information about the virtual window being rendered
 */
export interface VirtualWindow {
  /** Index of the first visible item */
  startIndex: number;
  /** Index of the last visible item */
  endIndex: number;
  /** Total items in the full list */
  totalCount: number;
  /** Items currently in view + overscan */
  visibleItems: any[];
  /** Total height of the content */
  totalHeight: number;
  /** Offset from the top to position items correctly */
  offsetY: number;
}

/**
 * Information needed to render a virtual item
 */
export interface VirtualItem<T> {
  /** The item data */
  item: T;
  /** Index in the original array */
  index: number;
  /** Unique key for this item */
  key: string | number;
  /** Item height (measured or estimated) */
  height: number;
  /** Position from the top of the list */
  offsetTop: number;
  /** Whether this item is visible in the viewport */
  isVisible: boolean;
}

/**
 * Events that can be subscribed to
 */
export type VirtualListEvent =
  | 'scroll'
  | 'resize'
  | 'itemsChanged'
  | 'rangeChanged'
  | 'measured';

/**
 * A reactive virtual list controller
 */
export interface ReactiveVirtualList<T> {
  /** The visible window of items */
  virtualWindow: ReadonlySignal<VirtualWindow>;
  
  /** Get all virtual items with their rendering information */
  virtualItems: ReadonlySignal<VirtualItem<T>[]>;
  
  /** Set a new array of items */
  setItems: (newItems: T[]) => void;
  
  /** Update a single item */
  updateItem: (index: number, updater: (item: T) => T) => void;
  
  /** Set the scroll position */
  scrollTo: (scrollTop: number) => void;
  
  /** Scroll to a specific item */
  scrollToItem: (index: number, behavior?: ScrollBehavior) => void;
  
  /** Set the viewport height */
  setViewportHeight: (height: number) => void;
  
  /** Update item height after measurement */
  measureItem: (index: number, height: number) => void;
  
  /** Reset all measurements */
  resetMeasurements: () => void;
  
  /** Force recalculation of the virtual window */
  recalculate: () => void;
  
  /** Subscribe to events */
  addEventListener: (
    event: VirtualListEvent,
    handler: (data: any) => void
  ) => () => void;
  
  /** Get total list height */
  getTotalHeight: () => number;
  
  /** Get current scroll information */
  getScrollInfo: () => {
    scrollTop: number;
    viewportHeight: number;
    isScrolling: boolean;
  };
}

/**
 * Create a reactive virtual list controller
 */
export function createVirtualList<T>(
  options: VirtualListOptions<T> = {}
): ReactiveVirtualList<T> {
  const {
    items = [],
    estimatedItemHeight = 50,
    viewportHeight = 500,
    overscan = 3,
    getItemKey = (_, index) => index,
    deferMeasurements = true,
    keepMeasurements = true
  } = options;
  
  // State signals
  const [getItems, setItemsInternal] = createSignalPair<T[]>(items);
  const [getViewportHeight, setViewportHeight] = createSignalPair(viewportHeight);
  const [getScrollTop, setScrollTop] = createSignalPair(0);
  const [getIsScrolling, setIsScrolling] = createSignalPair(false);
  
  // Measurements for dynamic sizing
  const itemHeights = new Map<string | number, number>();
  
  // Event listeners
  const eventListeners = {
    scroll: new Set<(data: any) => void>(),
    resize: new Set<(data: any) => void>(),
    itemsChanged: new Set<(data: any) => void>(),
    rangeChanged: new Set<(data: any) => void>(),
    measured: new Set<(data: any) => void>()
  };
  
  // Throttle/debounce variables
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  let measurementRequestId: number | null = null;
  
  /**
   * Calculate the current virtual window based on scroll position
   */
  function calculateVirtualWindow(): VirtualWindow {
    const currentItems = getItems();
    const currentScrollTop = getScrollTop();
    const currentViewportHeight = getViewportHeight();
    
    // Calculate where each item starts and its height
    let totalHeight = 0;
    const itemPositions: Array<{ height: number; offsetTop: number }> = [];
    
    for (let i = 0; i < currentItems.length; i++) {
      const key = getItemKey(currentItems[i], i);
      const height = itemHeights.has(key)
        ? itemHeights.get(key)!
        : estimatedItemHeight;
      
      itemPositions.push({
        height,
        offsetTop: totalHeight
      });
      
      totalHeight += height;
    }
    
    // Find visible range
    let startIndex = 0;
    let endIndex = currentItems.length - 1;
    
    // Binary search to find startIndex
    let low = 0;
    let high = currentItems.length - 1;
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      
      if (
        itemPositions[mid].offsetTop + itemPositions[mid].height <
        currentScrollTop
      ) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    
    startIndex = Math.max(0, low - overscan);
    
    // Find endIndex (start from where we left off)
    let calculatedEndIndex = startIndex;
    
    while (
      calculatedEndIndex < currentItems.length &&
      itemPositions[calculatedEndIndex].offsetTop <=
        currentScrollTop + currentViewportHeight
    ) {
      calculatedEndIndex++;
    }
    
    endIndex = Math.min(
      currentItems.length - 1,
      calculatedEndIndex + overscan - 1
    );
    
    // Calculate offset
    const offsetY = startIndex > 0 ? itemPositions[startIndex].offsetTop : 0;
    
    // Extract visible items
    const visibleItems = currentItems.slice(startIndex, endIndex + 1);
    
    return {
      startIndex,
      endIndex,
      totalCount: currentItems.length,
      visibleItems,
      totalHeight,
      offsetY
    };
  }
  
  /**
   * Generate virtual items with all necessary render information
   */
  function calculateVirtualItems(_virtualWindow: VirtualWindow): VirtualItem<T>[] {
    const currentItems = getItems();
    const currentScrollTop = getScrollTop();
    const currentViewportHeight = getViewportHeight();
    
    const result: VirtualItem<T>[] = [];
    
    let currentOffset = 0;
    
    for (let i = 0; i < currentItems.length; i++) {
      const item = currentItems[i];
      const key = getItemKey(item, i);
      const height = itemHeights.has(key)
        ? itemHeights.get(key)!
        : estimatedItemHeight;
      
      const offsetTop = currentOffset;
      currentOffset += height;
      
      // Check if this item is visible in the viewport
      const isVisible =
        offsetTop + height > currentScrollTop &&
        offsetTop < currentScrollTop + currentViewportHeight;
      
      result.push({
        item,
        index: i,
        key,
        height,
        offsetTop,
        isVisible
      });
    }
    
    return result;
  }
  
  // Create derived signal for window
  const [getVirtualWindow, setVirtualWindow] = createSignalPair<VirtualWindow>(
    calculateVirtualWindow()
  );
  
  // Create derived signal for items
  const [getVirtualItems, setVirtualItems] = createSignalPair<VirtualItem<T>[]>(
    calculateVirtualItems(getVirtualWindow())
  );
  
  /**
   * Recalculate the virtual window
   */
  function recalculate(): void {
    const newWindow = calculateVirtualWindow();
    
    // Only update if ranges changed
    const currentWindow = getVirtualWindow();
    const rangeChanged =
      currentWindow.startIndex !== newWindow.startIndex ||
      currentWindow.endIndex !== newWindow.endIndex;
    
    batch(() => {
      setVirtualWindow(newWindow);
      setVirtualItems(calculateVirtualItems(newWindow));
    });
    
    if (rangeChanged) {
      notifyEventListeners('rangeChanged', newWindow);
    }
  }
  
  /**
   * Handle scroll events
   */
  function handleScroll(scrollTop: number): void {
    setScrollTop(scrollTop);
    setIsScrolling(true);
    
    notifyEventListeners('scroll', { scrollTop });
    
    // Cancel previous scroll timeout
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    
    // Set a timeout to mark scrolling as done
    scrollTimeout = setTimeout(() => {
      setIsScrolling(false);
      scrollTimeout = null;
    }, 150);
    
    // Recalculate the window based on new scroll position
    recalculate();
  }
  
  /**
   * Scroll to a specific item
   */
  function scrollToItem(index: number, _behavior: ScrollBehavior = 'auto'): void {
    const currentItems = getItems();
    
    if (index < 0 || index >= currentItems.length) {
      return;
    }
    
    // Calculate the item's position
    let offsetTop = 0;
    
    for (let i = 0; i < index; i++) {
      const key = getItemKey(currentItems[i], i);
      const height = itemHeights.has(key)
        ? itemHeights.get(key)!
        : estimatedItemHeight;
      
      offsetTop += height;
    }
    
    // Scroll to it - using just the number for scrollTop
    handleScroll(offsetTop);
  }
  
  /**
   * Measure an item's height
   */
  function measureItem(index: number, height: number): void {
    const currentItems = getItems();
    
    if (index < 0 || index >= currentItems.length) {
      return;
    }
    
    const key = getItemKey(currentItems[index], index);
    
    // Don't update if the height hasn't changed
    if (itemHeights.get(key) === height) {
      return;
    }
    
    itemHeights.set(key, height);
    
    notifyEventListeners('measured', {
      index,
      key,
      height
    });
    
    // Schedule a recalculation
    if (deferMeasurements) {
      if (measurementRequestId === null) {
        measurementRequestId = requestAnimationFrame(() => {
          recalculate();
          measurementRequestId = null;
        });
      }
    } else {
      recalculate();
    }
  }
  
  /**
   * Reset all measurements
   */
  function resetMeasurements(): void {
    itemHeights.clear();
    recalculate();
  }
  
  /**
   * Set new items
   */
  function setItems(newItems: T[]): void {
    if (!keepMeasurements) {
      // Clear measurements if not keeping them
      itemHeights.clear();
    } else {
      // Clean up any measurements for items that no longer exist
      const newItemsSet = new Set<string | number>();
      
      for (let i = 0; i < newItems.length; i++) {
        const key = getItemKey(newItems[i], i);
        newItemsSet.add(key);
      }
      
      // Remove measurements that don't correspond to any new item
      for (const key of itemHeights.keys()) {
        if (!newItemsSet.has(key)) {
          itemHeights.delete(key);
        }
      }
    }
    
    setItemsInternal(newItems);
    notifyEventListeners('itemsChanged', {
      items: newItems,
      count: newItems.length
    });
    
    recalculate();
  }
  
  /**
   * Update a single item
   */
  function updateItem(index: number, updater: (item: T) => T): void {
    const currentItems = getItems();
    
    if (index < 0 || index >= currentItems.length) {
      return;
    }
    
    const newItems = [...currentItems];
    newItems[index] = updater(newItems[index]);
    
    setItems(newItems);
  }
  
  /**
   * Get the total height of the list
   */
  function getTotalHeight(): number {
    return getVirtualWindow().totalHeight;
  }
  
  /**
   * Get current scroll information
   */
  function getScrollInfo() {
    return {
      scrollTop: getScrollTop(),
      viewportHeight: getViewportHeight(),
      isScrolling: getIsScrolling()
    };
  }
  
  /**
   * Notify event listeners
   */
  function notifyEventListeners(event: VirtualListEvent, data: any): void {
    for (const listener of eventListeners[event]) {
      listener(data);
    }
  }
  
  /**
   * Add an event listener
   */
  function addEventListener(
    event: VirtualListEvent,
    handler: (data: any) => void
  ): () => void {
    if (!eventListeners[event]) {
      return () => {};
    }
    
    eventListeners[event].add(handler);
    
    // Return unsubscribe function
    return () => {
      eventListeners[event].delete(handler);
    };
  }
  
  // Set up effects for recalculation when dependencies change
  createEffect(() => {
    // Track dependencies by reading them
    getItems(); 
    getViewportHeight(); 
    recalculate();
  });
  
  // Initial calculation
  recalculate();
  
  return {
    virtualWindow: getVirtualWindow,
    virtualItems: getVirtualItems,
    setItems,
    updateItem,
    scrollTo: handleScroll,
    scrollToItem,
    setViewportHeight,
    measureItem,
    resetMeasurements,
    recalculate,
    addEventListener,
    getTotalHeight,
    getScrollInfo
  };
}

/**
 * Hook up a virtual list to a DOM element
 */
export function connectVirtualList<T>(
  list: ReactiveVirtualList<T>,
  options: {
    viewport: HTMLElement;
    content: HTMLElement;
    onRender?: (items: VirtualItem<T>[]) => void;
    measureItemElement?: (item: VirtualItem<T>) => HTMLElement | null;
  }
): () => void {
  const { viewport, content, onRender, measureItemElement } = options;
  
  // Set up intersection observer for visibility
  let intersectionObserver: IntersectionObserver | null = null;
  
  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver(
      (_) => {
        // Handle visibility changes
      },
      { root: viewport }
    );
  }
  
  // Set up resize observer for viewport
  let resizeObserver: ResizeObserver | null = null;
  
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((_entries) => {
      if (_entries[0] && _entries[0].target === viewport) {
        const { height } = _entries[0].contentRect;
        
        if (height > 0 && height !== list.getScrollInfo().viewportHeight) {
          list.setViewportHeight(height);
        }
      }
    });
    
    resizeObserver.observe(viewport);
  }
  
  // Set up scroll handler
  const scrollHandler = () => {
    list.scrollTo(viewport.scrollTop);
  };
  
  viewport.addEventListener('scroll', scrollHandler, { passive: true });
  
  // Set up render effect
  const renderListener = list.addEventListener('rangeChanged', () => {
    if (onRender) {
      onRender(list.virtualItems());
    }
    
    // Update content height
    content.style.height = `${list.getTotalHeight()}px`;
    
    // Measure items if needed
    if (measureItemElement) {
      // Wait for render to complete
      setTimeout(() => {
        const virtualItems = list.virtualItems();
        const visibleItems = virtualItems.filter(
          item => item.index >= list.virtualWindow().startIndex && 
                 item.index <= list.virtualWindow().endIndex
        );
        
        for (const item of visibleItems) {
          const element = measureItemElement(item);
          
          if (element) {
            const height = element.offsetHeight;
            
            if (height > 0 && height !== item.height) {
              list.measureItem(item.index, height);
            }
          }
        }
      }, 0);
    }
  });
  
  // Initial setup
  list.setViewportHeight(viewport.offsetHeight);
  scrollHandler();
  
  // Return cleanup function
  return () => {
    viewport.removeEventListener('scroll', scrollHandler);
    
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    
    if (intersectionObserver) {
      intersectionObserver.disconnect();
    }
    
    renderListener();
  };
}

/**
 * Create a virtual list that can grow infinitely (for infinite scroll)
 */
export function createInfiniteList<T>(
  options: VirtualListOptions<T> & {
    loadMore: (startIndex: number, stopIndex: number) => Promise<T[]>;
    hasMore?: () => boolean;
    initialLoad?: boolean;
    loadMoreThreshold?: number;
    pageSize?: number;
  }
): ReactiveVirtualList<T> & {
  loadMore: () => Promise<boolean>;
  isLoading: ReadonlySignal<boolean>;
  hasMore: ReadonlySignal<boolean>;
} {
  const {
    loadMore,
    hasMore = () => true,
    initialLoad = true,
    loadMoreThreshold = 5,
    pageSize = 20,
    ...listOptions
  } = options;
  
  // Create the base virtual list
  const list = createVirtualList<T>(listOptions);
  
  // Additional state
  const [getIsLoading, setIsLoading] = createSignalPair(false);
  const [getHasMore, setHasMore] = createSignalPair(true);
  
  /**
   * Load more items
   */
  async function loadMoreItems(): Promise<boolean> {
    if (getIsLoading() || !getHasMore()) {
      return false;
    }
    
    const currentItems = list.virtualItems();
    const startIndex = currentItems.length;
    const stopIndex = startIndex + pageSize;
    
    setIsLoading(true);
    
    try {
      const newItems = await loadMore(startIndex, stopIndex);
      
      if (newItems.length === 0) {
        setHasMore(false);
        return false;
      }
      
      list.setItems([...currentItems.map(item => item.item), ...newItems]);
      
      // Check if there might be more items
      const currentHasMore = hasMore();
      setHasMore(currentHasMore);
      
      return true;
    } catch (error) {
      console.error('Error loading more items:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }
  
  // Set up scroll listener to trigger load more
  list.addEventListener('rangeChanged', (window) => {
    const { endIndex, totalCount } = window;
    
    if (
      !getIsLoading() &&
      getHasMore() &&
      totalCount - endIndex <= loadMoreThreshold
    ) {
      loadMoreItems();
    }
  });
  
  // Initial load if requested
  if (initialLoad) {
    loadMoreItems();
  }
  
  return {
    ...list,
    loadMore: loadMoreItems,
    isLoading: getIsLoading,
    hasMore: getHasMore
  };
} 