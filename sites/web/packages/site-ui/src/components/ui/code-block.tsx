import { codeToHtml } from 'shiki';
import { cn } from '../../lib/utils';
import { CopyButton } from './copy-button';

export interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
}

export async function CodeBlock({ code, language = 'typescript', filename, className }: CodeBlockProps) {
  const html = await codeToHtml(code.trim(), {
    lang: language,
    themes: {
      dark: 'github-dark-dimmed',
      light: 'github-light',
    },
    defaultColor: false,
  });

  const hasHeader = Boolean(filename || language);

  return (
    <div className={cn('rounded-xl border border-line-strong overflow-hidden shadow-card', className)}>
      {hasHeader && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-line bg-surface">
          <div className="flex items-center gap-2">
            {filename && (
              <span className="text-xs text-muted font-mono">{filename}</span>
            )}
            {language && !filename && (
              <span className="text-xs text-muted/60 font-mono">{language}</span>
            )}
            {filename && language && (
              <span className="text-xs text-muted/40 font-mono">{language}</span>
            )}
          </div>
          <CopyButton code={code.trim()} />
        </div>
      )}
      <div
        className={cn(
          '[&>pre]:m-0 [&>pre]:p-4 [&>pre]:overflow-x-auto [&>pre]:text-sm [&>pre]:leading-relaxed [&>pre]:rounded-none',
          'shiki-container'
        )}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
