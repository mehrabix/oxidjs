import { ReadonlySignal, createSignalPair } from './signal';
import { createEffect } from './effect';

/**
 * Query state with all metadata
 */
export interface QueryState<T, E = Error> {
  /** The data returned from the query */
  data: T | undefined;
  /** Whether the query is currently loading */
  isLoading: boolean;
  /** Whether the query has successfully fetched data at least once */
  isSuccess: boolean;
  /** Whether the query encountered an error */
  isError: boolean;
  /** The error that occurred during fetching (if any) */
  error: E | undefined;
  /** When the query was last updated */
  updatedAt: number;
  /** How many times the query has been fetched */
  fetchCount: number;
}

/**
 * Options for configuring a query
 */
export interface QueryOptions<T, E = Error> {
  /** Initial data to use until the query is loaded */
  initialData?: T;
  /** Callback to execute when an error occurs */
  onError?: (error: E) => void;
  /** Callback to execute when data is successfully fetched */
  onSuccess?: (data: T) => void;
  /** Whether to enable the query (if false, query won't automatically fetch) */
  enabled?: boolean;
  /** Retry count for failed queries */
  retry?: number | boolean;
  /** Retry delay in milliseconds */
  retryDelay?: number | ((retryAttempt: number) => number);
  /** Time in milliseconds after which data is considered stale */
  staleTime?: number;
  /** Time in milliseconds to keep cached data when no subscribers are present */
  cacheTime?: number;
  /** Refetch interval in milliseconds */
  refetchInterval?: number | false;
  /** Whether to refetch when window regains focus */
  refetchOnWindowFocus?: boolean;
  /** Whether to refetch when the component/subscriber remounts */
  refetchOnMount?: boolean;
}

/**
 * Result of a query with controls
 */
export interface QueryResult<T, E = Error> extends ReadonlySignal<QueryState<T, E>> {
  /** The data from the query */
  data: ReadonlySignal<T | undefined>;
  /** Whether the query is loading */
  isLoading: ReadonlySignal<boolean>;
  /** Whether the query has error */
  isError: ReadonlySignal<boolean>;
  /** The error object if query failed */
  error: ReadonlySignal<E | undefined>;
  /** Manually refetch the query */
  refetch: () => Promise<T>;
  /** Cancel any ongoing fetch and mark the query as idle */
  cancel: () => void;
  /** Set the query data manually */
  setData: (data: T | ((prev: T | undefined) => T)) => void;
  /** Reset the query to its initial state */
  reset: () => void;
}

/** 
 * Query cache to store results
 */
interface QueryCacheEntry<T, E = Error> {
  state: QueryState<T, E>;
  subscribers: Set<() => void>;
  setters: {
    setState: (value: QueryState<T, E> | ((prev: QueryState<T, E>) => QueryState<T, E>)) => void;
    setData: (value: T | undefined | ((prev: T | undefined) => T | undefined)) => void;
    setIsLoading: (value: boolean) => void;
    setIsError: (value: boolean) => void;
    setError: (value: E | undefined) => void;
  };
  controller?: AbortController;
  refetchTimeout?: ReturnType<typeof setTimeout>;
  gcTimeout?: ReturnType<typeof setTimeout>;
  fetchPromise?: Promise<T>;
}

/**
 * Global query cache
 */
const queryCache = new Map<string, QueryCacheEntry<any, any>>();

/**
 * Default query options
 */
const defaultOptions: Required<Omit<QueryOptions<any>, 'initialData' | 'onError' | 'onSuccess'>> = {
  enabled: true,
  retry: 3,
  retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30000),
  staleTime: 0,
  cacheTime: 5 * 60 * 1000, // 5 minutes
  refetchInterval: false,
  refetchOnWindowFocus: true,
  refetchOnMount: true
};

/**
 * Create a query that fetches and caches data
 * 
 * @param queryKey A unique key for this query
 * @param queryFn Function that returns a promise with the data
 * @param options Configuration options
 * @returns A query result object
 */
