import * as reactiveCache from '../src/reactiveCache';

describe('ReactiveCache', () => {
  it('should export the createCache function', () => {
    expect(typeof reactiveCache.createCache).toBe('function');
  });
}); 