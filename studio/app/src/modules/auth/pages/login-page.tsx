/**
 * @deprecated Fake role-select login page removed as part of ADR-0020.
 * The real login page is at src/pages/login-page.tsx.
 * This file re-exports from there so the old authRoutes barrel still compiles
 * while unused — remove this file when authRoutes is fully cleaned up.
 */
export { LoginPage } from '../../../pages/login-page.js';