export function createQuery<T, E = Error>(
  queryKey: string,
  queryFn: () => Promise<T>,
  options: QueryOptions<T, E> = {}
): QueryResult<T, E> {
  // Merge default options
  const {
    initialData,
    onError,
    onSuccess,
    enabled,
    retry,
    retryDelay,
    staleTime,
    cacheTime,
    refetchInterval,
    refetchOnWindowFocus,
    refetchOnMount
  } = {
    ...defaultOptions,
    ...options
  };
  
  // Setup window focus listener if needed
  if (typeof window !== 'undefined' && refetchOnWindowFocus) {
    window.addEventListener('focus', () => {
      const cache = queryCache.get(queryKey);
      if (cache && cache.subscribers.size > 0) {
        executeFetch(queryKey, queryFn, {
          ...options,
          onError,
          onSuccess
        });
      }
    });
  }
  
  // Check if query is already in cache
  if (!queryCache.has(queryKey)) {
    // Initial state
    const initialState: QueryState<T, E> = {
      data: initialData,
      isLoading: enabled,
      isSuccess: initialData !== undefined,
      isError: false,
      error: undefined,
      updatedAt: initialData !== undefined ? Date.now() : 0,
      fetchCount: 0
    };
    
    // Create signals for the state
    const [state, setState] = createSignalPair<QueryState<T, E>>(initialState);
    const [data, setData] = createSignalPair<T | undefined>(initialData);
    const [isLoading, setIsLoading] = createSignalPair(enabled);
    const [isError, setIsError] = createSignalPair(false);
    const [error, setError] = createSignalPair<E | undefined>(undefined);
    
    // Keep the individual signals in sync with the state
    createEffect(() => {
      const current = state();
      
      if (data() !== current.data) {
        setData(current.data);
      }
      
      if (isLoading() !== current.isLoading) {
        setIsLoading(current.isLoading);
      }
      
      if (isError() !== current.isError) {
        setIsError(current.isError);
      }
      
      if (error() !== current.error) {
        setError(current.error);
      }
    });
    
    // Create cache entry
    queryCache.set(queryKey, {
      state: initialState,
      subscribers: new Set(),
      setters: {
        setState,
        setData: (value) => {
          if (typeof value === 'function') {
            setState(prev => ({
              ...prev,
              data: (value as Function)(prev.data),
              isSuccess: true,
              updatedAt: Date.now()
            }));
          } else {
            setState(prev => ({
              ...prev,
              data: value,
              isSuccess: true,
              updatedAt: Date.now()
            }));
          }
        },
        setIsLoading,
        setIsError,
        setError
      }
    });
    
    // Start fetch if enabled
    if (enabled) {
      executeFetch(queryKey, queryFn, {
        retry,
        retryDelay,
        onError,
        onSuccess
      });
    }
    
    // Setup refetch interval if needed
    if (refetchInterval && typeof refetchInterval === 'number') {
      const cache = queryCache.get(queryKey)!;
      cache.refetchTimeout = setInterval(() => {
        if (cache.subscribers.size > 0) {
          executeFetch(queryKey, queryFn, {
            ...options,
            onError,
            onSuccess
          });
        }
      }, refetchInterval);
    }
  }
  
  // Get cache entry
  const cache = queryCache.get(queryKey)!;
  
  // Refetch on mount if needed
  if (refetchOnMount && (cache.state.data === undefined || 
      (staleTime > 0 && Date.now() - cache.state.updatedAt > staleTime))) {
    executeFetch(queryKey, queryFn, {
      retry,
      retryDelay,
      onError,
      onSuccess
    });
  }
  
  // Create state signal that reads from cache
  const [queryState, setQueryState] = createSignalPair<QueryState<T, E>>(cache.state);
  
  // Create subscriber cleanup
  const unsubscribeFn = () => {
    cache.subscribers.delete(cleanup);
    
    // Start garbage collection if no subscribers left
    if (cache.subscribers.size === 0 && cacheTime !== Infinity) {
      cache.gcTimeout = setTimeout(() => {
        // Clear any running intervals/timeouts
        if (cache.refetchTimeout) {
          clearInterval(cache.refetchTimeout);
        }
        
        if (cache.controller) {
          cache.controller.abort();
        }
        
        // Remove from cache
        queryCache.delete(queryKey);
      }, cacheTime);
    }
  };
  
  // Create cleanup function
  const cleanup = () => {
    setQueryState(cache.state);
  };
  
  // Add to subscribers
  cache.subscribers.add(cleanup);
  
  // Clear GC timeout if it was running
  if (cache.gcTimeout) {
    clearTimeout(cache.gcTimeout);
    cache.gcTimeout = undefined;
  }
  
  // Create data, loading, and error signals
  const dataSignal = (() => queryState().data) as ReadonlySignal<T | undefined>;
  const loadingSignal = (() => queryState().isLoading) as ReadonlySignal<boolean>;
  const errorSignal = (() => queryState().error) as ReadonlySignal<E | undefined>;
  const isErrorSignal = (() => queryState().isError) as ReadonlySignal<boolean>;
  
  // Create refetch function
  const refetch = () => {
    return executeFetch(queryKey, queryFn, {
      retry,
      retryDelay,
      onError,
      onSuccess
    });
  };
  
  // Create cancel function
  const cancel = () => {
    const cache = queryCache.get(queryKey);
    if (cache && cache.controller) {
      cache.controller.abort();
      
      // Update state
      cache.setters.setState(prev => ({
        ...prev,
        isLoading: false
      }));
      
      // Clear fetch promise
      cache.fetchPromise = undefined;
    }
  };
  
  // Create setData function
  const setData = (value: T | ((prev: T | undefined) => T)) => {
    const cache = queryCache.get(queryKey);
    if (cache) {
      cache.setters.setData(value);
    }
  };
  
  // Create reset function
  const reset = () => {
    const cache = queryCache.get(queryKey);
    if (cache) {
      // Cancel any pending request
      if (cache.controller) {
        cache.controller.abort();
      }
      
      // Reset state
      cache.setters.setState({
        data: initialData,
        isLoading: enabled,
        isSuccess: initialData !== undefined,
        isError: false,
        error: undefined,
        updatedAt: initialData !== undefined ? Date.now() : 0,
        fetchCount: 0
      });
      
      // Restart fetch if enabled
      if (enabled) {
        executeFetch(queryKey, queryFn, {
          retry,
          retryDelay,
          onError,
          onSuccess
        });
      }
    }
  };
  
  // Create the query result object
  const queryResult = (() => queryState()) as QueryResult<T, E>;
  
  // Add properties and methods
  queryResult.data = dataSignal;
  queryResult.isLoading = loadingSignal;
  queryResult.isError = isErrorSignal;
  queryResult.error = errorSignal;
  queryResult.refetch = refetch;
  queryResult.cancel = cancel;
  queryResult.setData = setData;
  queryResult.reset = reset;
  
  // Setup automatic cleanup
  createEffect(() => {
    // Access the state to track this effect
    queryState();
    
    // Return cleanup function
    return unsubscribeFn;
  });
  
  return queryResult;
}

