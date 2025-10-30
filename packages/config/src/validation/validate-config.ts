import Ajv, { ErrorObject } from "ajv";

export type ProductId = "aiReview" | "devlink" | string;

export interface ValidationResult {
  ok: boolean;
  errors: null | ErrorObject[];
}

// These would be imported from @kb-labs/profile-schemas in real integration
const schemaMap: Record<string, unknown> = {
  aiReview: { type: "object" },
  devlink: { type: "object" }
};

export function validateProductConfig(product: ProductId, config: unknown): ValidationResult {
  const schema = schemaMap[product];
  if (!schema) return { ok: true, errors: null };

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const ok = !!validate(config);

  return { ok, errors: ok ? null : (validate.errors ?? null) };
}
