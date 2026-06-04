/**
 * Destructive-action protocol (SOFT layer).
 *
 * A single, platform-wide way for a command to declare that an operation is
 * destructive — how bad, how broad, and whether it can be undone — and to gate
 * it behind explicit confirmation in EVERY mode (human and agent).
 *
 * This layer is intentionally SOFT: it informs and asks, it does not enforce.
 * Physical enforcement (can-this-token-even-invoke-this) is the platform's
 * future token/permission layer; it reads the SAME `severity`/`destructive`
 * declaration on the command. So one declaration drives both:
 *   - now:   this helper renders a clear signal + requires `--yes`;
 *   - later: the permission layer filters discovery + blocks invocation by right.
 *
 * Declaring it is OPTIONAL for external plugins (commands work without it) but
 * strongly recommended — agents can only reason about blast radius they're told.
 */

export type DestructiveSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Severity rubric (keep consistent across plugins so agents can calibrate):
 *  - low      trivially rebuilt from source (idempotent), e.g. reindex
 *  - medium   data loss, but recoverable from an external source
 *  - high     data loss, recovery is slow / manual
 *  - critical irreversible, NO recovery (prod data, tenant wipe)
 */
export interface DestructiveAction {
  /** Command identity, e.g. "mind drop". */
  action: string;
  /** What is affected, e.g. 'index "code"'. */
  resource: string;
  /** Plain-language effect, e.g. "deletes all vectors + the manifest". */
  effect: string;
  /** Blast-radius tier. */
  severity: DestructiveSeverity;
  /** Whether the data can be recovered afterwards. */
  reversible: boolean;
  /** How to recover, if reversible (e.g. "re-run `kb mind index --full`"). */
  recovery?: string;
  /** Quantified scope — how much, of what, how broad. */
  blastRadius?: { count?: number; unit?: string; scope?: string };
  /** Flag that confirms the action (default `--yes`). */
  confirmFlag?: string;
}

/** The machine-readable signal an agent receives when confirmation is missing. */
export interface ConfirmationRequired {
  ok: false;
  confirmationRequired: true;
  destructive: true;
  irreversible: boolean;
  severity: DestructiveSeverity;
  action: string;
  resource: string;
  effect: string;
  reversible: boolean;
  blastRadius?: { count?: number; unit?: string; scope?: string };
  recovery?: string;
  confirmWith: string;
  message: string;
}

interface ConfirmContext {
  ui?: {
    json?: (data: unknown) => void;
    warn?: (message: string, opts?: Record<string, unknown>) => void;
    error?: (message: string, opts?: Record<string, unknown>) => void;
  };
}

/** Render the one-line warning — leads with the scary part (irreversibility + severity). */
export function renderDestructiveMessage(a: DestructiveAction): string {
  const flag = a.confirmFlag ?? '--yes';
  const br = a.blastRadius;
  const blast = br
    ? ` (${[br.count != null ? `${br.count} ${br.unit ?? 'item(s)'}` : '', br.scope].filter(Boolean).join(' · ')})`
    : '';
  const lead = a.reversible ? `[${a.severity}]` : `⚠ IRREVERSIBLE [${a.severity}]`;
  const rec = a.recovery
    ? ` Recovery: ${a.recovery}.`
    : a.reversible
      ? ''
      : ' No recovery — data is permanently lost.';
  return `${lead} ${a.action} — ${a.effect} on ${a.resource}${blast}.${rec} Confirm with ${flag}.`;
}

/**
 * Gate a destructive command. Returns the command result to return immediately
 * when NOT confirmed (in every mode — agents get the structured signal, not a
 * silent execution), or `null` when confirmed so the caller proceeds.
 *
 *   const blocked = confirmDestructive(ctx, { confirmed: flags.yes, isJson, action });
 *   if (blocked) return blocked;
 */
export function confirmDestructive(
  ctx: ConfirmContext,
  opts: { confirmed: boolean; isJson?: boolean; action: DestructiveAction },
): { exitCode: number } | null {
  if (opts.confirmed) {
    return null;
  }
  const a = opts.action;
  const message = renderDestructiveMessage(a);
  if (opts.isJson) {
    const signal: ConfirmationRequired = {
      ok: false,
      confirmationRequired: true,
      destructive: true,
      irreversible: !a.reversible,
      severity: a.severity,
      action: a.action,
      resource: a.resource,
      effect: a.effect,
      reversible: a.reversible,
      ...(a.blastRadius && { blastRadius: a.blastRadius }),
      ...(a.recovery && { recovery: a.recovery }),
      confirmWith: a.confirmFlag ?? '--yes',
      message,
    };
    ctx.ui?.json?.(signal);
  } else {
    (ctx.ui?.warn ?? ctx.ui?.error)?.(message);
  }
  return { exitCode: 1 };
}