/**
 * Execute a query fetch and update cache
 */
async function executeFetch<T, E = Error>(
  queryKey: string,
  queryFn: () => Promise<T>,
  options: {
    retry?: number | boolean;
    retryDelay?: number | ((retryAttempt: number) => number);
    onError?: (error: E) => void;
    onSuccess?: (data: T) => void;
  }
): Promise<T> {
  const cache = queryCache.get(queryKey);
  if (!cache) return Promise.reject(new Error('Query cache not found'));
  
  // Return existing promise if there is one
  if (cache.fetchPromise) {
    return cache.fetchPromise;
  }
  
  // Create abort controller
  const controller = new AbortController();
  cache.controller = controller;
  
  // Set loading state
  cache.setters.setState(prev => ({
    ...prev,
    isLoading: true,
    isError: false,
    error: undefined
  }));
  
  // Helper function to handle retry logic
  const executeFetchWithRetry = async (attempt = 0): Promise<T> => {
    try {
      const data = await queryFn();
      
      // Update cache with success
      if (!controller.signal.aborted) {
        cache.setters.setState(prev => ({
          ...prev,
          data,
          isLoading: false,
          isSuccess: true,
          isError: false,
          error: undefined,
          updatedAt: Date.now(),
          fetchCount: prev.fetchCount + 1
        }));
        
        // Call success callback
        if (options.onSuccess && data !== undefined) {
          options.onSuccess(data);
        }
      }
      
      return data;
    } catch (err) {
      if (controller.signal.aborted) {
        return cache.state.data as T;
      }
      
      const error = err as E;
      const maxRetries = typeof options.retry === 'number' 
        ? options.retry 
        : options.retry === true ? 3 : 0;
      
      if (attempt < maxRetries) {
        // Calculate delay
        const delay = typeof options.retryDelay === 'function'
          ? options.retryDelay(attempt)
          : typeof options.retryDelay === 'number'
            ? options.retryDelay
            : Math.min(1000 * 2 ** attempt, 30000);
        
        // Wait for delay and retry
        await new Promise(resolve => setTimeout(resolve, delay));
        return executeFetchWithRetry(attempt + 1);
      }
      
      // No more retries, update cache with error
      if (!controller.signal.aborted) {
        cache.setters.setState(prev => ({
          ...prev,
          isLoading: false,
          isError: true,
          error,
          fetchCount: prev.fetchCount + 1
        }));
        
        // Call error callback
        if (options.onError) {
          options.onError(error);
        }
      }
      
      throw error;
    } finally {
      if (!controller.signal.aborted) {
        cache.controller = undefined;
        cache.fetchPromise = undefined;
      }
    }
  };
  
  // Start fetch with retry support
  cache.fetchPromise = executeFetchWithRetry();
  return cache.fetchPromise;
}

