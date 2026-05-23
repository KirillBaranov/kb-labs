'use client';

import * as React from 'react';
import { X } from 'lucide-react';

interface ScreenshotLightboxProps {
  src: string;
  alt: string;
  url?: string;
  className?: string;
}

export function ScreenshotLightbox({ src, alt, url, className }: ScreenshotLightboxProps) {
  const [open, setOpen] = React.useState(false);

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

  return (
    <>
      {/* Thumbnail — clickable */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group block w-full cursor-zoom-in text-left"
        aria-label={`Открыть скриншот: ${alt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          draggable={false}
          className={`w-full transition-opacity duration-200 group-hover:opacity-90 ${className ?? ''}`}
        />
      </button>

      {/* Lightbox overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          style={{ animation: 'kb-lb-in 0.18s ease' }}
        >
          <style>{`
            @keyframes kb-lb-in {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
          `}</style>

          {/* Close button */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="Закрыть"
          >
            <X className="size-5" />
          </button>

          {/* Image container — stops propagation so clicking image itself doesn't close */}
          <div
            className="relative max-h-[90vh] max-w-6xl w-full overflow-hidden rounded-xl shadow-2xl"
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              draggable={false}
              className="max-h-[calc(90vh-3rem)] w-full object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
