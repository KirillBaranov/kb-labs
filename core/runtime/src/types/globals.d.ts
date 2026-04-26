/**
 * Global type augmentations for core-runtime.
 *
 * Declares globals set during platform bootstrap so that
 * runtime code can access them without `as any` casts.
 */

declare global {
  /**
   * Raw kb.config.json contents, injected by bootstrap.ts before any
   * plugin or adapter code runs. Undefined until bootstrap completes.
   */
  // eslint-disable-next-line no-var
  var __KB_RAW_CONFIG__: Record<string, unknown> | undefined;

  /**
   * Config section key for useConfig() auto-detection in subprocess mode.
   * Set by sandbox bootstrap before handler execution.
   */
  // eslint-disable-next-line no-var
  var __KB_CONFIG_SECTION__: unknown;
}

export {};
