/**
 * Pack and context types for KB Labs Mind
 */

import type { SchemaVersion } from "./index";

export type ContextSection =
  | "intent_summary"
  | "product_overview"
  | "project_meta"
  | "api_signatures"
  | "recent_diffs"
  | "docs_overview"
  | "impl_snippets"
  | "configs_profiles";

export interface ContextBudget {
  totalTokens: number;             // e.g. 9000
  caps: Partial<Record<ContextSection, number>>;
  truncation: "start"|"middle"|"end";
}

export type ContextSlice = "overview"|"api"|"diffs"|"snippets"|"configs"|"meta"|"docs";

export interface ContextPreset {
  name: string;
  weight: Partial<Record<ContextSlice, number>>;
}

export interface ContextPackJson {
  schemaVersion: SchemaVersion;
  generator: string;
  intent: string;
  product?: string;
  budgetApplied: ContextBudget;
  sections: Record<ContextSection, string>;  // text per section
  tokensEstimate: number;
  sectionUsage: Record<ContextSection, number>; // per-section token usage
  seed?: number;                    // random seed used for deterministic output
  deterministic: boolean;           // whether output is deterministic
}

// ITokenEstimator strategy (pluggable)
export interface ITokenEstimator {
  estimate(text: string): number;
  truncate(text: string, maxTokens: number, mode: "start"|"middle"|"end"): string;
}
