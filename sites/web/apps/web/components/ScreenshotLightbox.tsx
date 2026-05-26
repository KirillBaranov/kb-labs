'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ScreenshotLightboxProps {
  src: string;
  alt: string;
  url?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export function ScreenshotLightbox({ src, alt, url, className, loading = 'lazy' }: ScreenshotLightboxProps) {
  const t = useTranslations('ui');
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  // Avoid SSR mismatch — portal only works client-side
  React.useEffect(() => { setMounted(true); }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const overlay = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
      onClick={() => setOpen(false)}
      style={{ animation: 'kb-lb-in 0.15s ease' }}
    >
      <style>{`
        @keyframes kb-lb-in {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Close button */}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
        aria-label={t('closeLightbox')}
      >
        <X className="size-5" />
      </button>

      {/* Image container */}
      <div
        className="relative w-full max-w-[92vw] overflow-hidden rounded-xl shadow-2xl"
        style={{ maxHeight: 'calc(92vh - 2rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Browser chrome */}
        {url && (
          <div className="flex items-center gap-3 border-b border-white/10 bg-[#1c1c1e] px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#febc2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex flex-1 justify-center">
              <span className="rounded-md bg-white/[0.07] px-3 py-1 font-mono text-xs text-white/40">
                {url}
              </span>
            </div>
            <div className="w-[46px]" />
          </div>
        )}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="w-full object-contain"
          style={{ maxHeight: 'calc(92vh - 5rem)' }}
        />
      </div>
    </div>
  );

  return (
    <>
      {/* Thumbnail */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group block w-full cursor-zoom-in text-left"
        aria-label={t('openScreenshot', { alt })}
      >
        <img
          src={src}
          alt={alt}
          loading={loading}
          draggable={false}
          className={`w-full transition-opacity duration-200 group-hover:opacity-90 ${className ?? ''}`}
        />
      </button>

      {/* Portal — renders into document.body, above all stacking contexts */}
      {mounted && open && createPortal(overlay, document.body)}
    </>
  );
}
