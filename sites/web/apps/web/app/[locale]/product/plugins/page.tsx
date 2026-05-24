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
  PluginLifecycleDiagram,
  PluginSurfaceDiagram,
  Section,
  SectionHeader,
  StatCard,
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
    title: 'Plugin System — KB Labs',
    description: 'Устанавливаешь один пакет — получаешь CLI, REST API и Studio сразу. Открытый SDK для своих плагинов.',
    path: '/product/plugins',
  });
}

const MANIFEST_CODE = `\
import { combinePermissions, kbPlatformPreset } from '@kb-labs/sdk';

export default {
  schema:      'kb.plugin/3',
  id:          '@kb-labs/review',
  version:     '2.94.0',
  permissions: combinePermissions()
    .with(kbPlatformPreset)
    .allow('git.read')     // can read git history
    .allow('llm.call')     // can call LLM
    .deny('fs.write')      // no filesystem writes
    .deny('shell.exec')    // no shell access
    .build(),
  cli: {
    commands: [
      { id: 'review',    handler: './commands/run.js#default' },
      { id: 'review:ci', handler: './commands/ci.js#default'  },
    ],
  },
} as const;`;

const SCAFFOLD_CODE = `\
# 1. scaffold
kb scaffold run plugin my-plugin

# 2. build
pnpm build

# 3. publish to KB Labs Registry
kb marketplace publish

# --- anyone can now install ---
kb marketplace install @you/my-plugin

# or share privately
kb marketplace share --with user123
kb marketplace share --link`;

// Real snippet from plugins/clickup/entry/src/commands/task-create.ts
const HANDLER_CODE = `\
import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, createTask } from '@kb-labs/clickup-core';

export default defineCommand({
  id: 'clickup:task.create',

  handler: {
    // intent() — declare what the plugin will do before it does it
    async intent(_ctx, input: CLIInput<TaskCreateFlags>) {
      const { list, name } = input.flags;
      return {
        summary: \`Create task "\${name}" in list \${list}\`,
        operations: [{ type: 'create', resource: 'task' }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<TaskCreateFlags>) {
      const { list, name, desc, status, json } = input.flags;

      // business logic — the only thing the plugin author writes
      const task = await createTask(requireApiKey(), list, {
        name,
        markdown_content: desc,
        status,
      });

      // ctx.ui — same code, different surface: CLI, REST, Studio
      if (json) {
        ctx.ui.json({ id: task.id, name: task.name, url: task.url });
      } else {
        ctx.ui.success('Task created', {
          sections: [{ items: [\`id: \${task.id}\`, \`url: \${task.url}\`] }],
        });
      }

      return { exitCode: 0, result: task };
    },
  },
});`;


