import { describe, expect, it } from 'vitest';
import { helloWorld } from '../hello-world.js';

describe('helloWorld', () => {
  it('returns Hello, World!', () => {
    expect(helloWorld()).toBe('Hello, World!');
  });
});
