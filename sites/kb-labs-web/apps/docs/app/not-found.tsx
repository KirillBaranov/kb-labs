import Link from 'next/link';
import { DocsHeader } from '@/components/DocsHeader';
import s from './not-found.module.css';

export default function NotFound() {
  return (
    <>
      <DocsHeader />
      <main className={s.root}>
        <div className={s.inner}>
          <p className={s.code}>404</p>
          <h1 className={s.heading}>Page not found</h1>
          <p className={s.sub}>This page doesn&apos;t exist or hasn&apos;t been written yet.</p>
          <Link href="/quick-start" className={s.btn}>Back to docs</Link>
        </div>
      </main>
    </>
  );
}
