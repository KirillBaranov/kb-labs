/**
 * Error definitions for Plugin Template
 *
 * Uses defineError() from @kb-labs/sdk for type-safe error handling.
 *
 * @example
 * ```typescript
 * import { TemplateError } from './utils/errors';
 *
 * throw new TemplateError.BusinessRuleViolation('Insufficient funds');
 * throw new TemplateError.QuotaExceeded('api_requests');
 * throw new TemplateError.MissingConfig('apiKey');
 * ```
 */

import { defineError, PluginError, commonErrors } from '@kb-labs/sdk';

/**
 * Template-specific errors
 */
export const TemplateError = defineError('TEMPLATE', {
  BusinessRuleViolation: {
    code: 400,
    message: (rule: string) => `Business rule violated: ${rule}`,
  },
  QuotaExceeded: {
    code: 429,
    message: (resource: string) => `Quota exceeded for ${resource}`,
  },
  MissingConfig: {
    code: 500,
    message: (key: string) => `Missing configuration: ${key}`,
  },
});

/**
 * Common errors (validation, not found, etc.)
 */
export const CommonError = defineError('COMMON', commonErrors);

export { PluginError };
