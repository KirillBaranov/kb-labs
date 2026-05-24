'use client';

import { useTranslations } from 'next-intl';
import s from './TranslationBanner.module.css';

const GITHUB_CONTENT_BASE =
  'https://github.com/KirillBaranov/kb-labs/new/main/sites/web/apps/docs/content/ru';

type Props = {
  slug: string[];
};

export function TranslationBanner({ slug }: Props) {
  const t = useTranslations('banner');
  const fileUrl = `${GITHUB_CONTENT_BASE}/${slug.join('/')}.mdx`;

  return (
    <div className={s.root} role="note">
      <span className={s.icon} aria-hidden="true">🌐</span>
      <span className={s.text}>{t('text')}</span>
      <a href={fileUrl} className={s.cta} target="_blank" rel="noopener noreferrer">
        {t('cta')}
      </a>
    </div>
  );
}
