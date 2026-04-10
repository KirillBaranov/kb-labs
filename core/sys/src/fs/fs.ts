/**
 * @module @kb-labs/core/sys/fs
 * Safe path helpers with explicit bases.
 */

import path from "node:path";

export function toAbsolute(baseDir: string, maybeRelative?: string): string {
    if (!maybeRelative) { return baseDir; }
    return path.isAbsolute(maybeRelative) ? maybeRelative : path.join(baseDir, maybeRelative);
}