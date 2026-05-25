import { setRequestLocale } from 'next-intl/server';
import {
  Accordion,
  AgentDiagram,
  AnimateOnScroll,
  BorderBeam,
  Button,
  CodeBlock,
  Container,
  DotPattern,
  Eyebrow,
  GradientText,
  PainCards,
  Section,
  SectionHeader,
  StatCard,
  Tabs,
  WorkflowDiagram,
  WorkflowRunBlock,
} from '@kb-labs/web-site-ui';
import { Github } from 'lucide-react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

type Props = { params: Promise<{ locale: string }> };

export default async function HomeV2Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ──────────────────────────────────────────────── */}
        <div className="relative overflow-hidden bg-surface pb-20 pt-24">
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.07] blur-[110px]" />
          <DotPattern className="opacity-[0.35]" />
          <Container>
            <div className="relative z-10 flex flex-col items-center text-center">
              <Eyebrow className="mb-5">Open-source · Self-hosted · Private beta</Eyebrow>
              <h1 className="mb-5 text-[clamp(2.2rem,5vw,3.6rem)] font-bold leading-[1.08] tracking-tight text-kb-text">
                <GradientText shimmer>Open-source платформа</GradientText>
                <span className="block">для автоматизации разработки</span>
              </h1>
              <p className="mb-8 max-w-[58ch] text-[1.05rem] leading-[1.75] text-muted">
                Code review, коммиты, релизы — на автопилоте. Self-hosted, под вашим контролем.
              </p>
              <div className="mb-4 flex flex-wrap justify-center gap-3">
                <Button variant="primary" size="lg" href={`/${locale}/install`}>
                  Установить
                </Button>
                <Button variant="secondary" size="lg" href="https://github.com/KirillBaranov/kb-labs" target="_blank" rel="noopener noreferrer">
                  <Github className="size-4" />
                  GitHub
                </Button>
              </div>
              <p className="mb-10 text-[0.8rem] text-muted/60">
                KBPL1.1 + MIT · Без vendor lock-in · Основатель читает каждый issue
              </p>
              <div className="w-full max-w-[560px]">
                <WorkflowRunBlock />
              </div>
            </div>
          </Container>
        </div>

        {/* ── Pain points ───────────────────────────────────────── */}
        <Section>
          <Container>
            <AnimateOnScroll animation="fade">
              <SectionHeader
                eyebrow="Зачем KB Labs"
                title="Четыре боли. Одна платформа."
              />
            </AnimateOnScroll>
            <AnimateOnScroll animation="slide-up" delay={60}>
              <PainCards />
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Workflow diagram ───────────────────────────────────── */}
        <Section>
          <Container>
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.4fr]">
              <AnimateOnScroll animation="fade">
                <div className="flex flex-col gap-4">
                  <Eyebrow>Workflow engine</Eyebrow>
                  <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-bold leading-[1.12] tracking-tight text-kb-text">
                    Логика в коде.<br />Движок решает что дальше.
                  </h2>
                  <p className="text-[1rem] leading-[1.8] text-muted">
                    Каждый шаг возвращает результат. Движок смотрит на него
                    и принимает решение — перейти к следующему, повторить или остановить.
                    Агент — такой же шаг: те же права, те же логи.
                  </p>
                </div>
              </AnimateOnScroll>
              <AnimateOnScroll animation="slide-left" delay={100}>
                <Tabs
                  variant="card"
                  contentClassName="h-[460px]"
                  extra={
                    <span className="font-mono text-[0.68rem] text-muted/55 dark:text-muted/40">
                      code-review.yaml
                    </span>
                  }
                  items={[
                    {
                      id: 'diagram',
                      label: 'Схема',
                      content: <WorkflowDiagram className="p-6" />,
                    },
                    {
                      id: 'code',
                      label: 'YAML',
                      content: (
                        <CodeBlock
                          code={WORKFLOW_CODE}
                          language="yaml"
                          bare
                        />
                      ),
                    },
                  ]}
                />
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Agents ────────────────────────────────────────────── */}
        <Section>
          <Container>
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.4fr_1fr]">
              <AnimateOnScroll animation="slide-left" delay={100}>
                <AgentDiagram />
              </AnimateOnScroll>
              <AnimateOnScroll animation="fade">
                <div className="flex flex-col gap-4">
                  <Eyebrow>Агенты</Eyebrow>
                  <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-bold leading-[1.12] tracking-tight text-kb-text">
                    Агент вызывает команду.<br />Не ваш ключ.
                  </h2>
                  <p className="text-[1rem] leading-[1.8] text-muted">
                    Пишете плагин — агент получает набор команд.
                    Ключи, права доступа, аудит — внутри плагина.
                    Агент не знает как устроен GitHub — он просто вызывает{' '}
                    <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-[0.85em] text-kb-text">kb github create-pr</code>.
                  </p>
                  <p className="text-[1rem] leading-[1.8] text-muted">
                    Внутренние агенты KB Labs идут дальше — каждый шаг трассируется,
                    аналитика считается автоматически, ничего не теряется.
                  </p>
                </div>
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Integrations ──────────────────────────────────────── */}
        <Section>
          <Container>
            <AnimateOnScroll animation="fade">
              <SectionHeader
                eyebrow="Интеграции"
                title="Работает с вашим стеком"
                subtitle="Адаптеры идут в комплекте. Архитектура открыта — любой сервис подключается через единый контракт."
              />
            </AnimateOnScroll>
            <AnimateOnScroll animation="slide-up" delay={60}>
              <div className="overflow-hidden rounded-2xl border border-line">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {INTEGRATION_CATEGORIES.map((cat, i) => (
                    <div
                      key={cat.label}
                      className="border-b border-r border-line p-5 last-of-type:border-b-0 [&:nth-child(3n)]:border-r-0 [&:nth-last-child(-n+3)]:border-b-0"
                    >
                      <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted/50">
                        {cat.label}
                      </p>
                      {cat.note && (
                        <p className="mb-2.5 text-[0.72rem] text-muted/60">{cat.note}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {cat.items.map(item => (
                          <span
                            key={item}
                            className="rounded-md bg-bg px-2 py-0.5 font-mono text-[0.75rem] text-kb-text/70"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-line bg-bg px-5 py-3">
                  <p className="text-[0.8rem] text-muted/60">
                    Не нашли нужного?{' '}
                    <a href={`/${locale}/product#gateway`} className="underline underline-offset-2 hover:text-muted">
                      Напишите свой адаптер
                    </a>
                    {' '}— тот же контракт, та же загрузка.
                  </p>
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Trust ─────────────────────────────────────────────── */}
        <Section>
          <Container>
            <AnimateOnScroll animation="fade">
              <SectionHeader
                eyebrow="Не демо"
                title="Мы сами на этом работаем"
                subtitle="KB Labs — основной инструмент разработки проекта. Всё что видите ниже — реальные цифры из production."
              />
            </AnimateOnScroll>
            <AnimateOnScroll animation="slide-up" delay={80}>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <StatCard
                  value="100М+"
                  label="Токенов через платформу"
                  description="Реальная нагрузка — агенты работают в production каждый день."
                />
                <StatCard
                  value="1000+"
                  label="Коммитов через платформу"
                  description="Плагин для коммитов пишет их вместо нас — анализирует diff, формирует сообщение."
                />
                <StatCard
                  value="Десятки"
                  label="Релизов автоматизировано"
                  description="Release pipeline, changelog, версии — workflow берёт на себя от и до."
                />
              </div>
            </AnimateOnScroll>

            {/* Founder quote — объединён с блоком доверия */}
            <AnimateOnScroll animation="fade" delay={120}>
              <div className="mt-12 flex flex-col items-center gap-4 border-t border-line pt-10 text-center">
                <blockquote className="max-w-[52ch] text-[1.1rem] font-medium leading-[1.75] text-kb-text/80">
                  «Меня раздражали две вещи: дорогие миграции из чужих стеков и рутина,
                  которую давно можно автоматизировать. Крупные компании это давно решили
                  для себя — просто не открыли. Мне захотелось открыть.»
                </blockquote>
                <div className="flex items-center gap-3 text-[0.82rem] text-muted/60">
                  <span className="h-px w-8 bg-line-strong block" />
                  <span className="flex items-center gap-2">
                    Kirill Baranov &middot;{' '}
                    <a href="https://k-baranov.ru" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-muted">
                      k-baranov.ru
                    </a>
                    &middot;{' '}
                    <a href="https://t.me/kirill_baranov" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-muted">
                      Telegram
                    </a>
                  </span>
                  <span className="h-px w-8 bg-line-strong block" />
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── FAQ ───────────────────────────────────────────────── */}
        <Section>
          <Container maxWidth="720px">
            <AnimateOnScroll animation="fade">
              <SectionHeader eyebrow="FAQ" title="Частые вопросы" />
              <Accordion items={FAQ} />
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Final CTA ─────────────────────────────────────────── */}
        <Section>
          <Container>
            <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-8 py-16 text-center shadow-sm">
              <BorderBeam size={300} duration={12} colorFrom="var(--color-accent)" colorTo="transparent" />
              <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.07] blur-[80px]" />
              <div className="relative z-10 flex flex-col items-center gap-5">
                <h2 className="max-w-[22ch] text-[clamp(1.75rem,3.5vw,2.4rem)] font-bold leading-[1.1] tracking-tight text-kb-text">
                  Установите за 5 минут
                </h2>
                <p className="max-w-[44ch] text-[1rem] leading-[1.75] text-muted">
                  Open source, self-hosted. Работает на ноутбуке или VPS.
                  Никаких аккаунтов, никакого vendor lock-in.
                </p>
                <div className="flex flex-wrap justify-center gap-3 pt-1">
                  <Button variant="primary" size="lg" href={`/${locale}/install`}>
                    Установить KB Labs
                  </Button>
                  <Button variant="secondary" size="lg" href="https://github.com/KirillBaranov/kb-labs" target="_blank" rel="noopener noreferrer">
                    <Github className="size-4" />
                    GitHub
                  </Button>
                </div>
              </div>
            </div>
          </Container>
        </Section>

      </main>
      <SiteFooter />
    </>
  );
}

const WORKFLOW_CODE = `name: code-review
version: "1.0"

on:
  push: true

inputs:
  pr:
    type: string
    required: true

jobs:
  review:
    runsOn: sandbox
    steps:
      - id: diff
        name: Fetch diff
        uses: builtin:shell
        with:
          command: gh pr diff \${{ inputs.pr }} --patch

      - id: analyze
        name: AI review
        uses: plugin:@kb-labs/review#run
        with:
          diff: \${{ steps.diff.outputs.stdout }}
          rules: [security, perf, style]

      - id: gate
        name: Check score
        uses: builtin:gate
        with:
          decision: steps.analyze.outputs.passed
          routes:
            "true": continue
            "false": fail

      - id: comment
        name: Post results
        uses: builtin:shell
        with:
          command: |
            gh pr comment \${{ inputs.pr }} \\
              --body "\${{ steps.analyze.outputs.summary }}"
`;

const INTEGRATION_CATEGORIES = [
  {
    label: 'LLM',
    note: 'Любой через адаптер с единым контрактом',
    items: ['OpenAI'],
  },
  {
    label: 'Базы данных',
    items: ['MongoDB', 'SQLite', 'DuckDB', 'Redis'],
  },
  {
    label: 'Векторный поиск',
    items: ['Qdrant', 'Voyage AI'],
  },
  {
    label: 'Хранилище & DevOps',
    items: ['S3', 'Docker', 'GitHub'],
  },
  {
    label: 'Коммуникации',
    items: ['Telegram', 'ClickUp'],
  },
  {
    label: 'Наблюдаемость',
    items: ['Pino'],
  },
] satisfies Array<{ label: string; note?: string; items: string[] }>;

const FAQ = [
  {
    id: 'free',
    question: 'KB Labs бесплатный?',
    answer: 'Dual license. SDK и инструменты — MIT, полностью открытые. Core-платформа — KBPL1.1: self-host без ограничений, модификация разрешена, коммерческое использование — без SaaS-перепродажи.',
  },
  {
    id: 'self-hosted',
    question: 'Нужен ли облачный сервис?',
    answer: 'Нет. KB Labs запускается на вашем сервере, ноутбуке или VPS. Данные остаются внутри вашей инфраструктуры и никуда не уходят.',
  },
  {
    id: 'install',
    question: 'Что нужно для запуска?',
    answer: 'Docker и 2 ГБ RAM — этого достаточно. Разворачивается на ноутбуке или VPS за несколько минут. Подробная инструкция на странице установки.',
  },
  {
    id: 'llm',
    question: 'Какие LLM поддерживаются?',
    answer: 'Из коробки — OpenAI и любые OpenAI-совместимые API: Mistral, Together, Ollama и другие. Каждый LLM — это адаптер с единым контрактом, поэтому подключить свой провайдер несложно.',
  },
  {
    id: 'vs',
    question: 'Чем отличается от n8n, Temporal, LangChain?',
    answer: 'KB Labs — не DAG и не оркестратор задач. Движок смотрит на результат каждого шага и сам решает, что делать дальше. Агент — такой же шаг внутри workflow, а не отдельная сущность поверх.',
  },
  {
    id: 'production',
    question: 'Это production-ready?',
    answer: 'Core-движок и plugin-система стабильны — именно на них построена вся внутренняя разработка KB Labs. Платформа в private beta: публичный релиз запланирован на Q3 2026.',
  },
  {
    id: 'longevity',
    question: 'А вдруг проект заброшен?',
    answer: (
      <>
        Проект развивается с августа 2025 года — в августе будет ровно год. За это время накопилось больше 6 000 коммитов.
        Разработка ведётся публично:{' '}
        <a href="https://t.me/kirill_baranov_official" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-kb-text">
          backstage в Telegram
        </a>
        , открытый GitHub, никакого корпоративного фасада.
        Главное: я сам работаю на KB Labs от и до — это не эксперимент, а основной инструмент.
      </>
    ),
  },
];

