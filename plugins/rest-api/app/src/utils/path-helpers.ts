export function normalizeBasePath(basePath?: string): string {
  if (!basePath || basePath === '/') {
    return '';
  }
  return basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
}

export function resolvePaths(basePath: string, route: string): string[] {
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  if (!basePath) {
    return [normalizedRoute];
  }
  const base = normalizeBasePath(basePath);
  return Array.from(new Set([normalizedRoute, `${base}${normalizedRoute}`]));
}
