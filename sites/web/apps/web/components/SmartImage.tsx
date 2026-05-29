'use client';

import NextImage, { type ImageProps } from 'next/image';
import { useState } from 'react';
import { cn } from '@kb-labs/web-site-ui';

// Tiny 16×9 SVG in the app's dark surface color — shown instantly while the
// real image downloads. Prevents layout shift and blank-frame flash.
const DARK_BLUR =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSI5Ij48cmVjdCB3aWR0aD0iMTYiIGhlaWdodD0iOSIgZmlsbD0iIzFhMWIxZSIvPjwvc3ZnPg==';

export type SmartImageProps = Omit<ImageProps, 'placeholder' | 'blurDataURL'> & {
  /** Wrap the image in a container with this className (useful for positioning). */
  wrapperClassName?: string;
};

/**
 * Drop-in replacement for next/image that adds:
 * - Dark SVG blur placeholder (no layout shift, no blank frame)
 * - Smooth opacity fade-in when the real image loads
 * - Proper sizes/quality defaults for content images
 *
 * Usage:
 *   <SmartImage src="/screenshots/foo.png" alt="…" width={1440} height={900} />
 */
export function SmartImage({
  className,
  wrapperClassName,
  onLoad,
  sizes,
  quality,
  ...props
}: SmartImageProps) {
  const [loaded, setLoaded] = useState(false);

  const img = (
    <NextImage
      {...props}
      sizes={sizes ?? '(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1140px'}
      quality={quality ?? 85}
      placeholder="blur"
      blurDataURL={DARK_BLUR}
      className={cn(
        'transition-opacity duration-500 ease-in-out',
        loaded ? 'opacity-100' : 'opacity-0',
        className,
      )}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
    />
  );

  if (wrapperClassName) {
    return <div className={wrapperClassName}>{img}</div>;
  }

  return img;
}