export default async function PluginsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ──────────────────────────────────────────────── */}
        <div className="relative overflow-hidden bg-surface pb-16 pt-24">
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[640px] -translate-x-1/2 rounded-full bg-accent/[0.06] blur-[100px]" />
          <DotPattern className="opacity-[0.30]" />
          <Container>
            <div className="relative z-10 grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">

              {/* Left: text */}
              <div>
                <Eyebrow className="mb-5">Plugin System</Eyebrow>
                <h1 className="mb-5 text-[clamp(2rem,4.5vw,3.2rem)] font-bold leading-[1.08] tracking-tight text-kb-text">
                  <GradientText shimmer>Плагин — это unit</GradientText>
                  <span className="block">платформы</span>
                </h1>
                <p className="mb-8 max-w-[48ch] text-[1.05rem] leading-[1.75] text-muted">
                  Устанавливаешь один пакет — движок регистрирует CLI команды, REST роуты
                  и страницу в Studio. Без ручных конфигов. Права объявлены в манифесте —
                  видишь до установки.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary" size="lg" href={`/${locale}/install`}>
                    Установить KB Labs
                  </Button>
                  <Button variant="secondary" size="lg" href="https://docs.kblabs.ru/plugins" target="_blank" rel="noopener noreferrer">
                    Документация
                  </Button>
                </div>
              </div>

              {/* Right: install terminal */}
              <div className="w-full overflow-hidden rounded-2xl border border-line shadow-lg">
                <div className="flex items-center gap-1.5 border-b border-line px-4 py-3" style={{ background: '#0f1117' }}>
                  <span className="h-3 w-3 rounded-full bg-red-500/70" />
                  <span className="h-3 w-3 rounded-full bg-amber-500/70" />
                  <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
                  <span className="ml-2 font-mono text-[0.65rem] text-white/25">terminal</span>
                </div>
                <div className="space-y-4 p-5 font-mono text-[0.78rem] leading-[1.7]" style={{ background: '#0f1117', color: '#e2e6f0' }}>
                  <div>
                    <span className="text-emerald-400/80">$ </span>
                    <span className="text-white/90">kb marketplace install @kb-labs/review-entry</span>
                  </div>
                  <div className="space-y-0.5 text-white/50">
                    <div>  Resolving @kb-labs/review-entry@2.94.0</div>
                    <div>  Installing via pnpm ...</div>
                  </div>
                  <div className="space-y-1.5">
                    <div>
                      <span className="text-emerald-400">✓ </span>
                      <span className="text-white/80">CLI commands registered</span>
                    </div>
                    <div className="pl-4 text-white/40">kb review&nbsp;&nbsp;&nbsp;&nbsp;kb review run&nbsp;&nbsp;&nbsp;&nbsp;kb review:ci</div>
                    <div>
                      <span className="text-emerald-400">✓ </span>
                      <span className="text-white/80">REST routes mounted</span>
                    </div>
                    <div className="pl-4 text-white/40">POST /api/review&nbsp;&nbsp;&nbsp;&nbsp;GET /api/review/runs</div>
                    <div>
                      <span className="text-emerald-400">✓ </span>
                      <span className="text-white/80">Studio page ready</span>
                    </div>
                    <div className="pl-4 text-white/40">/p/review</div>
                  </div>
                </div>
              </div>

            </div>
          </Container>
        </div>

        {/* ── Stats ─────────────────────────────────────────────── */}
        <Section className="border-y border-line bg-bg py-10">
          <Container>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              {[
                { value: '10+',   label: 'плагинов в экосистеме' },
                { value: '3',     label: 'поверхности из одного манифеста' },
                { value: '1',     label: 'команда для установки' },
                { value: 'OSS',   label: 'открытый SDK и Registry' },
              ].map((s) => (
                <AnimateOnScroll key={s.label} animation="slide-up">
                  <StatCard value={s.value} label={s.label} />
                </AnimateOnScroll>
              ))}
            </div>
          </Container>
        </Section>

        {/* ── Platform abstractions ─────────────────────────────── */}
        <Section>
          <Container>
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start">

              {/* Left: code (height-capped, scrollable) */}
              <AnimateOnScroll animation="slide-up">
                <div className="overflow-auto rounded-2xl" style={{ maxHeight: 480 }}>
                  <CodeBlock
                    code={HANDLER_CODE}
                    language="typescript"
                    filename="task-create.ts"
                    bare
                  />
                </div>
              </AnimateOnScroll>

              {/* Right: text */}
              <AnimateOnScroll animation="slide-up" delay={100}>
                <SectionHeader
                  eyebrow="SDK"
                  title="Только бизнес-логика"
                />
                <div className="mb-8 space-y-4 text-[1rem] leading-[1.75] text-muted">
                  <p>
                    Плагин общается с абстракциями —{' '}
                    <code className="rounded bg-line/40 px-1 font-mono text-sm">ctx.ui</code>,{' '}
                    <code className="rounded bg-line/40 px-1 font-mono text-sm">useLLM()</code>,{' '}
                    <code className="rounded bg-line/40 px-1 font-mono text-sm">requireApiKey()</code>.
                    Какой провайдер стоит за ними, как роутится запрос, куда идут логи — всё это платформа.
                  </p>
                  <p>
                    <code className="rounded bg-line/40 px-1 font-mono text-sm">ctx.ui.success()</code> работает
                    одинаково из CLI, REST вызова и Studio. Один код — три поверхности.
                  </p>
                </div>
                <Button variant="secondary" size="md" href="https://docs.kblabs.ru/plugins" target="_blank" rel="noopener noreferrer">
                  SDK документация
                  <ExternalLink className="size-4" />
                </Button>
              </AnimateOnScroll>

            </div>
          </Container>
        </Section>

        {/* ── One manifest — three surfaces ─────────────────────── */}
        <Section className="bg-bg">
          <Container>
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">

              {/* Left: diagram */}
              <AnimateOnScroll animation="slide-up">
                <PluginSurfaceDiagram className="w-full max-w-[420px] mx-auto lg:mx-0" />
              </AnimateOnScroll>

              {/* Right: text */}
              <AnimateOnScroll animation="slide-up" delay={120}>
                <SectionHeader
                  eyebrow="Как это работает"
                  title="Один манифест — три поверхности"
                />
                <div className="space-y-4 text-[1rem] leading-[1.75] text-muted">
                  <p>
                    Плагин объявляет CLI команды, REST роуты и Studio страницу в одном файле —
                    <code className="mx-1 rounded bg-line/40 px-1 font-mono text-sm">manifest.ts</code>.
                    При установке движок регистрирует всё автоматически.
                  </p>
                  <p>
                    Не нужно настраивать роутер, регистрировать команды или писать
                    конфиг Studio. Поставил пакет — всё работает.
                  </p>
                  <p>
                    Плагины изолированы: каждый получает только те ресурсы платформы,
                    которые объявил. Полная OS-изоляция — с container/remote режимом исполнения.
                  </p>
                </div>
              </AnimateOnScroll>

            </div>
          </Container>
        </Section>

        {/* ── Lifecycle ─────────────────────────────────────────── */}
        <Section>
          <Container>
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start">

              {/* Left: text */}
              <AnimateOnScroll animation="slide-up">
                <SectionHeader
                  eyebrow="Как работает"
                  title="Жизненный цикл плагина"
                />
                <div className="space-y-4 text-[1rem] leading-[1.75] text-muted">
                  <p>
                    После установки платформа записывает пакет в
                    <code className="mx-1 rounded bg-line/40 px-1 font-mono text-sm">.kb/marketplace.lock</code>
                    с SHA-256 чексуммой. При каждом старте discovery проверяет
                    целостность и загружает манифест.
                  </p>
                  <p>
                    Из манифеста извлекаются entity kinds — семь типов сущностей:
                    CLI команды, REST роуты, Studio страницы, workflow handlers,
                    webhook handlers, WebSocket каналы, cron расписания.
                    Один плагин может регистрировать любое их сочетание.
                  </p>
                  <p>
                    При вызове команды движок выбирает execution backend.
                    In-process — дефолт, минимальный overhead.
                    Subprocess и worker-pool — изоляция процесса.
                    Remote — полная OS-изоляция на отдельной машине.
                  </p>
                </div>
              </AnimateOnScroll>

              {/* Right: lifecycle diagram */}
              <AnimateOnScroll animation="slide-up" delay={100}>
                <PluginLifecycleDiagram className="w-full" />
              </AnimateOnScroll>

            </div>
          </Container>
        </Section>

        {/* ── Permissions ───────────────────────────────────────── */}
        <Section>
          <Container>
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-start">

              {/* Left: text */}
              <AnimateOnScroll animation="slide-up">
                <SectionHeader
                  eyebrow="Permissions"
                  title="Видишь права до установки"
                />
                <div className="space-y-4 text-[1rem] leading-[1.75] text-muted">
                  <p>
                    Каждый плагин декларирует в манифесте что ему нужно: читать git,
                    вызывать LLM, писать в fs. Ты видишь это ещё до
                    <code className="mx-1 rounded bg-line/40 px-1 font-mono text-sm">install</code>.
                  </p>
                  <p>
                    Это не жёсткая гарантия — при in-process исполнении платформа
                    проверяет запрошенные права, но полная OS-изоляция требует
                    container или remote режима.
                  </p>
                  <p>
                    Как permissions в мобильных приложениях: ты знаешь что плагин
                    хочет и принимаешь осознанное решение.
                  </p>
                </div>
              </AnimateOnScroll>

              {/* Right: manifest code */}
              <AnimateOnScroll animation="slide-up" delay={100}>
                <CodeBlock
                  code={MANIFEST_CODE}
                  language="typescript"
                  filename="manifest.ts"
                  bare
                />
              </AnimateOnScroll>

            </div>
          </Container>
        </Section>

        {/* ── Create & publish ──────────────────────────────────── */}
        <Section className="bg-bg">
          <Container>
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-start">

              {/* Left: code */}
              <AnimateOnScroll animation="slide-up">
                <CodeBlock
                  code={SCAFFOLD_CODE}
                  language="bash"
                  filename="terminal"
                  bare
                />
              </AnimateOnScroll>

              {/* Right: text */}
              <AnimateOnScroll animation="slide-up" delay={100}>
                <SectionHeader
                  eyebrow="Экосистема"
                  title="Создай и опубликуй свой плагин"
                />
                <div className="space-y-5">
                  {[
                    {
                      step: '01',
                      title: 'Scaffold',
                      desc: 'kb scaffold генерирует полную структуру плагина: manifest, CLI команды, REST роуты, тесты. Готово к запуску.',
                    },
                    {
                      step: '02',
                      title: 'Publish',
                      desc: 'kb marketplace publish публикует в KB Labs Registry. Не npm — собственный реестр с поддержкой приватных пакетов.',
                    },
                    {
                      step: '03',
                      title: 'Install / Share',
                      desc: 'Другие устанавливают одной командой. Или делись приватно по ссылке или с конкретным пользователем.',
                    },
                  ].map((item) => (
                    <div key={item.step} className="flex gap-4">
                      <span className="mt-0.5 flex-shrink-0 font-mono text-[0.7rem] font-bold text-accent/40">
                        {item.step}
                      </span>
                      <div>
                        <div className="text-[0.9rem] font-semibold text-kb-text">{item.title}</div>
                        <div className="text-[0.85rem] leading-[1.6] text-muted">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </AnimateOnScroll>

            </div>
          </Container>
        </Section>

        {/* ── CTA ───────────────────────────────────────────────── */}
        <Section>
          <Container>
            <AnimateOnScroll animation="slide-up">
              <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-8 py-16 text-center">
                <BorderBeam />
                <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.06] blur-[90px]" />
                <div className="relative z-10">
                  <Eyebrow className="mb-4">Попробуйте прямо сейчас</Eyebrow>
                  <h2 className="mb-4 text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold leading-tight tracking-tight text-kb-text">
                    Первый плагин — за 5 минут.
                  </h2>
                  <p className="mx-auto mb-8 max-w-[44ch] text-[1.05rem] leading-[1.7] text-muted">
                    Установите KB Labs, запустите scaffold, добавьте логику.
                    CLI, REST API и Studio готовы автоматически.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href={`/${locale}/install`}>
                      Установить
                    </Button>
                    <Button variant="secondary" size="lg" href="https://docs.kblabs.ru/plugins" target="_blank" rel="noopener noreferrer">
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
