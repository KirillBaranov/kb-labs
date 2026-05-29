// Vitest setup for studio app
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Automatically clean up rendered components after each test so DOM state
// does not leak across tests in the same file.
afterEach(() => {
  cleanup();
});
