/**
 * UIDiffViewer — renders unified git diff with line highlighting.
 * Uses design tokens for theming (light/dark compatible).
 */

import { UITypographyText } from '../primitives';

export interface UIDiffViewerProps {
  /** Raw diff string (git diff output) */
  diff: string;
  /** Show line numbers (default: true) */
  showLineNumbers?: boolean;
  /** Max height in pixels (default: 500) */
  maxHeight?: number;
  /** Custom className */
  className?: string;
  /** Custom style */
  style?: React.CSSProperties;
}

type LineType = 'add' | 'remove' | 'context' | 'header';

function getLineType(line: string): LineType {
  if (line.startsWith('@@')) { return 'header'; }
  if (line.startsWith('+')) { return 'add'; }
  if (line.startsWith('-')) { return 'remove'; }
  return 'context';
}

const LINE_STYLES: Record<LineType, { bg: string; border: string; color: string }> = {
  add: { bg: 'rgba(22, 163, 74, 0.12)', border: 'var(--success, #16a34a)', color: 'var(--success, #16a34a)' },
  remove: { bg: 'rgba(220, 38, 38, 0.12)', border: 'var(--error, #dc2626)', color: 'var(--error, #dc2626)' },
  header: { bg: 'var(--bg-tertiary, rgba(0,0,0,0.04))', border: 'transparent', color: 'var(--text-secondary, #6b7280)' },
  context: { bg: 'transparent', border: 'transparent', color: 'inherit' },
};

export function UIDiffViewer({
  diff,
  showLineNumbers = true,
  maxHeight = 500,
  className,
  style,
}: UIDiffViewerProps) {
  if (!diff || diff.trim() === '') {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <UITypographyText type="secondary">No changes to display</UITypographyText>
      </div>
    );
  }

  const lines = diff.split('\n');

  return (
    <div
      className={className}
      style={{
        background: 'var(--bg-tertiary, rgba(0,0,0,0.02))',
        border: '1px solid var(--border-primary, rgba(0,0,0,0.1))',
        borderRadius: 'var(--radius-md, 6px)',
        fontFamily: 'Monaco, Menlo, "Courier New", monospace',
        fontSize: 13,
        lineHeight: 1.5,
        maxHeight,
        overflow: 'auto',
        ...style,
      }}
    >
      {lines.map((line, i) => {
        const type = getLineType(line);
        const s = LINE_STYLES[type];
        const hasLeftBorder = type === 'add' || type === 'remove';

        return (
          <div
            key={i}
            style={{
              display: 'flex',
              background: s.bg,
              borderLeft: hasLeftBorder ? `3px solid ${s.border}` : 'none',
              paddingLeft: hasLeftBorder ? 8 : 11,
            }}
          >
            {showLineNumbers && (
              <span
                style={{
                  minWidth: 44,
                  textAlign: 'right',
                  paddingRight: 12,
                  userSelect: 'none',
                  color: 'var(--text-secondary, #6c757d)',
                  fontSize: 12,
                }}
              >
                {i + 1}
              </span>
            )}
            <pre style={{ margin: 0, padding: 0, color: s.color, whiteSpace: 'pre', flex: 1 }}>
              {line}
            </pre>
          </div>
        );
      })}
    </div>
  );
}
