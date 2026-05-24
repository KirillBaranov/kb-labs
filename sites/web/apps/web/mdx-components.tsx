import type React from 'react';

/**
 * Global MDX component overrides for @next/mdx.
 * Required by Next.js when using the @next/mdx plugin with App Router.
 */
export function useMDXComponents(
  components: Record<string, React.ComponentType>
): Record<string, React.ComponentType> {
  return { ...components };
}
