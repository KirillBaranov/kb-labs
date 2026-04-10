/**
 * @module @kb-labs/cli-contracts
 *
 * Type definitions and contracts for KB Labs CLI framework.
 *
 * This package contains pure TypeScript type definitions with ZERO runtime dependencies.
 * It defines the contracts for:
 * - Commands (CliCommand interface)
 * - Context (CliContext, Profile interfaces)
 * - Presenters (Presenter interface for output)
 *
 * Versioning policy: V1, V2, etc. built into type names for API evolution.
 */

// System context
export type { SystemContext } from "./system-context";

// Presenter contracts
export type { Presenter } from "./presenter/index";
