import type { AiAssistantDataSource, ChatMessage } from '../sources/ai-assistant-source';

/* ── Utilities ── */

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let counter = 0;
function nextId(): string {
  return `msg-${++counter}-${Date.now()}`;
}

/* ── Response database ── */

interface ScriptedResponse {
  keywords: string[];
  text: { en: string; ru: string };
  links?: Array<{ title: string; href: { en: string; ru: string } }>;
}

const RESPONSES: ScriptedResponse[] = [
  {
    keywords: ['what is', 'about', 'что такое', 'о платформе', 'what does', 'overview'],
    text: {
      en: 'KB Labs is a plugin-first engineering automation platform. It replaces scattered CI scripts with a unified system: workflow engine, AI-powered code review, plugin marketplace, and CLI tooling. Self-hosted, on-prem — your code never leaves your infrastructure.',
      ru: 'KB Labs — это plugin-first платформа автоматизации разработки. Заменяет разрозненные CI-скрипты единой системой: движок воркфлоу, AI code review, маркетплейс плагинов и CLI. Self-hosted — код не покидает вашу инфраструктуру.',
    },
    links: [
      { title: 'Product Overview', href: { en: '/en/product', ru: '/ru/product' } },
      { title: 'Documentation', href: { en: '/en/docs', ru: '/ru/docs' } },
    ],
  },
  {
    keywords: ['workflow', 'pipeline', 'воркфлоу', 'пайплайн', 'orchestrat', 'оркестр'],
    text: {
      en: 'The Workflow Engine lets you define pipelines as YAML — from simple dev-cycles to enterprise compliance flows. Three primitives (shell, gate, approval) compose into any automation. Built-in rework loops, human approval gates, and parallel execution.',
      ru: 'Движок воркфлоу позволяет определять пайплайны в YAML — от простых dev-cycle до enterprise compliance. Три примитива (shell, gate, approval) компонуются в любую автоматизацию. Встроенные циклы доработки, gates для согласований и параллельное выполнение.',
    },
    links: [
      { title: 'Workflow Engine', href: { en: '/en/product/workflows', ru: '/ru/product/workflows' } },
      { title: 'Interactive Demo', href: { en: '/en/demo', ru: '/ru/demo' } },
    ],
  },
  {
    keywords: ['plugin', 'плагин', 'extend', 'расшир', 'marketplace', 'маркетплейс'],
    text: {
      en: 'The plugin system uses a declarative manifest approach — plugins can only do what they explicitly declare. This gives you extensibility without losing control. Browse official and community plugins in the Marketplace.',
      ru: 'Система плагинов использует декларативный манифест — плагин может делать только то, что явно задекларировал. Расширяемость без потери контроля. Официальные и community плагины — в Маркетплейсе.',
    },
    links: [
      { title: 'Plugin System', href: { en: '/en/product/plugins', ru: '/ru/product/plugins' } },
      { title: 'Marketplace', href: { en: '/en/marketplace', ru: '/ru/marketplace' } },
    ],
  },
  {
    keywords: ['install', 'setup', 'start', 'getting started', 'установ', 'начать', 'настро'],
    text: {
      en: 'Installation is one command: `curl -fsSL https://kblabs.ru/install.sh | sh`. This installs the CLI, sets up the local environment, and gets you running in under 2 minutes. Works on macOS, Linux, and WSL.',
      ru: 'Установка одной командой: `curl -fsSL https://kblabs.ru/install.sh | sh`. Устанавливает CLI, настраивает локальное окружение — всё за 2 минуты. Работает на macOS, Linux и WSL.',
    },
    links: [
      { title: 'Install', href: { en: '/en/install', ru: '/ru/install' } },
    ],
  },
  {
    keywords: ['pricing', 'price', 'cost', 'plan', 'free', 'цен', 'тариф', 'стоим', 'бесплат'],
    text: {
      en: 'KB Labs is free for individual developers and small teams. Pro and Enterprise tiers add team features, priority support, and compliance tooling. All tiers are self-hosted — no data leaves your infrastructure.',
      ru: 'KB Labs бесплатен для индивидуальных разработчиков и небольших команд. Pro и Enterprise добавляют командные фичи, приоритетную поддержку и compliance. Все тарифы — self-hosted, данные не покидают инфраструктуру.',
    },
    links: [
      { title: 'Pricing', href: { en: '/en/pricing', ru: '/ru/pricing' } },
      { title: 'Enterprise', href: { en: '/en/enterprise', ru: '/ru/enterprise' } },
    ],
  },
  {
    keywords: ['cli', 'sdk', 'api', 'command', 'rest', 'команд'],
    text: {
      en: 'KB Labs provides a full-featured CLI (`kb`), a TypeScript SDK for custom integrations, and a REST API with OpenAPI docs. The CLI discovers plugins automatically and supports 100+ commands across all platform features.',
      ru: 'KB Labs предоставляет полнофункциональный CLI (`kb`), TypeScript SDK для кастомных интеграций и REST API с OpenAPI документацией. CLI автоматически обнаруживает плагины и поддерживает 100+ команд.',
    },
    links: [
      { title: 'CLI Reference', href: { en: '/en/docs', ru: '/ru/docs' } },
      { title: 'REST API', href: { en: '/en/docs', ru: '/ru/docs' } },
    ],
  },
  {
    keywords: ['security', 'безопас', 'self-hosted', 'on-prem', 'data', 'privacy', 'конфиденц'],
    text: {
      en: 'KB Labs is fully self-hosted. Your code, secrets, and telemetry never leave your infrastructure. The plugin sandbox enforces declared permissions. SOC2-ready architecture with audit logging.',
      ru: 'KB Labs полностью self-hosted. Код, секреты и телеметрия не покидают вашу инфраструктуру. Песочница плагинов контролирует задекларированные разрешения. SOC2-ready архитектура с аудит-логами.',
    },
    links: [
      { title: 'Security', href: { en: '/en/security', ru: '/ru/security' } },
    ],
  },
  {
    keywords: ['compare', 'vs', 'alternative', 'differ', 'сравн', 'альтернатив', 'отлич'],
    text: {
      en: 'Unlike GitHub Actions or Jenkins, KB Labs is a platform — not just a CI runner. It combines workflow orchestration, AI code review, plugin marketplace, and CLI tooling in one self-hosted package. Think of it as Backstage + CI + AI review in one.',
      ru: 'В отличие от GitHub Actions или Jenkins, KB Labs — платформа, а не просто CI-раннер. Объединяет оркестрацию воркфлоу, AI code review, маркетплейс плагинов и CLI в одном self-hosted решении. Как Backstage + CI + AI review в одном.',
    },
    links: [
      { title: 'Compare', href: { en: '/en/compare', ru: '/ru/compare' } },
    ],
  },
  {
    keywords: ['contact', 'support', 'help', 'demo', 'связ', 'поддержк', 'помощ'],
    text: {
      en: 'You can reach us for a live demo, architecture consultation, or enterprise inquiry. We also have community support via GitHub Discussions.',
      ru: 'Свяжитесь с нами для демо, архитектурной консультации или enterprise-запроса. Также доступна community поддержка через GitHub Discussions.',
    },
    links: [
      { title: 'Contact', href: { en: '/en/contact', ru: '/ru/contact' } },
    ],
  },
  {
    keywords: ['who', 'for whom', 'target', 'audience', 'для кого', 'кому', 'целев'],
    text: {
      en: 'KB Labs is built for engineering teams of 5-200+ developers. Heads of Engineering get a unified automation surface. Dev teams accelerate delivery with ready workflows. Platform engineers extend via plugins with full control.',
      ru: 'KB Labs для инженерных команд от 5 до 200+ разработчиков. Head of Engineering получает единый контур автоматизации. Команды ускоряют поставку через готовые воркфлоу. Платформенные инженеры расширяют через плагины с полным контролем.',
    },
    links: [
      { title: 'Use Cases', href: { en: '/en/use-cases', ru: '/ru/use-cases' } },
    ],
  },
];

