import { validateProductConfig } from '@kb-labs/config';
import { validateProfile } from '@kb-labs/profiles';
import { LoadBundleOptions, LoadBundleResult, ConfigValidationError } from '../types/types.js';

export async function loadBundle(opts: LoadBundleOptions): Promise<LoadBundleResult> {
  const { cwd, product, profileKey, cli = {}, validate = false } = opts;
  
  // Mock implementation - in real implementation this would:
  // 1. Load profile if profileKey provided
  // 2. Load product config from filesystem
  // 3. Merge CLI overrides
  // 4. Apply profile defaults
  
  const configResult: LoadBundleResult = {
    config: {
      // Mock product config
      enabled: true,
      ...cli
    }
  };

  // Profile validation if profile provided
  if (profileKey) {
    const mockProfile = { schemaVersion: "1.0", name: "test-profile" };
    const profileValidation = validateProfile(mockProfile);
    if (!profileValidation.ok) {
      throw new Error(`Profile validation failed: ${JSON.stringify(profileValidation.errors)}`);
    }
    configResult.profile = mockProfile;
  }

  // Product config validation
  if (validate) {
    const validation = validateProductConfig(product, configResult.config);
    if (!validation.ok) {
      if (validate === 'warn') {
        console.warn('Config validation warnings:', validation.errors);
      } else {
        throw new ConfigValidationError(product, validation.errors || []);
      }
    }
  }

  return configResult;
}