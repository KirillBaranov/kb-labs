/**
 * Mathematical utility functions for KB Labs Mind
 */

/**
 * Calculate cosine similarity between two vectors
 *
 * Cosine similarity measures the cosine of the angle between two vectors,
 * producing a value between -1 and 1, where:
 * - 1 means vectors point in the same direction (identical)
 * - 0 means vectors are orthogonal (no similarity)
 * - -1 means vectors point in opposite directions
 *
 * @param a - First vector (array of numbers)
 * @param b - Second vector (array of numbers)
 * @returns Similarity score [0-1], or 0 if vectors have different lengths or zero magnitudes
 *
 * @example
 * ```typescript
 * const similarity = cosineSimilarity([1, 2, 3], [4, 5, 6]);
 * console.log(similarity); // ~0.974
 * ```
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  // Vectors must have same dimensionality
  if (a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // Calculate dot product and norms in single pass
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dotProduct += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  // Handle zero magnitude vectors (division by zero)
  if (normA === 0 || normB === 0) {
    return 0;
  }

  // cosine(θ) = (a · b) / (||a|| * ||b||)
  return dotProduct / Math.sqrt(normA * normB);
}

/**
 * Calculate dot product of two vectors
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Dot product, or 0 if vectors have different lengths
 *
 * @example
 * ```typescript
 * const dot = dotProduct([1, 2, 3], [4, 5, 6]);
 * console.log(dot); // 32
 * ```
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return result;
}

/**
 * Calculate magnitude (L2 norm) of a vector
 *
 * @param vec - Input vector
 * @returns Magnitude (Euclidean length)
 *
 * @example
 * ```typescript
 * const mag = magnitude([3, 4]);
 * console.log(mag); // 5
 * ```
 */
export function magnitude(vec: number[]): number {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum);
}

/**
 * Normalize a vector to unit length
 *
 * @param vec - Input vector
 * @returns Normalized vector (magnitude = 1), or original if magnitude is 0
 *
 * @example
 * ```typescript
 * const normalized = normalize([3, 4]);
 * console.log(normalized); // [0.6, 0.8]
 * ```
 */
export function normalize(vec: number[]): number[] {
  const mag = magnitude(vec);
  if (mag === 0) {
    return vec;
  }
  return vec.map(v => (v ?? 0) / mag);
}
