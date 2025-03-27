/**
 * @jest-environment jsdom
 */

import { describe, expect, jest, test, beforeEach, afterEach } from '@jest/globals';
import {
  createQuery,
  createMutation,
  createQueryCache,
  resetQueryCache
} from '../src/reactiveQuery';

// Mock fetch
global.fetch = jest.fn();

// Mock signal and effect modules
jest.mock('../src/signal', () => {
  return {
    createSignalPair: jest.fn().mockImplementation((initialValue) => {
      let value = initialValue;
      const getter = jest.fn().mockImplementation(() => value);
      const setter = jest.fn().mockImplementation((newValue) => {
        if (typeof newValue === 'function') {
          value = newValue(value);
        } else {
          value = newValue;
        }
        return value;
      });
      return [getter, setter];
    })
  };
});

jest.mock('../src/effect', () => {
  return {
    createEffect: jest.fn().mockImplementation((fn) => {
      fn();
      return jest.fn(); // Return mock cleanup function
    })
  };
});

describe('ReactiveQuery', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetQueryCache();
    
    // Mock successful fetch by default
    (global.fetch as jest.Mock).mockImplementation(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'mock data' }),
        text: () => Promise.resolve('mock text'),
        headers: new Headers()
      })
    );
  });
  
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });
  
  describe('createQuery', () => {
    test('should create a query with initial loading state', () => {
      const query = createQuery('test-key', () => fetch('/api/data'));
      
      expect(query.loading()).toBe(true);
      expect(query.data()).toBeUndefined();
      expect(query.error()).toBeUndefined();
    });
    
    test('should fetch data when query is created', async () => {
      const fetchFn = jest.fn(() => fetch('/api/data'));
      const query = createQuery('test-key', fetchFn);
      
      expect(fetchFn).toHaveBeenCalledTimes(1);
      
      // Simulate fetch completion
      await jest.runAllTimersAsync();
      
      expect(query.loading()).toBe(false);
      expect(query.data()).toEqual({ data: 'mock data' });
      expect(query.error()).toBeUndefined();
    });
    
    test('should handle fetch errors', async () => {
      // Mock a failed fetch
      const errorMessage = 'Network error';
      (global.fetch as jest.Mock).mockImplementationOnce(() => 
        Promise.reject(new Error(errorMessage))
      );
      
      const query = createQuery('error-key', () => fetch('/api/error'));
      
      // Simulate fetch completion
      await jest.runAllTimersAsync();
      
      expect(query.loading()).toBe(false);
      expect(query.data()).toBeUndefined();
      expect(query.error()).toBeInstanceOf(Error);
      expect(query.error()?.message).toBe(errorMessage);
    });
    
    test('should refetch data when query key changes', async () => {
      const fetchFn = jest.fn().mockImplementation((id) => fetch(`/api/data/${id}`));
      
      // First query with id=1
      const query = createQuery(['item', 1], () => fetchFn(1));
      
      await jest.runAllTimersAsync();
      expect(fetchFn).toHaveBeenCalledWith(1);
      
      // Change key to id=2
      query.setQueryKey(['item', 2]);
      
      // Should trigger a refetch with the new id
      await jest.runAllTimersAsync();
      expect(fetchFn).toHaveBeenCalledWith(2);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
    
    test('should allow manual refetching', async () => {
      const fetchFn = jest.fn(() => fetch('/api/data'));
      const query = createQuery('refetch-test', fetchFn);
      
      await jest.runAllTimersAsync();
      expect(fetchFn).toHaveBeenCalledTimes(1);
      
      // Manually refetch
      query.refetch();
      
      await jest.runAllTimersAsync();
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
    
    test('should support refetch options', async () => {
      const fetchFn = jest.fn(() => fetch('/api/data'));
      const query = createQuery('refetch-options', fetchFn, {
        refetchOnFocus: true,
        refetchOnReconnect: true,
        refetchInterval: 5000
      });
      
      await jest.runAllTimersAsync();
      expect(fetchFn).toHaveBeenCalledTimes(1);
      
      // Simulate window focus event
      window.dispatchEvent(new Event('focus'));
      await jest.runAllTimersAsync();
      expect(fetchFn).toHaveBeenCalledTimes(2);
      
      // Simulate online event
      window.dispatchEvent(new Event('online'));
      await jest.runAllTimersAsync();
      expect(fetchFn).toHaveBeenCalledTimes(3);
      
      // Advance timer to trigger interval refetch
      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();
      expect(fetchFn).toHaveBeenCalledTimes(4);
    });
    
    test('should use the query cache', async () => {
      // First query fetches data
      const fetchFn1 = jest.fn(() => fetch('/api/data'));
      const query1 = createQuery('cached-key', fetchFn1);
      
      await jest.runAllTimersAsync();
      expect(fetchFn1).toHaveBeenCalledTimes(1);
      
      // Second query with the same key should use cached data
      const fetchFn2 = jest.fn(() => fetch('/api/data'));
      const query2 = createQuery('cached-key', fetchFn2);
      
      await jest.runAllTimersAsync();
      // Should not trigger another fetch
      expect(fetchFn2).not.toHaveBeenCalled();
      
      // Both queries should have the same data
      expect(query1.data()).toEqual(query2.data());
    });
  });
  
  describe('createMutation', () => {
    test('should create a mutation with initial idle state', () => {
      const mutation = createMutation((data) => fetch('/api/create', {
        method: 'POST',
        body: JSON.stringify(data)
      }));
      
      expect(mutation.idle()).toBe(true);
      expect(mutation.loading()).toBe(false);
      expect(mutation.data()).toBeUndefined();
      expect(mutation.error()).toBeUndefined();
    });
    
    test('should execute mutation when triggered', async () => {
      const mutationFn = jest.fn((data) => fetch('/api/create', {
        method: 'POST',
        body: JSON.stringify(data)
      }));
      
      const mutation = createMutation(mutationFn);
      
      // Initial state
      expect(mutation.idle()).toBe(true);
      
      // Trigger mutation
      const result = mutation.mutate({ name: 'New Item' });
      
      // Should be loading
      expect(mutation.idle()).toBe(false);
      expect(mutation.loading()).toBe(true);
      
      // Mutation function should be called with the data
      expect(mutationFn).toHaveBeenCalledWith({ name: 'New Item' });
      
      // Simulate mutation completion
      await jest.runAllTimersAsync();
      await result;
      
      // Should be completed
      expect(mutation.loading()).toBe(false);
      expect(mutation.data()).toEqual({ data: 'mock data' });
      expect(mutation.error()).toBeUndefined();
    });
    
    test('should handle mutation errors', async () => {
      // Mock a failed fetch
      const errorMessage = 'Server error';
      (global.fetch as jest.Mock).mockImplementationOnce(() => 
        Promise.reject(new Error(errorMessage))
      );
      
      const mutation = createMutation((data) => fetch('/api/create', {
        method: 'POST',
        body: JSON.stringify(data)
      }));
      
      // Trigger mutation
      const result = mutation.mutate({ name: 'New Item' });
      
      // Simulate mutation completion
      await jest.runAllTimersAsync();
      
      try {
        await result;
      } catch (error) {
        // Expected error
      }
      
      // Should have error state
      expect(mutation.loading()).toBe(false);
      expect(mutation.data()).toBeUndefined();
      expect(mutation.error()).toBeInstanceOf(Error);
      expect(mutation.error()?.message).toBe(errorMessage);
    });
    
    test('should reset mutation state', async () => {
      const mutation = createMutation((data) => fetch('/api/create', {
        method: 'POST',
        body: JSON.stringify(data)
      }));
      
      // Trigger mutation
      const result = mutation.mutate({ name: 'New Item' });
      
      // Simulate mutation completion
      await jest.runAllTimersAsync();
      await result;
      
      // Should have data
      expect(mutation.data()).toEqual({ data: 'mock data' });
      
      // Reset state
      mutation.reset();
      
      // Should be back to initial state
      expect(mutation.idle()).toBe(true);
      expect(mutation.loading()).toBe(false);
      expect(mutation.data()).toBeUndefined();
      expect(mutation.error()).toBeUndefined();
    });
  });
  
  describe('QueryCache', () => {
    test('should create a custom query cache', async () => {
      const customCache = createQueryCache();
      
      const fetchFn = jest.fn(() => fetch('/api/data'));
      const query = createQuery('custom-cache', fetchFn, { cache: customCache });
      
      await jest.runAllTimersAsync();
      
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(query.data()).toEqual({ data: 'mock data' });
      
      // Check if data is in the custom cache
      expect(customCache.getQuery('custom-cache')).toBeDefined();
    });
    
    test('should invalidate queries in the cache', async () => {
      const cache = createQueryCache();
      
      // Create two queries with different keys
      const fetchFn1 = jest.fn(() => fetch('/api/users'));
      const query1 = createQuery(['users'], fetchFn1, { cache });
      
      const fetchFn2 = jest.fn(() => fetch('/api/posts'));
      const query2 = createQuery(['posts'], fetchFn2, { cache });
      
      await jest.runAllTimersAsync();
      
      // Both should have fetched once
      expect(fetchFn1).toHaveBeenCalledTimes(1);
      expect(fetchFn2).toHaveBeenCalledTimes(1);
      
      // Invalidate only the users query
      cache.invalidateQueries(['users']);
      
      await jest.runAllTimersAsync();
      
      // Users query should fetch again, posts should not
      expect(fetchFn1).toHaveBeenCalledTimes(2);
      expect(fetchFn2).toHaveBeenCalledTimes(1);
    });
    
    test('should invalidate queries by predicate', async () => {
      const cache = createQueryCache();
      
      // Create queries with different keys
      const usersFetchFn = jest.fn(() => fetch('/api/users'));
      const usersQuery = createQuery(['users', 'list'], usersFetchFn, { cache });
      
      const userDetailsFetchFn = jest.fn(() => fetch('/api/users/1'));
      const userDetailsQuery = createQuery(['users', 'details', 1], userDetailsFetchFn, { cache });
      
      const postsFetchFn = jest.fn(() => fetch('/api/posts'));
      const postsQuery = createQuery(['posts'], postsFetchFn, { cache });
      
      await jest.runAllTimersAsync();
      
      // Reset call counts
      usersFetchFn.mockClear();
      userDetailsFetchFn.mockClear();
      postsFetchFn.mockClear();
      
      // Invalidate all user-related queries
      cache.invalidateQueries(undefined, (queryKey) => {
        return Array.isArray(queryKey) && queryKey[0] === 'users';
      });
      
      await jest.runAllTimersAsync();
      
      // User queries should fetch again, posts should not
      expect(usersFetchFn).toHaveBeenCalledTimes(1);
      expect(userDetailsFetchFn).toHaveBeenCalledTimes(1);
      expect(postsFetchFn).toHaveBeenCalledTimes(0);
    });
  });
}); 