import { describe, it, expect } from 'vitest';
import { sha256, sha256Buffer } from '../utils/hash';

describe('Hash Utilities', () => {
  it('should compute SHA256 for string', () => {
    const text = 'Hello world';
    const hash = sha256(text);
    
    expect(hash).toHaveLength(64); // SHA256 hex length
    expect(hash).toMatch(/^[a-f0-9]+$/); // hex characters only
  });

  it('should produce consistent hashes', () => {
    const text = 'Consistent test string';
    const hash1 = sha256(text);
    const hash2 = sha256(text);
    
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different content', () => {
    const text1 = 'Hello world';
    const text2 = 'Hello world!';
    
    const hash1 = sha256(text1);
    const hash2 = sha256(text2);
    
    expect(hash1).not.toBe(hash2);
  });

  it('should compute SHA256 for Buffer', () => {
    const buffer = Buffer.from('test buffer content');
    const hash = sha256Buffer(buffer);
    
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('should produce same hash for string and equivalent buffer', () => {
    const text = 'test content';
    const buffer = Buffer.from(text, 'utf8');
    
    const stringHash = sha256(text);
    const bufferHash = sha256Buffer(buffer);
    
    expect(stringHash).toBe(bufferHash);
  });
});
