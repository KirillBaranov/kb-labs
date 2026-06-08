# F2 deep dive — why `platform.config` is undefined in `command:` handlers

> Status: **root cause proven empirically** (instrumented run, then fully reverted).
> Verdict: real core-platform bug on the **isolated/worker execution path**. Fix is a deliberate
> core change — left for you to apply + test + commit (not hot-patched at night).

## How it was proven

Instrumented the *actually-executing* `useConfig` (it lives in `@kb-labs/sdk`'s bundled copy of
command-kit — see F13 below, not in `shared/command-kit` directly), restarted the daemon, ran a
minimal one-step workflow `uses: command:review run`. Logged from inside the handler process:

```
[KBDIAG-F2] {
  "section":"review",
  "hasStore":true,            // AsyncLocalStorage platform context IS set
  "storeHasConfig":false,     // …but the governed store platform's .config is undefined
  "globalHasConfig":true,     // the core-runtime singleton HAS config
  "resolvedHasConfig":false,  // usePlatform() returns the store → no config
  "sameStoreGlobal":false,    // store !== singleton (different objects)
  "keys":[...,"config",...]   // the "config" KEY exists on the store, value is undefined
}
```
Then reverted the instrumentation (sdk dist restored from backup, probe workflow deleted).

## The mechanism

1. `usePlatform()` = `platformContext.getStore() ?? globalSingleton`. The store **is** set, so the
   handler uses the **governed store platform**, not the singleton.
2. The governed platform is built by `applyPluginGovernance()`
   (`core/plugin-runtime/src/platform/pipeline.ts`): it does
   `Object.fromEntries(ADAPTER_REGISTRY.keys.map(k => [k, base[k]]))` and `continue`s on any
   `undefined`. So `governed.config = base.config`. The `config` key is present but **undefined**
   ⇒ the **base** it governed already had `config === undefined`.
3. That base is the output of `assemblePlatform()` (same `Object.fromEntries(... raw[k] ...)` shape).
   So `raw.config` was undefined when the exec platform was assembled.
4. **The ordering bug:** `config` is the one adapter that is *special-cased* — attached **after**
   adapter loading via `platform.setAdapter('config', new ConfigAdapter())`
   (`core/runtime/src/loader.ts:805-814`; the worker variant uses `ConfigProxy` at
   `loader.ts:515-517`). In the parent process this happens *before* the assembly hook
   (`loader.ts:1189`), so the parent's assembled platform is fine. **On the isolated/worker
   execution path, the exec platform handed to the handler is assembled from a `raw` that does not
   include `config`** — config lands on the worker's *singleton* (hence `globalHasConfig:true`) but
   never on the *assembled/governed* platform the handler actually runs against.

Confirming detail from the run: the step executed in a **separate process** (`pid 29864` ≠ daemon
`28568`) inside an auto-created worktree `wt_98b64f4a`, even though `execution.mode` is
`"in-process"` — isolation spawns a worker. `config` IS in both `ADAPTER_REGISTRY`
(`adapter-registry.ts:365`, governance `pass-through`) and `ADAPTER_DEFAULTS`
(`adapter-defaults.ts:68`, `inmemory` fallback), so it is *meant* to be a first-class adapter — the
only thing wrong is **when** it is attached relative to assembly on the worker path.

## Fix options (ranked) — for you to apply with a test + commit

1. **Best / root:** make `config` a normal part of the assembled set on every path. Attach the
   ConfigAdapter/ConfigProxy to `raw` **before** `assemblePlatform`/governance runs in the
   worker/isolated init path (mirror the parent ordering at `loader.ts:805-814` so it precedes the
   assembly used by the execution backend). Then `assemblePlatform` carries it through naturally
   (it's already a registry key). Add a test: assemble a platform whose raw lacks nothing, run
   `applyPluginGovernance`, assert `governed.config` is defined; plus an integration test that a
   `command:` step in isolated mode can read config.
2. **Targeted:** in the worker/isolated backend, when building the platform passed to
   `runInProcess`, inherit `config` from the process singleton if the assembled platform lacks it.
3. **Consumer fallback (band-aid, not recommended):** in `usePlatform()`/`useConfig`, if
   `store.config` is undefined, fall back to the global singleton's `config`. Cheap and unblocks
   today, but hides the assembly ordering bug and would mask future drift.

## Why I did not hot-patch it tonight

It's a core-platform change on a cross-process path; verifying it safely needs the worker-pool/
isolated path exercised and a real test — and I can't commit. Per your "unattended = zero hacks,
stop & document on a design call" rule, the responsible move is this precise spec. The cycle does
**not** need this fixed to work: invoking review (and any plugin command) as a **subprocess** shell
step bootstraps its own config and is proven to work (`night-lab/03-run-evidence.md` §B). The
hardened cycle uses that, so F2 is a quality/cleanliness fix, not a blocker.

## Related new finding

**F13 — `@kb-labs/sdk` bundles `command-kit` into its dist.** `sdk/sdk/dist/index.js` inlines
`shared/command-kit/dist/index.js` (line 1 literally says so). So plugins importing `useConfig`/
`usePlatform` from `@kb-labs/sdk` get a **copy frozen at sdk build time**, not the live command-kit.
`@kb-labs/core-runtime` stays external (shared singleton), so this didn't cause F2 — but it means:
editing `command-kit` has no effect on plugins until `sdk` is rebuilt, and any module-level state in
command-kit exists twice (once in command-kit, once inside sdk). Worth deciding intentionally
(externalize command-kit from the sdk bundle, or accept the copy).
