/**
 * @module @kb-labs/core/config/merge/layered-merge
 * Layered merge with trace for configuration layers
 */

import type { ConfigLayer, MergeTrace } from '../types';

export interface LayeredMergeResult {
  merged: Record<string, unknown>;
  trace: MergeTrace[];
}

/**
 * Merge configuration layers with detailed trace
 * Arrays are overwritten (not merged)
 * Objects are deeply merged
 */
export function layeredMergeWithTrace(layers: ConfigLayer[]): LayeredMergeResult {
  const trace: MergeTrace[] = [];
  
  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

  const merge = (base: unknown, overlay: unknown, layer: ConfigLayer, path: string[] = []): unknown => {
    // Handle array overwrite
    if (Array.isArray(base) && Array.isArray(overlay)) {
      trace.push({
        path: path.join('.'),
        source: layer.source,
        type: 'overwriteArray',
        layer: layer.label,
        profileRef: layer.source.includes('profile') ? extractProfileRef(layer.source) : undefined,
        presetRef: layer.source.includes('preset') ? extractPresetRef(layer.source) : undefined,
        version: extractVersion(layer.source),
      });
      return overlay;
    }
    
    // Handle object merge
    if (isPlainObject(base) && isPlainObject(overlay)) {
      const result: Record<string, unknown> = { ...base };
      
      for (const [key, value] of Object.entries(overlay)) {
        if (key in base) {
          result[key] = merge(base[key], value, layer, [...path, key]);
        } else {
          trace.push({
            path: [...path, key].join('.'),
            source: layer.source,
            type: 'set',
            layer: layer.label,
            profileRef: layer.source.includes('profile') ? extractProfileRef(layer.source) : undefined,
            presetRef: layer.source.includes('preset') ? extractPresetRef(layer.source) : undefined,
            version: extractVersion(layer.source),
          });
          result[key] = value;
        }
      }
      
      return result;
    }
    
    // Different types or primitive values - overlay wins
    trace.push({
      path: path.join('.'),
      source: layer.source,
      type: 'set',
      layer: layer.label,
      profileRef: layer.source.includes('profile') ? extractProfileRef(layer.source) : undefined,
      presetRef: layer.source.includes('preset') ? extractPresetRef(layer.source) : undefined,
      version: extractVersion(layer.source),
    });
    
    return overlay ?? base;
  };
  
  const merged = layers.reduce<Record<string, unknown>>((acc, layer) => {
    return merge(acc, layer.value, layer) as Record<string, unknown>;
  }, {});

  return { merged, trace };
}

/**
 * Extract profile ref from source string
 */
function extractProfileRef(source: string): string | undefined {
  const match = source.match(/profile[^:]*:[^@]+@(.+)/);
  return match?.[1];
}

/**
 * Extract preset ref from source string
 */
function extractPresetRef(source: string): string | undefined {
  const match = source.match(/preset[^:]*:@(.+)/);
  return match?.[1];
}

/**
 * Extract version from source string
 */
function extractVersion(source: string): string | undefined {
  const match = source.match(/@([^:]+)/);
  return match?.[1];
}
