import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import s from '../not-found.module.css';

export default function NotFound() {
  const t = useTranslations('notFound');
  const locale = useLocale();

  return (
    <main className={s.root}>
      <div className={s.inner}>
        <p className={s.code}>{t('code')}</p>
        <h1 className={s.heading}>{t('heading')}</h1>
        <p className={s.sub}>{t('sub')}</p>
        <Link href={`/${locale}/quick-start`} className={s.btn}>{t('back')}</Link> {/* link-ignore */}
      </div>
    </main>
  );
}