/**
 * Options for mutation
 */
export interface MutationOptions<T, V, E = Error> {
  /** Callback when mutation is successful */
  onSuccess?: (data: T, variables: V) => void;
  /** Callback when mutation fails */
  onError?: (error: E, variables: V) => void;
  /** Callback before mutation starts */
  onMutate?: (variables: V) => unknown;
}

/**
 * Mutation state
 */
export interface MutationState<T, E = Error> {
  /** Data returned from the mutation */
  data: T | undefined;
  /** Whether the mutation is executing */
  isLoading: boolean;
  /** Whether the mutation was successful */
  isSuccess: boolean;
  /** Whether the mutation encountered an error */
  isError: boolean;
  /** The error that occurred during mutation (if any) */
  error: E | undefined;
}

/**
 * Mutation result with controls
 */
export interface MutationResult<T, V, E = Error> extends ReadonlySignal<MutationState<T, E>> {
  /** Execute the mutation */
  mutate: (variables: V) => Promise<T>;
  /** Reset the mutation state */
  reset: () => void;
}

/**
 * Create a mutation for modifying data
 * 
 * @param mutationFn Function that executes the mutation
 * @param options Configuration options
 * @returns A mutation result object
 */
export function createMutation<T, V, E = Error>(
  mutationFn: (variables: V) => Promise<T>,
  options: MutationOptions<T, V, E> = {}
): MutationResult<T, V, E> {
  const { onSuccess, onError, onMutate } = options;
  
  const [getState, setState] = createSignalPair<MutationState<T, E>>({
    data: undefined,
    isLoading: false,
    isSuccess: false,
    isError: false,
    error: undefined
  });
  
  const mutate = async (variables: V): Promise<T> => {
    // Reset state when starting a mutation
    setState({
      data: undefined,
      isLoading: true,
      isSuccess: false,
      isError: false,
      error: undefined
    });
    
    try {
      // Run onMutate if provided
      if (onMutate) {
        onMutate(variables);
      }
      
      // Execute the mutation
      const data = await mutationFn(variables);
      
      // Update state on success
      setState({
        data,
        isLoading: false,
        isSuccess: true,
        isError: false,
        error: undefined
      });
      
      // Run onSuccess callback if provided
      if (onSuccess) {
        onSuccess(data, variables);
      }
      
      return data;
    } catch (error) {
      // Update state on error
      setState({
        data: undefined,
        isLoading: false,
        isSuccess: false,
        isError: true,
        error: error as E
      });
      
      // Run onError callback if provided
      if (onError) {
        onError(error as E, variables);
      }
      
      throw error;
    }
  };
  
  const reset = () => {
    setState({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: false,
      error: undefined
    });
  };
  
  // Add properties to the state function
  const result = getState as MutationResult<T, V, E>;
  result.mutate = mutate;
  result.reset = reset;
  
  return result;
}

