/**
 * @module @kb-labs/core-policy
 * RBAC-style permission system for KB Labs
 */

export * from "./types/types";
export * from "./resolve/resolve-policy";
export * from "./check/can";
export * from "./schema/policy-schema";

// Init API
export { initPolicy, type InitPolicyOptions } from "./api/init-policy";
