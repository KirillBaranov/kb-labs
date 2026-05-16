// ─── Slot definitions ──────────────────────────────────────────────────────

export interface SlotDef {
  /** System slots are reserved: adapter middleware cannot target them. */
  readonly reserved: boolean;
  readonly description: string;
}

/**
 * Named pipeline slots, in execution order.
 *
 * reserved=true  → system-only (routerFactory, resourceBrokerFactory, governance).
 * reserved=false → open to adapter-declared middleware.
 *
 * To add a new system stage: add an entry here + add its name to SLOT_ORDER.
 * Existing adapter priorities are local to their slot and never break.
 */
export const PIPELINE_SLOTS = {
  'raw':                  { reserved: false, description: 'Raw adapter (no transforms applied yet)' },
  'router':               { reserved: true,  description: 'System: LLMRouter, NotifierRouter — route to backend' },
  'post-router':          { reserved: false, description: 'Adapter middleware after routing (e.g. request signing)' },
  'resource-broker':      { reserved: true,  description: 'System: rate limiting, queuing (ResourceBroker)' },
  'post-resource-broker': { reserved: false, description: 'Adapter middleware after resource gating (e.g. circuit breaker, cost tracker)' },
  'governance':           { reserved: true,  description: 'System: permission enforcement. Always last.' },
} satisfies Record<string, SlotDef>;

export const SLOT_ORDER = [
  'raw',
  'router',
  'post-router',
  'resource-broker',
  'post-resource-broker',
  'governance',
] as const satisfies Array<keyof typeof PIPELINE_SLOTS>;

export type SlotName = keyof typeof PIPELINE_SLOTS;
export type SystemStageName = SlotName;

// ─── Middleware declaration (re-exported from core-platform) ───────────────
import type { AdapterMiddlewareDecl } from '@kb-labs/core-platform';
export type { AdapterMiddlewareDecl };

// ─── Validation ────────────────────────────────────────────────────────────

const VALID_SLOTS = new Set<string>(Object.keys(PIPELINE_SLOTS));
const RESERVED_SLOTS = new Set<string>(
  Object.entries(PIPELINE_SLOTS)
    .filter(([, def]) => def.reserved)
    .map(([name]) => name),
);

/**
 * Validate a single middleware declaration.
 * Returns a list of error strings (empty = valid).
 */
export function validateMiddlewareDecl(decl: AdapterMiddlewareDecl): string[] {
  const errors: string[] = [];
  const validList = SLOT_ORDER.join(', ');

  if (decl.slot !== undefined) {
    if (!VALID_SLOTS.has(decl.slot)) {
      errors.push(
        `Unknown slot '${decl.slot}'. Valid slots: ${validList}`,
      );
    } else if (RESERVED_SLOTS.has(decl.slot)) {
      errors.push(
        `Slot '${decl.slot}' is reserved for system use. Use one of: ${
          SLOT_ORDER.filter((s) => !RESERVED_SLOTS.has(s)).join(', ')
        }`,
      );
    }
  }

  if (decl.after !== undefined && !VALID_SLOTS.has(decl.after)) {
    errors.push(`'after' references unknown stage '${decl.after}'. Valid stages: ${validList}`);
  }

  if (decl.before !== undefined && !VALID_SLOTS.has(decl.before)) {
    errors.push(`'before' references unknown stage '${decl.before}'. Valid stages: ${validList}`);
  }

  return errors;
}
