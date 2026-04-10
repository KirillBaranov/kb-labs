// ── Impact Analysis Types ──

export type ImpactLevel = 'direct' | 'dependent' | 'transitive';

export interface PackageImpact {
  name: string;
  repo: string;
  level: ImpactLevel;
  changedFiles?: number;
  reason?: string;
}

export type DocAction = 'review' | 'regenerate' | 'reindex';

export interface DocImpact {
  file?: string;
  reason: string;
  action: DocAction;
  command?: string;
}

export interface DocRule {
  match: string;
  docs?: string[];
  action: DocAction;
  command?: string;
}

export interface ImpactPluginConfig {
  docRules: DocRule[];
}

export interface TestImpact {
  name: string;
  repo: string;
  level: ImpactLevel;
  reason?: string;
  hasTests: boolean;
  testCount?: number;
  command?: string;
}

export interface BuildImpact {
  name: string;
  repo: string;
  level: ImpactLevel;
  order: number;
  reason?: string;
}

export interface BuildPlan {
  steps: BuildImpact[];
  command: string;
  totalPackages: number;
}

export interface ImpactAnalysisResult {
  packages: {
    direct: PackageImpact[];
    dependent: PackageImpact[];
    transitive: PackageImpact[];
  };
  docs: {
    stale: DocImpact[];
    review: DocImpact[];
    reindex: DocImpact[];
  };
  tests: {
    mustRun: TestImpact[];
    noTests: TestImpact[];
  };
  build: BuildPlan;
  recommendations: string[];
}

export interface ChangedPackage {
  name: string;
  repo: string;
  changedFiles: number;
}

export interface DepGraphNode {
  name: string;
  repo: string;
  dependsOn: string[];
  dependedBy: string[];
}

export interface SubRepo {
  path: string;
  category: string;
  name: string;
}
