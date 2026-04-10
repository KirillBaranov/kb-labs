/**
 * @module @kb-labs/core-policy/check/can
 * Permission checker with permit-all default
 */

import type { Policy, Identity, PolicyRule } from "../types/types";
import { KbError, ERROR_HINTS } from "@kb-labs/core-config";

/**
 * Check if identity can perform action on resource
 */
export function can(
  policy: Policy,
  identity: Identity,
  action: string,
  resource?: string,
): boolean {
  // If no policy rules, permit all (good DX)
  if (!policy.rules || policy.rules.length === 0) {
    return true;
  }

  // Find applicable rules
  const applicableRules = policy.rules.filter(
    (rule) => matchesAction(rule, action) && matchesResource(rule, resource),
  );

  // If no applicable rules, deny by default (security-first)
  if (applicableRules.length === 0) {
    return false;
  }

  // Check rules in order (last wins)
  for (const rule of applicableRules) {
    const result = checkRule(rule, identity, action, resource);
    if (result !== null) {
      return result;
    }
  }

  // Default to deny if no explicit decision
  return false;
}

/**
 * Check if rule matches action
 */
function matchesAction(rule: PolicyRule, action: string): boolean {
  if (rule.action === "*") {
    return true;
  }

  if (rule.action === action) {
    return true;
  }

  // Check wildcard patterns (e.g., 'release.*' matches 'release.publish')
  if (rule.action.endsWith(".*")) {
    const prefix = rule.action.slice(0, -2);
    return action.startsWith(prefix + ".");
  }

  return false;
}

/**
 * Check if rule matches resource
 */
function matchesResource(rule: PolicyRule, resource?: string): boolean {
  if (!rule.resource) {
    return true; // Rule applies to all resources
  }

  if (!resource) {
    return false; // Rule requires specific resource but none provided
  }

  if (rule.resource === "*") {
    return true;
  }

  if (rule.resource === resource) {
    return true;
  }

  // Check wildcard patterns
  if (rule.resource.endsWith("*")) {
    const prefix = rule.resource.slice(0, -1);
    return resource.startsWith(prefix);
  }

  return false;
}

/**
 * Check rule against identity
 */
function checkRule(
  rule: PolicyRule,
  identity: Identity,
  action: string,
  resource?: string,
): boolean | null {
  // Check deny first (explicit denial)
  if (rule.deny && rule.deny.length > 0) {
    if (matchesRoles(rule.deny, identity.roles)) {
      return false;
    }
  }

  // Check allow
  if (rule.allow && rule.allow.length > 0) {
    if (matchesRoles(rule.allow, identity.roles)) {
      return true;
    }
  }

  // No explicit decision from this rule
  return null;
}

/**
 * Check if any of the identity roles match the required roles
 */
function matchesRoles(
  requiredRoles: string[],
  identityRoles: string[],
): boolean {
  // Check for wildcard
  if (requiredRoles.includes("*")) {
    return true;
  }

  // Check for exact matches
  for (const role of identityRoles) {
    if (requiredRoles.includes(role)) {
      return true;
    }
  }

  return false;
}

/**
 * Create a permits function for a specific policy and identity
 */
export function createPermitsFunction(
  policy: Policy,
  identity: Identity,
): (action: string, resource?: string) => boolean {
  return (action: string, resource?: string) =>
    can(policy, identity, action, resource);
}

/**
 * Check permission and throw error if denied
 */
export function requirePermission(
  policy: Policy,
  identity: Identity,
  action: string,
  resource?: string,
): void {
  if (!can(policy, identity, action, resource)) {
    throw new KbError(
      "ERR_FORBIDDEN",
      `Permission denied: ${action}${resource ? ` on ${resource}` : ""}`,
      ERROR_HINTS.ERR_FORBIDDEN,
      { action, resource, identity },
    );
  }
}
