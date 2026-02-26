import { describe, it, expect } from 'vitest';
import { traverseChain } from './proxy.js';

describe('traverseChain', () => {
  it('navigates nested path segments', () => {
    const proxy = {
      openai: {
        v1: {
          chat: {
            completions: { post: 'endpoint' },
          },
        },
      },
    };
    const result = traverseChain(proxy as never, ['openai', 'v1', 'chat', 'completions']);
    expect(result).toEqual({ post: 'endpoint' });
  });

  it('returns the proxy itself for empty segments', () => {
    const proxy = { foo: 'bar' };
    const result = traverseChain(proxy as never, []);
    expect(result).toBe(proxy);
  });

  it('returns proxy.a for single segment', () => {
    const proxy = { a: { get: 'fn' } };
    const result = traverseChain(proxy as never, ['a']);
    expect(result).toEqual({ get: 'fn' });
  });

  it('each segment traverses one level deeper', () => {
    const proxy = { x: { y: { z: 'leaf' } } };
    expect(traverseChain(proxy as never, ['x'])).toEqual({ y: { z: 'leaf' } });
    expect(traverseChain(proxy as never, ['x', 'y'])).toEqual({ z: 'leaf' });
    expect(traverseChain(proxy as never, ['x', 'y', 'z'])).toBe('leaf');
  });
});
