import { loadBundle } from '@kb-labs/bundle';
import { ProductId } from '@kb-labs/bundle';

export interface ValidateCommandOptions {
  product: ProductId;
  profile?: string;
  cwd?: string;
}

export async function validateCommand(opts: ValidateCommandOptions): Promise<void> {
  const { product, profile, cwd = process.cwd() } = opts;
  
  try {
    console.log(`Validating config for product: ${product}`);
    if (profile) {
      console.log(`Using profile: ${profile}`);
    }
    
    const result = await loadBundle({
      cwd,
      product,
      profileKey: profile,
      validate: true
    });
    
    console.log('✅ Config validation passed');
    console.log('Configuration:', JSON.stringify(result.config, null, 2));
    
  } catch (error) {
    if (error instanceof Error && error.name === 'ConfigValidationError') {
      console.error('❌ Config validation failed:');
      console.error(error.message);
      process.exit(1);
    } else {
      console.error('❌ Error during validation:', error);
      process.exit(1);
    }
  }
}