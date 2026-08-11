import { PluginMarkdownContent } from './plugin-markdown-content';

export interface ChangelogTabProps {
  content: string | null;
  loading: boolean;
  error: string | null;
}

export function ChangelogTab({ content, loading, error }: ChangelogTabProps) {
  return (
    <PluginMarkdownContent
      content={content}
      loading={loading}
      error={error}
      emptyText="This plugin has no CHANGELOG.md"
    />
  );
}
