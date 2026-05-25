'use client';

import { CopyButton } from './CopyButton';

interface Props {
  text: string;
  className?: string;
}

/**
 * Shared command / code field with gradient fade before the copy button.
 * Use this everywhere instead of the inline copy-field pattern.
 */
export function CommandField({ text, className }: Props) {
  return (
    <div
      className={[
        'group relative flex items-center overflow-hidden rounded-lg border border-line bg-bg',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* scrollable code — right padding reserves space for fade + button */}
      <code className="block w-full overflow-x-auto whitespace-nowrap px-4 py-2.5 font-mono text-sm text-kb-text [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {text}
      </code>

      {/* gradient fade: transparent → bg-bg */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-bg to-transparent"
      />

      {/* copy button on top */}
      <div className="absolute inset-y-0 right-0 flex items-center pr-2">
        <CopyButton text={text} />
      </div>
    </div>
  );
}
