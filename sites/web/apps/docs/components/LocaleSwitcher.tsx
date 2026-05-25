'use client';

import Link from 'next/link';
import s from './LocaleSwitcher.module.css';

type Props = {
  locale: string;
  slug: string[];
};

const LOCALES = ['en', 'ru'] as const;

export function LocaleSwitcher({ locale, slug }: Props) {
  const slugPath = slug.length > 0 ? '/' + slug.join('/') : '/quick-start';

  return (
    <div className={s.root} role="group" aria-label="Language">
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={`/${l}${slugPath}`}
          className={`${s.btn}${locale === l ? ` ${s.active}` : ''}`}
          aria-current={locale === l ? 'true' : undefined}
        >
          {l.toUpperCase()}
        </Link>
      ))}
    </div>
  );
}
