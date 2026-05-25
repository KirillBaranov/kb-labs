# KB Labs — Site Redesign Map

> **Status:** Working document. Updated as pages are redesigned.
> **Linked epic:** [869dduutm](https://app.clickup.com/t/869dduutm)
> **Positioning:** See section below — replaces `positioning.md` v3.5 for site purposes.

---

## Positioning

### Что такое KB Labs (одна строка)

> Движок для автоматизации dev-рутины с контролируемым запуском агентов.

### Два главных хука

| Хук | Боль | Ответ |
|-----|------|-------|
| **Workflow** | Вечно собираете сценарии на bash и надежде? | Движок с условиями, петлями и обратной связью. Агент — просто шаг. |
| **Agents** | Хочешь дать агенту доступ — но не знаешь что он натворит? | Агент работает только через плагин. Изоляция + логи из коробки. |

Gateway — не хук, живёт в `/product` для тех кто дошёл глубже.

### Правила для всех страниц

1. Сразу понятно что это — не нужно читать три абзаца
2. Пишем для разработчика. Никакого "для руководства" / "enterprise-grade"
3. Показываем код — не скриншоты, не иллюстрации
4. Честно про стадию: private beta, автор читает каждый issue
5. Только реальные интеграции — те что есть в репо
6. Один CTA на секцию, не три
7. Основатель виден: имя и голос на Home и /about

---

## Home page structure (`/`)

> ClickUp: [869dduuu4](https://app.clickup.com/t/869dduuu4) · Status: ⬜ To do

```
1. Nav
   KB Labs logo | Product · Install · Pricing · Blog | [GitHub] [Install →]

2. Hero
   Заголовок:  "Автоматизация dev-рутины. Агенты под твоим контролем."
   Подзаголовок: KB Labs — open-source движок для dev-команд.
                 Пишешь workflow в коде. Агент делает шаг. Ты видишь каждое действие.
   CTA:        [Install]  [GitHub ↗]
   Visual:     TerminalBlock или CodeBlock
   Components: GradientOrbs, AnimateOnScroll, Button, TerminalBlock

3. Блок A — Workflow
   Боль:    "Устал от сценариев на bash и надежде?"
   Ответ:   Не DAG. Движок смотрит на результат шага и решает что дальше.
   Visual:  CodeBlock — YAML с условиями и петлями
   CTA:     → Читать про Workflows (/product#workflows)
   Components: Section, FeatureCard или BentoCard, CodeBlock

4. Блок B — Agents
   Боль:    "Хочешь дать агенту доступ — но не знаешь что он натворит?"
   Ответ:   Агент работает только через плагин. Изоляция. Логи и аналитика из коробки.
   Visual:  TerminalBlock — вывод с логами агента
   CTA:     → Читать про агентов (/product#agents)
   Components: Section, FeatureCard или BentoCard, TerminalBlock

5. Интеграции — "Встаёт в твой стек"
   LLM:      OpenAI · Voyage AI
   Database: Redis · MongoDB · SQLite · Qdrant
   Storage:  S3 · Local FS
   Tools:    ClickUp · GitHub · Telegram · Docker
   Подпись:  "Нет нужного? Напиши свой адаптер — тот же контракт, та же загрузка."
   Components: LogoGrid

6. Как это работает — 3 шага
   1. Пишешь workflow     → YAML файл, шаги, условия
   2. Подключаешь плагин  → даёшь агенту только нужный доступ
   3. Запускаешь          → движок исполняет, ты видишь всё
   Components: StepCard × 3

7. Честный сигнал доверия
   "Open source. Используется в production самим автором."
   "ADR-ы публичны. Каждый issue читает основатель."
   GitHub stars · Последний коммит · Кол-во адаптеров
   Без фейковых логотипов. Без "trusted by".
   Components: StatCard × 3

8. Founder moment
   "Я построил KB Labs потому что устал быть арендатором в собственном стеке."
   — Kirill Baranov → k-baranov.ru
   (italic, одна строка, тихо)

9. Final CTA
   "Готов попробовать?"
   [Install KB Labs]  [Посмотреть на GitHub]
   Components: Section, Button × 2

10. Footer
    Platform:   Product · Install · Changelog · Roadmap
    Company:    About · Blog · Contact · Security · Legal
    Community:  GitHub · Discord · Twitter/X
    Connect:    k-baranov.ru
    [тихо]:     /enterprise
```

---

## Page inventory

Legend: `✅ Done` · `🚧 In progress` · `⬜ To do` · `🗑 Delete/merge`

### Core pages

| Page | ClickUp | Status | Note |
|------|---------|--------|------|
| `/` (Home) | [869dduuu4](https://app.clickup.com/t/869dduuu4) | ⬜ | Highest priority. Hero = Workflows pain. Layer 2 = two equal sections. |
| `/pricing` | [869dduuu6](https://app.clickup.com/t/869dduuu6) | ⬜ | OSS dominant visually. Team + Enterprise = roadmap, low-key. |
| `/install` | [869dduuuh](https://app.clickup.com/t/869dduuuh) | ⬜ | Practical. Code-first. No marketing fluff. |
| `/about` | [869dduuuk](https://app.clickup.com/t/869dduuuk) | ⬜ | Founder block at top. Manifesto. Links to k-baranov.ru. |
| `/contact` | [869dduuup](https://app.clickup.com/t/869dduuup) | ⬜ | Simple. Honest. No fake "sales team". |
| `/enterprise` | [869dduuuu](https://app.clickup.com/t/869dduuuu) | ⬜ | Soften. Removed from top nav. Keep in pricing CTA + footer. Back door only. |
| `/security` | [869dduuv6](https://app.clickup.com/t/869dduuv6) | ⬜ | Honest, no fake certs. |
| `/legal` | [869dduuv2](https://app.clickup.com/t/869dduuv2) | ⬜ | Clean docs page. No design heavy. |
| `/roadmap` | [869dduuv1](https://app.clickup.com/t/869dduuv1) | ⬜ | Public roadmap. Honest about stage: private beta. |
| `/signup` + `/demo` | [869dduuvb](https://app.clickup.com/t/869dduuvb) | ⬜ | Simple conversion pages. |

### Content pages

| Page | ClickUp | Status | Note |
|------|---------|--------|------|
| `/blog` | [869dduuub](https://app.clickup.com/t/869dduuub) | ⬜ | Index. Technical depth signal. |
| `/blog/[slug]` | [869dduuud](https://app.clickup.com/t/869dduuud) | ⬜ | Article page. Founder byline. Prose component. |
| `/changelog` | [869dduuug](https://app.clickup.com/t/869dduuug) | ⬜ | ChangelogEntry component. OSS transparency signal. |

### Product pages (Layer 3)

| Page | ClickUp | Status | Note |
|------|---------|--------|------|
| `/product` | [869dduuuz](https://app.clickup.com/t/869dduuuz) | ⬜ | Workflows + Gateway as co-equal sections. Adapter layer as foundation. |
| `/kb-dev` | [869dduuuz](https://app.clickup.com/t/869dduuuz) | ⬜ | Subpage or section inside /product |
| `/kb-devkit` | [869dduuuz](https://app.clickup.com/t/869dduuuz) | ⬜ | Subpage or section inside /product |
| `/kb-deploy` | [869dduuuz](https://app.clickup.com/t/869dduuuz) | ⬜ | Subpage or section inside /product |
| `/kb-monitor` | [869dduuuz](https://app.clickup.com/t/869dduuuz) | ⬜ | Subpage or section inside /product |

### Discovery / comparison pages

| Page | ClickUp | Status | Note |
|------|---------|--------|------|
| `/solutions` | [869dduuux](https://app.clickup.com/t/869dduuux) | ⬜ | — |
| `/use-cases` | [869dduuux](https://app.clickup.com/t/869dduuux) | ⬜ | — |
| `/compare` | [869dduuuv](https://app.clickup.com/t/869dduuuv) | ⬜ | Honest comparison table. No fake strengths. |
| `/marketplace` | — | ⬜ | Not in epic yet. Decide: keep or merge into /product. |

### Current /solutions sub-pages — needs decision

These exist in code but are NOT in the epic. Need to decide: merge into `/product` or keep as sub-pages.

| Sub-page | Keep / Merge / Delete |
|----------|-----------------------|
| `/solutions/code-intelligence` | 🗑 Merge into `/product` |
| `/solutions/code-quality` | 🗑 Merge into `/product` |
| `/solutions/gateway` | 🗑 Merge into `/product#gateway` |
| `/solutions/monorepo-ops` | 🗑 Merge into `/product` |
| `/solutions/observability` | 🗑 Merge into `/product` |
| `/solutions/platform-api` | 🗑 Merge into `/product` |
| `/solutions/release-automation` | 🗑 Merge into `/product#workflows` |

Current `/product` sub-pages in code (same decision needed):

| Sub-page | Keep / Merge |
|----------|-------------|
| `/product/workflows` | Merge into `/product#workflows` anchor |
| `/product/plugins` | Merge into `/product` section |
| `/product/state-broker` | Merge into `/product` section |
| `/product/studio` | Merge into `/product` section |

---

## Nav structure (proposed)

```
Top nav:
  Product    /product
  Install    /install
  Pricing    /pricing
  Blog       /blog
  Roadmap    /roadmap
  GitHub     (external)
  [Install CTA button]

Footer:
  Platform:   /product · /install · /changelog · /roadmap
  Company:    /about · /blog · /contact · /security · /legal
  Community:  GitHub · Discord/Telegram · Twitter/X
  Connect:    k-baranov.ru (founder)
  [quiet]     /enterprise (back door from /pricing and here)
```

---

## Component kit available (packages/site-ui)

```
Layout:   Section, Container, SectionHeader, AnnouncementBar, CookieBanner
Cards:    FeatureCard, StepCard, BentoCard, GlowCard, PricingCard, StatCard,
          BlogCard, TestimonialCard, ChangelogEntry
Data:     ComparisonTable, LogoGrid, GridSection
UI:       Button, Badge, Input, Select, Textarea, FormField, Alert, Dialog,
          Toast, Tabs, Accordion, Tooltip, Skeleton
Code:     CodeBlock, TerminalBlock, MockupFrame
Effects:  AnimateOnScroll, BorderBeam, DotPattern, GradientOrbs, GradientText
Content:  Prose
```

### Technical rules for all pages

- Semantic tokens only: `bg-surface`, `text-muted`, `border-line` — never `bg-[#hex]`
- `preflight: false` — reset defaults manually (`m-0`, `list-none`, `p-0`)
- Animations via `AnimateOnScroll` — not inline styles
- Build in `/[locale]/v2/[page]` → remove prefix after review

---

## Work order (recommended)

Start with pages that set the tone and are referenced by everything else:

```
1. / (Home)         — sets hero, Layer 2 hooks, founder moment
2. /product         — co-equal pillars, adapter layer story
3. /pricing         — honest tier structure
4. /install         — conversion page, code-first
5. /about           — founder intro, manifesto
6. /compare         — honest competitive frame
7. /blog + /changelog — content infrastructure
8. /solutions/* → merge into /product (delete old sub-pages)
9. /roadmap, /contact, /security, /legal, /enterprise
10. /use-cases, /signup, /demo, /marketplace
```

---

## Open questions (decide before building)

1. **`/solutions/*` sub-pages** — merge into `/product` sections or keep as standalone? (Recommendation: merge per positioning §13#6)
2. **`/marketplace`** — in the epic or not? Prominence: Layer 2 vs Layer 3?
3. **`/product` sub-pages** (`/workflows`, `/plugins`, etc.) — anchor links on `/product` or separate URLs?
4. **Pricing page shape** — three tiers visible (Team + Enterprise as roadmap) or one OSS tier with roadmap mentioned quietly?
5. **`/blog`** — any existing content to port, or start fresh?