const FALLBACK: ScriptedResponse = {
  keywords: [],
  text: {
    en: "I can help you learn about KB Labs. Try asking about:\n- What KB Labs is and who it's for\n- How workflows and pipelines work\n- Plugin system and marketplace\n- Pricing and installation\n- Security and self-hosting",
    ru: 'Я могу помочь узнать больше о KB Labs. Попробуйте спросить:\n- Что такое KB Labs и для кого\n- Как работают воркфлоу и пайплайны\n- Система плагинов и маркетплейс\n- Цены и установка\n- Безопасность и self-hosting',
  },
  links: [
    { title: 'Product', href: { en: '/en/product', ru: '/ru/product' } },
    { title: 'Pricing', href: { en: '/en/pricing', ru: '/ru/pricing' } },
    { title: 'Docs', href: { en: '/en/docs', ru: '/ru/docs' } },
  ],
};

const SUGGESTED: Record<string, string[]> = {
  en: [
    'What is KB Labs?',
    'How do workflows work?',
    'How to install?',
    'What pricing plans exist?',
  ],
  ru: [
    'Что такое KB Labs?',
    'Как работают воркфлоу?',
    'Как установить?',
    'Какие тарифы доступны?',
  ],
};

/* ── Implementation ── */

function findResponse(message: string, locale: string): ChatMessage {
  const lower = message.toLowerCase();
  const match = RESPONSES.find((r) => r.keywords.some((kw) => lower.includes(kw)));
  const resp = match || FALLBACK;
  const loc = locale === 'ru' ? 'ru' : 'en';

  return {
    id: nextId(),
    role: 'assistant',
    text: resp.text[loc],
    links: resp.links?.map((l) => ({ title: l.title, href: l.href[loc] })),
  };
}

export class MockAiAssistantSource implements AiAssistantDataSource {
  async sendMessage(message: string, locale: string, _history: ChatMessage[]): Promise<ChatMessage> {
    await delay(800 + Math.random() * 400);
    return findResponse(message, locale);
  }

  getSuggestedQuestions(locale: string): string[] {
    return SUGGESTED[locale] || SUGGESTED.en;
  }
}
