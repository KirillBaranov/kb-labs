/**
 * Helper to safely render schema objects
 */
export function renderSchema(schema: any): string {
  if (!schema) {
    return '—';
  }
  if (typeof schema === 'string') {
    return schema;
  }
  if (typeof schema === 'object') {
    if ('$ref' in schema) {
      return schema.$ref;
    }
    if ('zod' in schema) {
      return schema.zod;
    }
    return JSON.stringify(schema);
  }
  return String(schema);
}
