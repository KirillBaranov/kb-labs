import Ajv, { ErrorObject } from "ajv";

export interface ValidateResult {
  ok: boolean;
  errors: null | ErrorObject[];
}

// Placeholder schema IDs until profile-schemas repo provides them
const SCHEMA_ID = {
  profileManifestV1: "https://kb-labs.dev/schemas/profile-manifest-v1.json",
  legacyProfile: "https://kb-labs.dev/schemas/profile-legacy.json"
} as const;

function getAjv(): Ajv {
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv;
}

// Old format validator placeholder (to be wired to real schema)
function getLegacyProfileValidator() {
  const ajv = getAjv();
  // In real integration, schemas are loaded from @kb-labs/profile-schemas via $id
  const validate = ajv.getSchema(SCHEMA_ID.legacyProfile) ?? ajv.compile({ type: "object" });
  return validate as (data: unknown) => boolean & { errors?: ErrorObject[] };
}

export function validateProfile(json: unknown): ValidateResult {
  const rawProfile = json as any;

  if (rawProfile && rawProfile.schemaVersion === "1.0") {
    const ajv = getAjv();
    const validate = ajv.getSchema(SCHEMA_ID.profileManifestV1) ?? ajv.compile({ type: "object" });
    const ok = !!validate(json);
    return { ok, errors: ok ? null : (validate.errors ?? null) };
  }

  const validate = getLegacyProfileValidator();
  const ok = !!validate(json);
  return { ok, errors: ok ? null : (validate.errors ?? null) };
}
