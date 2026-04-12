import type { ComponentPropsWithoutRef } from 'react';
import { CodeBlock } from './CodeBlock';

function slugify(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function Callout({
  type = 'info',
  children,
}: {
  type?: 'info' | 'warning' | 'tip' | 'danger';
  children: React.ReactNode;
}) {
  const styles: Record<string, React.CSSProperties> = {
    info:    { background: '#eff6ff', borderColor: '#3b82f6', color: '#1e40af' },
    warning: { background: '#fffbeb', borderColor: '#f59e0b', color: '#92400e' },
    tip:     { background: '#f0fdf4', borderColor: '#22c55e', color: '#166534' },
    danger:  { background: '#fef2f2', borderColor: '#ef4444', color: '#991b1b' },
  };
  const s = styles[type];
  return (
    <div style={{
      borderLeft: `3px solid ${s.borderColor}`,
      background: s.background,
      borderRadius: '0 8px 8px 0',
      padding: '0.75rem 1rem',
      margin: '1.25rem 0',
      fontSize: '0.875rem',
      lineHeight: 1.6,
      color: s.color,
    }} className="callout">
      {children}
    </div>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      margin: '1.25rem 0',
    }}>
      {children}
    </div>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '2rem 1fr',
      gap: '0.75rem',
      alignItems: 'start',
    }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: '#0c66ff',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.8rem',
        fontWeight: 700,
        flexShrink: 0,
        marginTop: 2,
      }}>
        •
      </div>
      <div>
        {title && <strong style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9375rem' }}>{title}</strong>}
        <div style={{ color: 'var(--fg-muted)', fontSize: '0.9rem', lineHeight: 1.7 }}>{children}</div>
      </div>
    </div>
  );
}

type HeadingProps = ComponentPropsWithoutRef<'h2'> & { children?: React.ReactNode };

export const MdxComponents = {
  /* Headings with stable IDs for anchor links and ToC */
  h2: ({ children, ...props }: HeadingProps) => {
    const id = slugify(String(children));
    return <h2 id={id} {...props}>{children}</h2>;
  },
  h3: ({ children, ...props }: HeadingProps) => {
    const id = slugify(String(children));
    return <h3 id={id} {...props}>{children}</h3>;
  },

  /* Code blocks: rehype-pretty-code adds tokens + data-language; CodeBlock adds toolbar */
  pre: CodeBlock,

  /* Custom components available in MDX files */
  Callout,
  Steps,
  Step,
} as const;
