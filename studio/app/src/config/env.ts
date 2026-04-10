type StudioEnv = Record<string, string | undefined>;

export function getStudioEnv(): StudioEnv {
  return ((import.meta as ImportMeta & { env?: StudioEnv }).env) ?? {};
}