/**
 * Infinite query state 
 */
export interface InfiniteQueryState<T, E = Error> extends QueryState<T[], E> {
  /** Whether there are more pages to load */
  hasNextPage: boolean;
  /** Number of pages loaded */
  pageCount: number;
  /** All pages as individual items */
  pages: T[][];
}

/**
 * Options for infinite query
 */
export interface InfiniteQueryOptions<T, E = Error> extends QueryOptions<T[], E> {
  /** Function to get the next page params */
  getNextPageParam: (lastPage: T[], allPages: T[][]) => unknown | undefined;
}

/**
 * Infinite query result with controls
 */
export interface InfiniteQueryResult<T, E = Error> extends ReadonlySignal<InfiniteQueryState<T, E>> {
  /** The data from all pages combined */
  data: ReadonlySignal<T[] | undefined>;
  /** Each page's data as a separate array */
  pages: ReadonlySignal<T[][]>;
  /** Whether there is a next page */
  hasNextPage: ReadonlySignal<boolean>;
  /** Whether the query is loading */
  isLoading: ReadonlySignal<boolean>;
  /** Whether the query has error */
  isError: ReadonlySignal<boolean>;
  /** The error object if query failed */
  error: ReadonlySignal<E | undefined>;
  /** Fetch the next page */
  fetchNextPage: () => Promise<T[]>;
  /** Manually refetch all pages */
  refetch: () => Promise<T[]>;
  /** Cancel any ongoing fetch */
  cancel: () => void;
  /** Reset the query to its initial state */
  reset: () => void;
}

/**
 * Create an infinite query for pagination
 * 
 * @param queryKey A unique key for this query
 * @param queryFn Function that returns a promise with the page data
 * @param options Configuration options
 * @returns An infinite query result object
 */
