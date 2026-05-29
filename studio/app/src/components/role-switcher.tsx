/**
 * RoleSwitcher — REMOVED as part of ADR-0020 (real auth migration).
 *
 * The fake localStorage-based role switcher has been replaced by real
 * cookie-based auth. This file is kept as a stub to prevent import errors
 * in files that haven't been updated yet. Remove usages and delete this file.
 */

/** @deprecated Remove all usages — fake auth is gone (ADR-0020). */
export function RoleSwitcher() {
  return null;
}
