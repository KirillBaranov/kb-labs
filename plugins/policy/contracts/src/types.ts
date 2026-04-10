export type PolicySeverity = 'error' | 'warning';

export interface PolicyViolation {
  rule: string;
  severity: PolicySeverity;
  message: string;
  package?: string;
  detail?: string;
  file?: string;
}

export interface RepoCheckResult {
  path: string;
  category: string | null;
  violations: PolicyViolation[];
  passed: string[];
}

export interface CheckReport {
  passed: boolean;
  repos: RepoCheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    violations: number;
  };
}

export interface CategoryResult {
  path: string;
  category: string | null;
  rules: string[];
}

export interface PolicyCategoryConfig {
  paths: string[];
  rules: string[];
}

export interface PolicyRuleConfig {
  description: string;
  severity: PolicySeverity;
  config?: Record<string, unknown>;
}

export interface PolicyConfig {
  categories: Record<string, PolicyCategoryConfig>;
  rules: Record<string, PolicyRuleConfig>;
}

export interface ApiSnapshot {
  packageName: string;
  version: string;
  symbols: string[];
  extractedAt: string;
}
