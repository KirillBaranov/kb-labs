'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const translations: Record<string, { description: string; goHome: string; contact: string }> = {
  ru: {
    description: 'Страница не существует или была перемещена.',
    goHome: 'На главную',
    contact: 'Связаться',
  },
  en: {
    description: "The page you're looking for doesn't exist or has been moved.",
    goHome: 'Go home',
    contact: 'Contact us',
  },
};

export default function RootNotFound() {
  const pathname = usePathname();
  const segment = pathname?.split('/')[1];
  const locale = segment === 'en' ? 'en' : 'ru';
  const t = translations[locale];

  return (
    <html lang={locale}>
      <body style={{
        margin: 0,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: '#f7f7f8',
        color: '#0f1115',
      }}>
        {/* Minimal header */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 2rem',
          height: 74,
          borderBottom: '1px solid #d9dde6',
          background: '#fff',
        }}>
          <Link href={`/${locale}`} style={{
            fontSize: '1.1rem', fontWeight: 700, color: '#0f1115', textDecoration: 'none',
          }}>
            KB Labs
          </Link>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link href={`/${locale}`} style={{
              padding: '0.4rem 1rem', borderRadius: 8, border: '1px solid #d9dde6',
              fontSize: '0.85rem', fontWeight: 500, color: '#0f1115', textDecoration: 'none',
              background: '#fff',
            }}>
              {locale === 'ru' ? 'Войти' : 'Log in'}
            </Link>
            <Link href={`/${locale}/install`} style={{
              padding: '0.4rem 1rem', borderRadius: 8, border: 'none',
              fontSize: '0.85rem', fontWeight: 600, color: '#fff', textDecoration: 'none',
              background: '#0f1115',
            }}>
              {locale === 'ru' ? 'Установить' : 'Install'}
            </Link>
          </div>
        </header>

        {/* Content */}
        <main style={{
          minHeight: 'calc(100vh - 74px - 80px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6rem 1.5rem',
        }}>
          <div style={{ textAlign: 'center', maxWidth: 480 }}>
            <p style={{
              fontSize: 'clamp(5rem, 20vw, 9rem)',
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: '-0.05em',
              margin: '0 0 1rem',
              color: '#0f1115',
            }}>404</p>
            <p style={{
              fontSize: '1rem',
              color: '#5c616d',
              lineHeight: 1.6,
              margin: '0 0 2.5rem',
            }}>
              {t.description}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href={`/${locale}`} style={{
                display: 'inline-flex', alignItems: 'center', height: 44,
                padding: '0 1.5rem', borderRadius: 8,
                background: '#0f1115', color: '#fff',
                fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none',
              }}>
                {t.goHome}
              </Link>
              <Link href={`/${locale}/contact`} style={{
                display: 'inline-flex', alignItems: 'center', height: 44,
                padding: '0 1.5rem', borderRadius: 8,
                border: '1px solid #d9dde6', color: '#5c616d',
                fontSize: '0.875rem', fontWeight: 500, textDecoration: 'none',
                background: '#fff',
              }}>
                {t.contact}
              </Link>
            </div>
          </div>
        </main>

        {/* Minimal footer */}
        <footer style={{
          padding: '1.5rem 2rem',
          borderTop: '1px solid #d9dde6',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: '#5c616d',
        }}>
          KB Labs
        </footer>
      </body>
    </html>
  );
}
