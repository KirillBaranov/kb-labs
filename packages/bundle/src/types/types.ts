export type ProductId = "aiReview" | "devlink" | string;

export interface LoadBundleOptions {
  cwd: string;
  product: ProductId;
  profileKey?: string;
  cli?: Record<string, unknown>;
  writeFinalConfig?: boolean;
  validate?: boolean | 'warn';
}

export interface LoadBundleResult {
  config: Record<string, unknown>;
  profile?: Record<string, unknown>;
  errors?: string[];
}

export class ConfigValidationError extends Error {
  constructor(
    public product: ProductId,
    public errors: any[]
  ) {
    super(`Config validation failed for product ${product}`);
    this.name = 'ConfigValidationError';
  }
}