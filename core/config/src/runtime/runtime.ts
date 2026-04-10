/**
 * @module @kb-labs/core/config/runtime
 * Infrastructure-only config pipeline (no domain keys).
 * Provides: nearest config discovery, safe JSON read with diagnostics,
 * deep merge that ignores `undefined`, and a generic resolver (defaults→file→env→cli).
 */

import { promises as fsp } from "node:fs";
import path from "node:path";
import type { Diagnostic, FindNearestConfigOpts, JsonReadResult, ProfilesConfig, KBConfig } from "../types";

/** Find nearest config file walking up from startDir until stopDir or FS root. */
export async function findNearestConfig(opts: FindNearestConfigOpts): Promise<{ path: string | null; tried: string[] }> {
    const start = path.resolve(opts.startDir ?? process.cwd());
    const stop = opts.stopDir ? path.resolve(opts.stopDir) : null;

    const tried: string[] = [];
    let dir = start;

    while (true) {
        for (const name of opts.filenames) {
            const candidate = path.join(dir, name);
            tried.push(candidate);
            try {
                await fsp.access(candidate);
                return { path: candidate, tried };
            } catch { /* continue */ }
        }
        const parent = path.dirname(dir);
        if (parent === dir) { break; }
        if (stop && (dir === stop || parent === stop)) { break; }
        dir = parent;
    }
    return { path: null, tried };
}

/** Read JSON with explicit diagnostics (no silent nulls). */
export async function readJsonWithDiagnostics<T = unknown>(p: string): Promise<JsonReadResult<T>> {
    const diagnostics: Diagnostic[] = [];
    try {
        const raw = await fsp.readFile(p, "utf8");
        try {
            const data = JSON.parse(raw) as T;
            return { ok: true, data, diagnostics };
        } catch (e) {
            diagnostics.push({ level: "error", code: "JSON_PARSE_FAILED", message: `Failed to parse JSON: ${p}`, detail: String(e) });
            return { ok: false, diagnostics };
        }
    } catch (e) {
        diagnostics.push({ level: "error", code: "FILE_READ_FAILED", message: `Failed to read file: ${p}`, detail: String(e) });
        return { ok: false, diagnostics };
    }
}

/** Shallow pick of defined fields only. */
export function pickDefined<T extends Record<string, any>>(obj: T | undefined): Partial<T> {
    if (!obj) { return {}; }
    const out: Partial<T> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) { (out as any)[k] = v; }
    }
    return out;
}

/** Deep merge (objects/arrays), ignoring `undefined` on the overlay. */
export function mergeDefined<T>(base: T, over?: Partial<T>): T {
    if (!over) { return base; }
    if (Array.isArray(base) && Array.isArray(over)) {
        return [...base, ...over.filter(v => v !== undefined)] as unknown as T;
    }
    if (isPlainObject(base) && isPlainObject(over)) {
        const out: any = { ...base };
        for (const [k, v] of Object.entries(over)) {
            if (v === undefined) { continue; }
            if (isPlainObject((base as any)[k]) && isPlainObject(v)) {
                out[k] = mergeDefined((base as any)[k], v as any);
            } else if (Array.isArray((base as any)[k]) && Array.isArray(v)) {
                out[k] = mergeDefined((base as any)[k], v as any);
            } else {
                out[k] = v;
            }
        }
        return out;
    }
    // Different types → overlay wins if defined
    return (over as T) ?? base;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && Object.getPrototypeOf(v) === Object.prototype;
}

const SYSTEM_DEFAULTS = {
    profiles: { rootDir: '.kb/profiles', defaultName: 'default', strict: true }
} as const;

export interface ResolveConfigArgs<TConfig, _TEnvMap = unknown> {
    defaults: TConfig;
    fileConfig?: Partial<TConfig>;
    envMapper?: (env: NodeJS.ProcessEnv) => Partial<TConfig> | undefined; // product supplies mapping
    cliOverrides?: Partial<TConfig>;
    validate?: (cfg: TConfig) => { ok: boolean; diagnostics?: Diagnostic[] }; // product supplies validation
}

/**
 * Generic resolver: defaults → fileConfig → envMapper(process.env) → cliOverrides.
 * No domain keys inside; mapping/validation provided by the product/shared layer.
 */
export function resolveConfig<TConfig>(args: ResolveConfigArgs<TConfig>): { value: TConfig; diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const envPart = args.envMapper?.(process.env) ?? {};

    const merged = mergeDefined(
        mergeDefined(
            mergeDefined(mergeDefined(structuredClone(SYSTEM_DEFAULTS) as unknown as Partial<TConfig>, structuredClone(args.defaults)), args.fileConfig),
            envPart,
        ),
        args.cliOverrides,
    ) as TConfig;

    if (args.validate) {
        const res = args.validate(merged);
        if (!res.ok) {
            diagnostics.push({ level: "error", code: "CONFIG_VALIDATION_FAILED", message: "Configuration did not pass validation." });
            if (res.diagnostics) { diagnostics.push(...res.diagnostics); }
        } else if (res.diagnostics?.length) {
            diagnostics.push(...res.diagnostics);
        }
    }

    return { value: merged, diagnostics };
}

export { SYSTEM_DEFAULTS };
export type { ProfilesConfig, KBConfig };