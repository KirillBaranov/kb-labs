/**
 * @deprecated This fake localStorage-based auth provider has been removed.
 *
 * Migrated to real cookie-based auth as part of ADR-0020.
 * Use `@/auth/auth-provider` instead:
 *
 *   import { AuthProvider, useAuth, useCan } from '@/auth/auth-provider';
 *
 * This file is intentionally kept as an empty stub to surface build errors
 * at any remaining import sites so they can be fixed.
 */

// No exports — all call sites must be migrated to @/auth/auth-provider.
