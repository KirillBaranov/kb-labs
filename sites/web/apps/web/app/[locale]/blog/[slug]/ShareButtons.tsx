'use client';

import { useState } from 'react';
import { Link2, Twitter } from 'lucide-react';

interface Props {
  title: string;
  url: string;
}

export function ShareButtons({ title, url }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted/60 transition-colors hover:border-accent/40 hover:text-kb-text"
      >
        <Link2 size={13} />
        {copied ? 'Copied!' : 'Copy link'}
      </button>
      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted/60 transition-colors hover:border-accent/40 hover:text-kb-text"
      >
        <Twitter size={13} />
        Share
      </a>
    </div>
  );
}
