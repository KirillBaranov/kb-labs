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
  TerminalBlock,
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
    title: 'kb-dev — KB Labs',
    description: 'Один бинарник, который запускает сервисы в правильном порядке, ждёт пока они реально поднимутся, и нормально останавливает всё при выходе.',
    path: '/kb-dev',
  });
}

// ── Content ───────────────────────────────────────────────────────────────────

const DEVSERVICES_YAML = `\
name: my-project

services:
  postgres:
    type: docker
    command: docker run --rm -p 5432:5432 postgres:16
    health_check: localhost:5432
    port: 5432

  api:
    command: pnpm dev
    port: 3000
    health_check: http://localhost:3000/health
    depends_on: [postgres]

  worker:
    command: pnpm worker
    depends_on: [postgres]`;

const COMMANDS = [
  { cmd: 'kb-dev start',                    desc: 'Запустить все сервисы в порядке зависимостей. Можно указать имя или группу.' },
  { cmd: 'kb-dev stop',                     desc: 'Остановить сервисы. --cascade останавливает всё, что зависит от цели.' },
  { cmd: 'kb-dev status',                   desc: 'Таблица статусов с latency health-пробы. --json для скриптов.' },
  { cmd: 'kb-dev doctor',                   desc: 'Проверить окружение: node, docker, конфликты портов. Даёт hint для каждой проблемы.' },
  { cmd: 'kb-dev ready api --timeout 30s',  desc: 'Блокировать до тех пор, пока сервис не станет alive. Gate в CI или агентных сценариях.' },
  { cmd: 'kb-dev watch --json',             desc: 'Стримить события жизненного цикла как JSONL: health, crashed, restarting, alive.' },
];

const FEATURES = [
  {
    title: 'Health check перед стартом зависимых',
    detail: 'HTTP, TCP и командные пробы с замером latency. Сервис считается alive только после того, как проверка прошла — не раньше.',
  },
  {
    title: 'Топологическая сортировка',
    detail: 'Строит граф зависимостей и запускает параллельно в пределах слоя. Postgres всегда поднимется до api, порядок гарантирован.',
  },
  {
    title: 'Watchdog с экспоненциальным backoff',
    detail: 'Упавший сервис перезапускается автоматически, до 5 попыток. Убивает группу процессов целиком — никаких зависших дочерних.',
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function KbDevPage({ params }: Props) {
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
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <AnimateOnScroll>
                <Eyebrow className="mb-4">Service Manager · Go</Eyebrow>
                <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl">
                  Хватит жонглировать{' '}
                  <GradientText>вкладками терминала</GradientText>
                </h1>
                <p className="mb-8 text-lg leading-relaxed text-muted/70">
                  Один бинарник, который запускает сервисы в правильном порядке,
                  ждёт пока они реально поднимутся, и нормально останавливает
                  всё при выходе.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button asChild size="lg">
                    <a href="https://docs.kblabs.ru/services/kb-dev" target="_blank" rel="noopener noreferrer">
                      Документация
                      <ExternalLink className="ml-2 size-4" />
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <a href="https://github.com/KirillBaranov/kb-labs/releases/latest" target="_blank" rel="noopener noreferrer">
                      GitHub Releases
                      <ExternalLink className="ml-2 size-4" />
                    </a>
                  </Button>
                </div>
              </AnimateOnScroll>

              <AnimateOnScroll delay={100}>
                <TerminalBlock
                  commands={[
                    'curl -fsSL https://kblabs.ru/kb-dev/install.sh | sh',
                    'kb-dev start',
                    'kb-dev status',
                    'kb-dev doctor',
                  ]}
                  loop
                />
              </AnimateOnScroll>
            </div>
          </Container>
        </section>

        {/* ── devservices.yaml ── */}
        <Section className="border-t border-line">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <AnimateOnScroll>
                <Eyebrow className="mb-3">Конфигурация</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  Один файл. Любой проект.
                </h2>
                <p className="mb-4 text-base leading-relaxed text-muted/70">
                  Положи <code className="rounded px-1.5 py-0.5 font-mono text-[0.85em] bg-surface text-kb-text/75">devservices.yaml</code> в
                  корень проекта — kb-dev найдёт его автоматически, поднимаясь
                  по директориям от текущей.
                </p>
                <p className="text-base leading-relaxed text-muted/70">
                  Работает с любым стеком: Docker, pnpm, npm, make, shell.
                  KB Labs использует <code className="rounded px-1.5 py-0.5 font-mono text-[0.85em] bg-surface text-kb-text/75">.kb/devservices.yaml</code> — тот же формат.
                </p>
              </AnimateOnScroll>

              <AnimateOnScroll delay={100}>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  <CodeBlock code={DEVSERVICES_YAML} language="yaml" />
                </div>
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Commands ── */}
        <Section className="bg-surface/50">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto mb-12 max-w-xl text-center">
                <Eyebrow className="mb-3">Команды</Eyebrow>
                <h2 className="text-3xl font-bold tracking-tight text-kb-text">
                  Всё поддаётся автоматизации.
                </h2>
              </div>
            </AnimateOnScroll>

            <AnimateOnScroll delay={80}>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                {COMMANDS.map((item, i) => (
                  <div
                    key={item.cmd}
                    className={`flex flex-col gap-1.5 px-6 py-4 sm:flex-row sm:items-baseline sm:gap-6 ${i < COMMANDS.length - 1 ? 'border-b border-line' : ''}`}
                  >
                    <code className="flex-shrink-0 font-mono text-[0.82rem] text-kb-text/85 sm:w-64">
                      {item.cmd}
                    </code>
                    <span className="text-sm leading-relaxed text-muted/60">{item.desc}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center font-mono text-[0.65rem] text-muted/30">
                Все команды поддерживают --json для скриптов и CI
              </p>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Features ── */}
        <Section>
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto mb-12 max-w-xl text-center">
                <Eyebrow className="mb-3">Как это работает</Eyebrow>
                <h2 className="text-3xl font-bold tracking-tight text-kb-text">
                  Детали, которые важны.
                </h2>
              </div>
            </AnimateOnScroll>

            <div className="grid gap-6 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <AnimateOnScroll key={f.title} delay={i * 80}>
                  <div className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6 shadow-sm">
                    <h3 className="mb-3 text-base font-semibold text-kb-text">{f.title}</h3>
                    <p className="mt-auto text-sm leading-relaxed text-muted/60">{f.detail}</p>
                  </div>
                </AnimateOnScroll>
              ))}
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
                  <Eyebrow className="mb-4">Установить</Eyebrow>
                  <h2 className="mb-4 text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold leading-tight tracking-tight text-kb-text">
                    Один бинарник. Без зависимостей.
                  </h2>
                  <div className="mx-auto mb-8 max-w-xl overflow-hidden rounded-xl border border-line bg-surface">
                    <CodeBlock
                      code="curl -fsSL https://kblabs.ru/kb-dev/install.sh | sh"
                      language="bash"
                    />
                  </div>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href="https://docs.kblabs.ru/services/kb-dev" target="_blank" rel="noopener noreferrer">
                      Документация
                    </Button>
                    <Button variant="secondary" size="lg" href="https://github.com/KirillBaranov/kb-labs/releases/latest" target="_blank" rel="noopener noreferrer">
                      GitHub Releases
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
