export interface RetryOptions {
  attempts?: number;
  delay?: number;
  backoff?: 'fixed' | 'exponential';
  onRetry?: (error: unknown, attempt: number) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  if (typeof fn !== 'function') {
    throw new TypeError('fn must be a function');
  }

  const { attempts = 3, delay = 0, backoff = 'fixed', onRetry } = options;

  if (attempts < 1) {
    throw new RangeError(`attempts must be >= 1, got ${attempts}`);
  }
  if (delay < 0) {
    throw new RangeError(`delay must be >= 0, got ${delay}`);
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt < attempts) {
        onRetry?.(err, attempt);

        if (delay > 0) {
          const wait = backoff === 'exponential' ? delay * 2 ** (attempt - 1) : delay;
          await new Promise<void>((resolve) => setTimeout(resolve, wait));
        }
      }
    }
  }

  throw lastError;
}
