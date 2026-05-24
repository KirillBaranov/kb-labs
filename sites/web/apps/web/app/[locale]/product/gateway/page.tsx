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
  GatewayAdapterSwapDiagram,
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
    title: 'Gateway — KB Labs',
    description: 'Единая точка входа. Любой сервис получает LLM, EventBus, Cache и Storage через HTTP — без привязки к вендорам.',
    path: '/product/gateway',
  });
}

// ── Code examples ────────────────────────────────────────────────────────────

const PLATFORM_API_CODE = `\
# Cart service pushes an event — no Redis SDK, no Kafka client
POST /platform/v1/eventBus/publish
Authorization: Bearer <token>
Content-Type: application/json

{
  "args": ["order.created", {
    "orderId": "ord-9f2a",
    "total":   149.90
  }]
}

# 200 OK
{ "ok": true, "result": null, "durationMs": 3 }`;

const LLM_CODE = `\
# OpenAI-compatible — "model" is a tier, not a model name
POST /llm/v1/chat/completions
Authorization: Bearer <token>
Content-Type: application/json

{
  "model":    "medium",
  "messages": [{ "role": "user", "content": "Classify this ticket" }],
  "stream":   true
}

# Swap Anthropic → OpenAI in kb.config.json — this request stays the same`;

const TELEMETRY_CODE = `\
# Any service sends events — free-form payload, dot-notation type
POST /telemetry/v1/ingest
Authorization: Bearer <token>
Content-Type: application/json

{
  "events": [{
    "source":  "cart-service",
    "type":    "order.completed",
    "payload": { "orderId": "ord-9f2a", "total": 149.90 },
    "tags":    { "env": "prod", "region": "eu" }
  }]
}

# Up to 500 events per batch. Goes to IAnalytics — SQLite, DuckDB, or file.`;

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function GatewayPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden py-20 pb-12">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow className="mb-4">Infrastructure · :4000</Eyebrow>
              <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl">
                Платформенные возможности{' '}
                <GradientText>для любого сервиса</GradientText>
              </h1>
              <p className="mb-8 text-lg leading-relaxed text-muted/70">
                Любой HTTP-сервис получает LLM, EventBus, Cache и Storage через
                единый endpoint. Провайдеры меняются в конфиге — потребители
                не трогаются.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild size="lg">
                  <a href="https://docs.kblabs.ru/gateway" target="_blank" rel="noopener noreferrer">
                    Документация
                    <ExternalLink className="ml-2 size-4" />
                  </a>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href={`/${locale}/install`}>Установить</a>
                </Button>
              </div>
            </div>
            <div className="mx-auto mt-14 max-w-lg">
              <GatewayAdapterSwapDiagram />
            </div>
          </Container>
        </section>

        {/* ── Platform API ── */}
        <Section>
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <AnimateOnScroll>
                <Eyebrow className="mb-3">Platform API</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  Один endpoint. Все адаптеры.
                </h2>
                <p className="mb-6 text-base leading-relaxed text-muted/70">
                  <code className="rounded px-1.5 py-0.5 font-mono text-[0.85em] bg-surface text-kb-text/75">
                    POST /platform/v1/{'{adapter}/{method}'}
                  </code>{' '}
                  — девять адаптеров с чётким allowlist методов. Стриминг
                  автоматически если метод возвращает AsyncIterable.
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href="https://docs.kblabs.ru/gateway" target="_blank" rel="noopener noreferrer">
                    Документация
                    <ExternalLink className="ml-2 size-3.5" />
                  </a>
                </Button>
              </AnimateOnScroll>
              <AnimateOnScroll delay={100}>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  <CodeBlock
                    code={PLATFORM_API_CODE}
                    language="bash"
                    style={{ maxHeight: 400, overflowY: 'auto' }}
                  />
                </div>
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── AI Gateway ── */}
        <Section className="bg-surface/50">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <AnimateOnScroll>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  <CodeBlock
                    code={LLM_CODE}
                    language="bash"
                    style={{ maxHeight: 400, overflowY: 'auto' }}
                  />
                </div>
              </AnimateOnScroll>
              <AnimateOnScroll delay={100}>
                <Eyebrow className="mb-3">AI Gateway</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  OpenAI-compatible. Без привязки к вендору.
                </h2>
                <p className="mb-6 text-base leading-relaxed text-muted/70">
                  Поле <code className="rounded px-1.5 py-0.5 font-mono text-[0.85em] bg-surface text-kb-text/75">model</code> — это тир (small · medium · large),
                  а не имя модели. LLM Router резолвит тир в конкретный адаптер.
                  Меняешь провайдера в конфиге — все вызовы подхватывают автоматически.
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href="https://docs.kblabs.ru/gateway" target="_blank" rel="noopener noreferrer">
                    Документация
                    <ExternalLink className="ml-2 size-3.5" />
                  </a>
                </Button>
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Telemetry ── */}
        <Section>
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <AnimateOnScroll>
                <Eyebrow className="mb-3">Telemetry</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  События от любого сервиса. Без схемы.
                </h2>
                <p className="mb-6 text-base leading-relaxed text-muted/70">
                  <code className="rounded px-1.5 py-0.5 font-mono text-[0.85em] bg-surface text-kb-text/75">
                    POST /telemetry/v1/ingest
                  </code>{' '}
                  — батч до 500 событий, dot-notation типы, свободный payload.
                  Пишет в IAnalytics — SQLite, DuckDB или файл.
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href="https://docs.kblabs.ru/gateway" target="_blank" rel="noopener noreferrer">
                    Документация
                    <ExternalLink className="ml-2 size-3.5" />
                  </a>
                </Button>
              </AnimateOnScroll>
              <AnimateOnScroll delay={100}>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  <CodeBlock
                    code={TELEMETRY_CODE}
                    language="bash"
                    style={{ maxHeight: 400, overflowY: 'auto' }}
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
                    Один порт. Все возможности.
                  </h2>
                  <p className="mx-auto mb-8 max-w-[44ch] text-[1.05rem] leading-[1.7] text-muted">
                    Провайдеры меняются в конфиге — сервисы не трогаются.
                    Gateway запускается вместе с платформой.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href={`/${locale}/install`}>
                      Установить
                    </Button>
                    <Button variant="secondary" size="lg" href="https://docs.kblabs.ru/gateway" target="_blank" rel="noopener noreferrer">
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
