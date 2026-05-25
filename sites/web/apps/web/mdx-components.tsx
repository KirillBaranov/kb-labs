export function useMDXComponents(
  components: Record<string, React.ComponentType>,
): Record<string, React.ComponentType> {
  return { ...components };
}
