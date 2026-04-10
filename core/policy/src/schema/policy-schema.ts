/**
 * @module @kb-labs/core-policy/schema/policy-schema
 * Policy schema validation with AJV
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { Policy } from "../types/types";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

/**
 * Policy JSON Schema
 */
const policySchema = {
  $id: "https://schemas.kb-labs.dev/policy.schema.json",
  title: "KB Labs Policy",
  description: "RBAC-style permission policy for KB Labs",
  type: "object",
  properties: {
    $schema: {
      type: "string",
      const: "https://schemas.kb-labs.dev/policy.schema.json",
    },
    schemaVersion: {
      type: "string",
      const: "1.0",
    },
    rules: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description:
              'Action to control (e.g., "release.publish", "devkit.sync")',
          },
          resource: {
            type: "string",
            description: "Optional resource identifier",
          },
          allow: {
            type: "array",
            items: { type: "string" },
            description: "Roles that are allowed to perform this action",
          },
          deny: {
            type: "array",
            items: { type: "string" },
            description:
              "Roles that are explicitly denied from performing this action",
          },
        },
        required: ["action"],
        additionalProperties: false,
      },
    },
    metadata: {
      type: "object",
      properties: {
        name: { type: "string" },
        version: { type: "string" },
        description: { type: "string" },
      },
      required: ["name", "version"],
      additionalProperties: false,
    },
  },
  required: ["schemaVersion", "rules"],
  additionalProperties: false,
};

const validate = ajv.compile(policySchema);

/**
 * Validate policy against schema
 */
export function validatePolicySchema(policy: any): {
  valid: boolean;
  errors?: string[];
} {
  const valid = validate(policy);

  if (!valid) {
    const errors =
      validate.errors?.map(
        (err) => `${err.instancePath || "root"}: ${err.message}`,
      ) || [];

    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Create a policy validator function
 */
export function createPolicyValidator() {
  return (policy: any): policy is Policy => {
    const result = validatePolicySchema(policy);
    return result.valid;
  };
}

/**
 * Get policy schema for external use
 */
export function getPolicySchema() {
  return policySchema;
}
