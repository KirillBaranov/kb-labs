'use client';

import dynamic from 'next/dynamic';

// Loaded after hydration — not needed for initial paint
const CookieBanner = dynamic(
  () => import('./CookieBanner').then((m) => m.CookieBanner),
  { ssr: false, loading: () => null },
);

export function DeferredCookieBanner() {
  return <CookieBanner />;
}