export function createInfiniteQuery<T, E = Error>(
  _queryKey: string, // Prefixed with underscore to indicate it's intentionally unused
  queryFn: (pageParam: unknown) => Promise<T[]>,
  options: InfiniteQueryOptions<T, E>
): InfiniteQueryResult<T, E> {
  const {
    initialData,
    onError,
    onSuccess,
    enabled = true,
    // Destructure but ignore these options
    retry: _unused1 = 3,
    retryDelay: _unused2 = 1000,
    staleTime: _unused3 = 0,
    cacheTime: _unused4 = 5 * 60 * 1000,
    refetchInterval: _unused5 = false,
    refetchOnWindowFocus: _unused6 = true,
    refetchOnMount: _unused7 = true,
    getNextPageParam
  } = options;
  
  // Initial state
  const initialState: InfiniteQueryState<T, E> = {
    data: initialData || [],
    pages: initialData ? [initialData] : [],
    isLoading: enabled !== false,
    isSuccess: initialData !== undefined,
    isError: false,
    error: undefined,
    updatedAt: initialData !== undefined ? Date.now() : 0,
    fetchCount: 0,
    hasNextPage: false,
    pageCount: initialData ? 1 : 0
  };
  
  // Create state signal
  const [state, setState] = createSignalPair<InfiniteQueryState<T, E>>(initialState);
  
  // Create signals for derived state
  const [data, setData] = createSignalPair<T[] | undefined>(initialState.data);
  const [pages, setPages] = createSignalPair<T[][]>(initialState.pages);
  const [hasNextPage, setHasNextPage] = createSignalPair(initialState.hasNextPage);
  const [isLoading, setIsLoading] = createSignalPair(initialState.isLoading);
  const [isError, setIsError] = createSignalPair(initialState.isError);
  const [error, setError] = createSignalPair<E | undefined>(initialState.error);
  
  // Keep the derived signals in sync with the state
  createEffect(() => {
    const current = state();
    
    if (data() !== current.data) {
      setData(current.data);
    }
    
    if (pages() !== current.pages) {
      setPages(current.pages);
    }
    
    if (hasNextPage() !== current.hasNextPage) {
      setHasNextPage(current.hasNextPage);
    }
    
    if (isLoading() !== current.isLoading) {
      setIsLoading(current.isLoading);
    }
    
    if (isError() !== current.isError) {
      setIsError(current.isError);
    }
    
    if (error() !== current.error) {
      setError(current.error);
    }
  });
  
  // Track if component is mounted
  let isMounted = true;
  
  // Controller for fetch cancellation
  let controller: AbortController | undefined;
  
  // Current page param
  let currentPageParam: unknown = undefined;
  
  // Fetch a page
  const fetchPage = async (pageParam: unknown): Promise<T[]> => {
    if (!isMounted) return [];
    
    // Cancel any ongoing request
    if (controller) {
      controller.abort();
    }
    
    // Create new controller
    controller = new AbortController();
    
    // Set loading state
    setState(prev => ({
      ...prev,
      isLoading: true,
      isError: false,
      error: undefined
    }));
    
    try {
      // Fetch the page
      const newPage = await queryFn(pageParam);
      
      if (!isMounted || controller.signal.aborted) {
        return [];
      }
      
      // Update state with new page
      setState(prev => {
        const newPages = [...prev.pages, newPage];
        const allData = newPages.flat();
        
        // Determine if there's a next page
        const hasNext = !!getNextPageParam(newPage, newPages);
        
        return {
          data: allData,
          pages: newPages,
          isLoading: false,
          isSuccess: true,
          isError: false,
          error: undefined,
          updatedAt: Date.now(),
          fetchCount: prev.fetchCount + 1,
          hasNextPage: hasNext,
          pageCount: newPages.length
        };
      });
      
      // Store the next page param
      const current = state();
      currentPageParam = getNextPageParam(
        current.pages[current.pages.length - 1],
        current.pages
      );
      
      // Call success callback
      if (onSuccess && current.data !== undefined) {
        onSuccess(current.data);
      }
      
      return newPage;
    } catch (err) {
      if (!isMounted || controller.signal.aborted) {
        return [];
      }
      
      const error = err as E;
      
      // Update state with error
      setState(prev => ({
        ...prev,
        isLoading: false,
        isError: true,
        error
      }));
      
      // Call error callback
      if (onError) {
        onError(error);
      }
      
      throw error;
    } finally {
      controller = undefined;
    }
  };
  
  // Fetch the next page
  const fetchNextPage = async (): Promise<T[]> => {
    if (!hasNextPage()) {
      return [];
    }
    
    return fetchPage(currentPageParam);
  };
  
  // Refetch all pages
  const refetch = async (): Promise<T[]> => {
    // Reset state
    setState(prev => ({
      ...prev,
      data: [],
      pages: [],
      isLoading: true,
      isSuccess: false,
      isError: false,
      error: undefined,
      pageCount: 0,
      hasNextPage: false
    }));
    
    // Fetch first page
    const firstPage = await fetchPage(undefined);
    
    // Set next page param
    const pages = [firstPage];
    currentPageParam = getNextPageParam(firstPage, pages);
    
    return firstPage;
  };
  
  // Cancel fetch
  const cancel = () => {
    if (controller) {
      controller.abort();
      controller = undefined;
      
      setState(prev => ({
        ...prev,
        isLoading: false
      }));
    }
  };
  
  // Reset the query
  const reset = () => {
    cancel();
    
    setState(initialState);
    currentPageParam = undefined;
    
    // Start initial fetch if enabled
    if (enabled !== false) {
      fetchPage(undefined);
    }
  };
  
  // Start initial fetch if enabled
  if (enabled !== false) {
    fetchPage(undefined);
  }
  
  // Create the infinite query result object
  const infiniteQuery = (() => state()) as InfiniteQueryResult<T, E>;
  
  // Add properties and methods
  infiniteQuery.data = data;
  infiniteQuery.pages = pages;
  infiniteQuery.hasNextPage = hasNextPage;
  infiniteQuery.isLoading = isLoading;
  infiniteQuery.isError = isError;
  infiniteQuery.error = error;
  infiniteQuery.fetchNextPage = fetchNextPage;
  infiniteQuery.refetch = refetch;
  infiniteQuery.cancel = cancel;
  infiniteQuery.reset = reset;
  
  // Cleanup function
  createEffect(() => {
    // Access state to track this effect
    state();
    
    // Cleanup function
    return () => {
      isMounted = false;
      if (controller) {
        controller.abort();
      }
    };
  });
  
  return infiniteQuery;
} 