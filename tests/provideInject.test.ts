import { provide, inject, createScope, createInjectionKey, injectSignal, createSignal } from '../src';

describe('Provide/Inject', () => {
  test('should provide and inject a value', () => {
    const result = createScope(() => {
      provide('message', 'Hello World');
      return inject('message');
    });
    
    expect(result).toBe('Hello World');
  });
  
  test('should support typed keys', () => {
    const UserKey = createInjectionKey<{ name: string }>('User');
    
    const result = createScope(() => {
      provide(UserKey, { name: 'John' });
      return inject(UserKey);
    });
    
    expect(result).toEqual({ name: 'John' });
  });
  
  test('should support nested scopes', () => {
    const result = createScope(() => {
      provide('outer', 'Outer Value');
      
      return createScope(() => {
        provide('inner', 'Inner Value');
        
        // Inner scope can access outer value
        const outerValue = inject('outer');
        const innerValue = inject('inner');
        
        return { outerValue, innerValue };
      });
    });
    
    expect(result).toEqual({
      outerValue: 'Outer Value',
      innerValue: 'Inner Value'
    });
  });
  
  test('should override values in inner scopes', () => {
    const result = createScope(() => {
      provide('value', 'Outer');
      
      return createScope(() => {
        provide('value', 'Inner');
        return inject('value');
      });
    });
    
    expect(result).toBe('Inner');
  });
  
  test('should support default values', () => {
    const value = inject('non-existent', 'Default');
    expect(value).toBe('Default');
    
    // Should throw when no default provided
    expect(() => {
      inject('non-existent');
    }).toThrow();
  });
  
  test('should support reactive signals', () => {
    const countSignal = createSignal(0);
    
    const result = createScope(() => {
      provide('count', countSignal);
      
      // Get as value
      const count = inject('count');
      
      // Get as signal
      const countReactive = injectSignal('count');
      
      countSignal(10);
      
      return {
        count, // Should be the original signal object
        countValue: countReactive() // Should be 10
      };
    });
    
    expect(result.count).toBe(countSignal);
    expect(result.countValue).toBe(10);
  });
}); 