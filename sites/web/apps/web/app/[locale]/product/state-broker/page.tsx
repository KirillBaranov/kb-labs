import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import {
  AnimateOnScroll,
  BorderBeam,
  Button,
  CodeBlock,
  Container,
  DotPattern,
  Eyebrow,
  GradientText,
  Section,
} from '@kb-labs/web-site-ui';
import { buildPageMetadata } from '@/lib/page-metadata';
import { ExternalLink } from 'lucide-react';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({
    locale,
    title: 'State Broker — KB Labs',
    description: 'Состояние между вызовами плагинов. In-memory, daemon или Redis — один и тот же API.',
    path: '/product/state-broker',
  });
}

// ── Data ─────────────────────────────────────────────────────────────────────

const WHEN_TO_USE = [
  {
    badge: 'In-process',
    badgeCls: 'bg-bg text-muted/60 ring-line',
    title: 'Один процесс',
    when: 'Единственный плагин или сервис без daemon',
    detail: 'InMemoryStateBroker встроен, TTL 300s по умолчанию, cleanup каждые 30s. Ноль настроек — работает сразу.',
  },
  {
    badge: 'Daemon · :7777',
    badgeCls: 'bg-accent/10 text-accent/80 ring-accent/20',
    title: 'Несколько сервисов',
    when: 'Плагины и сервисы шарят состояние',
    detail: 'kb-dev start поднимает State Daemon. Состояние живёт между перезапусками плагинов и доступно всем сервисам.',
  },
  {
    badge: 'Platform adapter',
    badgeCls: 'bg-emerald-500/10 text-emerald-600/80 ring-emerald-500/20',
    title: 'Продакшн',
    when: 'Несколько инстансов, распределённая система',
    detail: 'Меняешь backend на Redis в kb.config.json — API остаётся прежним. Тот же get/set/delete, другой провайдер.',
  },
];

// ── Code example ─────────────────────────────────────────────────────────────

const API_CODE = `\
# Store state with TTL (milliseconds, default 300 000 = 5 min)
PUT /state/tenant:default:mind:conv-abc
Content-Type: application/json

{ "value": { "lastReply": "Hello!", "turn": 3 }, "ttl": 300000 }

# 204 No Content

# Read back
GET /state/tenant:default:mind:conv-abc

# → { "lastReply": "Hello!", "turn": 3 }

# Clear an entire namespace
POST /state/clear?pattern=tenant:default:mind:*

# 204 No Content`;

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function StateBrokerPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden py-24 pb-16">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow className="mb-4">State · :7777</Eyebrow>
              <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl">
                Состояние{' '}
                <GradientText>между вызовами</GradientText>
              </h1>
              <p className="mb-8 text-lg leading-relaxed text-muted/70">
                Плагины stateless по умолчанию — каждый вызов начинается заново.
                State Broker хранит состояние с TTL: in-memory, daemon или Redis.
                API не меняется.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild size="lg">
                  <a href={`/${locale}/install`}>Установить</a>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href="https://docs.kblabs.ru/state-broker" target="_blank" rel="noopener noreferrer">
                    Документация
                    <ExternalLink className="ml-2 size-4" />
                  </a>
                </Button>
              </div>
            </div>
          </Container>
        </section>

        {/* ── Когда юзать ── */}
        <Section className="border-t border-line">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto mb-12 max-w-xl text-center">
                <Eyebrow className="mb-3">Когда что использовать</Eyebrow>
                <h2 className="text-3xl font-bold tracking-tight text-kb-text">
                  Три режима. Один API.
                </h2>
              </div>
            </AnimateOnScroll>

            <div className="grid gap-6 lg:grid-cols-3">
              {WHEN_TO_USE.map((item, i) => (
                <AnimateOnScroll key={item.badge} delay={i * 80}>
                  <div className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6 shadow-sm">
                    <span className={`mb-4 self-start rounded-md px-2.5 py-1 font-mono text-[0.68rem] font-medium ring-1 ring-inset ${item.badgeCls}`}>
                      {item.badge}
                    </span>
                    <h3 className="mb-1 text-base font-semibold text-kb-text">{item.title}</h3>
                    <p className="mb-3 text-sm text-accent/70">{item.when}</p>
                    <p className="mt-auto text-sm leading-relaxed text-muted/60">{item.detail}</p>
                  </div>
                </AnimateOnScroll>
              ))}
            </div>
          </Container>
        </Section>

        {/* ── API ── */}
        <Section className="bg-surface/50">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <AnimateOnScroll>
                <Eyebrow className="mb-3">HTTP API</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  Четыре маршрута. Ничего лишнего.
                </h2>
                <p className="mb-6 text-base leading-relaxed text-muted/70">
                  <code className="rounded px-1.5 py-0.5 font-mono text-[0.85em] bg-surface text-kb-text/75">GET · PUT · DELETE /state/:key</code>{' '}
                  плюс{' '}
                  <code className="rounded px-1.5 py-0.5 font-mono text-[0.85em] bg-surface text-kb-text/75">POST /state/clear</code>.
                  Ключи namespaced:{' '}
                  <code className="rounded px-1.5 py-0.5 font-mono text-[0.85em] bg-surface text-kb-text/75">tenant:default:namespace:key</code>.
                  TTL в миллисекундах, по умолчанию 5 минут.
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href="https://docs.kblabs.ru/state-broker" target="_blank" rel="noopener noreferrer">
                    Документация
                    <ExternalLink className="ml-2 size-3.5" />
                  </a>
                </Button>
              </AnimateOnScroll>

              <AnimateOnScroll delay={100}>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  <CodeBlock
                    code={API_CODE}
                    language="bash"
                    style={{ maxHeight: 420, overflowY: 'auto' }}
                  />
                </div>
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── CTA ── */}
        <Section className="bg-bg">
          <Container>
            <AnimateOnScroll>
              <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-8 py-16 text-center">
                <BorderBeam />
                <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.06] blur-[90px]" />
                <div className="relative z-10">
                  <Eyebrow className="mb-4">Попробуйте прямо сейчас</Eyebrow>
                  <h2 className="mb-4 text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold leading-tight tracking-tight text-kb-text">
                    Запускается вместе с платформой.
                  </h2>
                  <p className="mx-auto mb-8 max-w-[44ch] text-[1.05rem] leading-[1.7] text-muted">
                    kb-dev start поднимает State Daemon автоматически.
                    Меняешь backend в конфиге — сервисы не трогаешь.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href={`/${locale}/install`}>
                      Установить
                    </Button>
                    <Button variant="secondary" size="lg" href="https://docs.kblabs.ru/state-broker" target="_blank" rel="noopener noreferrer">
                      Документация
                    </Button>
                  </div>
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

      </main>
      <SiteFooter />
    </>
  );
}
