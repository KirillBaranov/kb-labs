import { DEFAULT_IMPACT_CONFIG, type ImpactPluginConfig } from '@kb-labs/impact-contracts';

export async function loadImpactRules(useConfigFn?: () => Promise<Partial<ImpactPluginConfig> | undefined>): Promise<ImpactPluginConfig> {
  if (useConfigFn) {
    try {
      const config = await useConfigFn();
      if (config?.docRules?.length) {return { docRules: config.docRules };}
    } catch { /* fallback to defaults */ }
  }
  return DEFAULT_IMPACT_CONFIG;
}
