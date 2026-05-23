'use client';

import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { cn } from '../../lib/utils';

export function CopyButton({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'flex items-center gap-1.5 text-xs text-muted hover:text-kb-text transition-colors duration-150',
        'bg-transparent border-0 outline-none cursor-pointer',
        className
      )}
      aria-label="Copy code"
    >
      {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
