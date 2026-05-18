import type { CommandManifest, FlagDefinition } from '../registry/types.js';

type JsonSchemaProperty = {
  type: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  items?: { type: string };
};

function flagToProperty(flag: FlagDefinition): JsonSchemaProperty {
  const prop: JsonSchemaProperty = {
    type: flag.type === 'array' ? 'array' : flag.type,
    description: flag.description ?? flag.describe,
  };
  if (flag.default !== undefined) prop.default = flag.default;
  if (flag.choices?.length) prop.enum = flag.choices;
  if (flag.type === 'array') prop.items = { type: 'string' };
  return prop;
}

/**
 * Generates a JSON Schema object from a CommandManifest.
 * Used by the --schema flag interception in bootstrap.
 */
export function generateCommandSchema(manifest: CommandManifest): object {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const flag of manifest.flags ?? []) {
    properties[flag.name] = flagToProperty(flag);
    if (flag.required) required.push(flag.name);
  }

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: manifest.segments.join(' '),
    description: manifest.describe,
    ...(manifest.operationType ? { operationType: manifest.operationType } : {}),
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    examples: manifest.examples ?? [],
  };
}
