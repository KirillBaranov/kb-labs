import {
  Accordion,
  Alert,
  AnnouncementBar,
  AnimateOnScroll,
  Badge,
  BentoCard,
  BentoGrid,
  BlogCard,
  BorderBeam,
  Button,
  ChangelogEntry,
  CodeBlock,
  ComparisonTable,
  Container,
  DotPattern,
  Eyebrow,
  FeatureCard,
  FormField,
  GradientOrbs,
  GradientText,
  GridPattern,
  GridSection,
  Input,
  LogoGrid,
  MockupFrame,
  PricingCard,
  Prose,
  Section,
  SectionHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  SkeletonCard,
  SkeletonText,
  StatCard,
  StepCard,
  Tabs,
  TerminalBlock,
  TestimonialCard,
  Textarea,
  ThemeToggle,
  Tooltip,
} from '@kb-labs/web-site-ui';
import { ShowcaseDialogToast } from './ShowcaseDialogToast';
import {
  ArrowRight,
  BookOpen,
  Code2,
  GitBranch,
  Globe,
  Package,
  Plug,
  Settings2,
  Shield,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-react';

const INSTALL_CODE = `# Install KB Labs
curl -fsSL https://get.kblabs.dev | bash

# Start all services
kb-dev start

# Install a plugin
kb marketplace install @kb-labs/workflow`;

const SDK_CODE = `import { createPlugin } from '@kb-labs/sdk';

export default createPlugin({
  id: 'my-plugin',
  name: 'My Plugin',
  async setup(platform) {
    platform.cli.register({
      name: 'hello',
      handler: async () => {
        platform.logger.info('Hello from my plugin!');
      },
    });
  },
});`;

const LOGOS = [
  { name: 'TypeScript' },
  { name: 'Node.js' },
  { name: 'Next.js' },
  { name: 'Docker' },
  { name: 'OpenAI' },
  { name: 'Redis' },
  { name: 'MongoDB' },
  { name: 'Qdrant' },
];

const FAQ = [
  {
    id: '1',
    question: 'Is KB Labs really free?',
    answer: 'Yes. KB Labs is MIT licensed — use it in any project, commercial or personal, with no usage caps or per-seat pricing.',
  },
  {
    id: '2',
    question: 'Do I need Docker to run it?',
    answer: 'No. KB Labs runs as native Node.js processes managed by kb-dev. Docker is optional if you want containerised deployments.',
  },
  {
    id: '3',
    question: 'How do plugins work?',
    answer: 'Plugins are TypeScript packages that follow duck-typing conventions. If a package exports a manifest and registers commands — it\'s a plugin. No class inheritance or decorators required.',
  },
  {
    id: '4',
    question: 'Can I use my existing LLM provider?',
    answer: 'Yes. The AI Gateway supports OpenAI, Anthropic, and any OpenAI-compatible endpoint. Swap providers without changing application code.',
  },
];

const PRICING_TIERS = [
  {
    name: 'Hobby',
    price: 'Free',
    note: 'Forever. No credit card required.',
    features: ['Up to 3 plugins', 'Community support', 'Local deployment', 'MIT licensed'],
  },
  {
    name: 'Pro',
    price: '$29',
    note: 'per month, billed annually',
    badge: 'Most popular',
    features: ['Unlimited plugins', 'Priority support', 'Team workspaces', 'AI Gateway included', 'SSO & RBAC'],
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    note: 'Contact us for pricing',
    features: ['Everything in Pro', 'Dedicated support', 'SLA guarantee', 'Custom integrations', 'On-prem deployment'],
  },
];

const COMPARISON_CATEGORIES = [
  {
    label: 'Core',
    rows: [
      { feature: 'Plugins', values: ['3', 'Unlimited', 'Unlimited'] },
      { feature: 'Workflow engine', values: [true, true, true] },
      { feature: 'AI Gateway', values: [false, true, true] },
      { feature: 'CLI tooling', values: [true, true, true] },
    ],
  },
  {
    label: 'Team',
    rows: [
      { feature: 'Team workspaces', values: [false, true, true] },
      { feature: 'SSO / RBAC', values: [false, true, true] },
      { feature: 'Audit logs', values: [false, false, true] },
    ],
  },
];

export default function V2DemoPage() {
  return (
    <div className="bg-bg min-h-screen">
      <AnnouncementBar
        message="KB Labs v1.0 is now available."
        href="/changelog"
        linkLabel="See what's new"
        storageKey="v1-announcement"
      />

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-line bg-surface">
        <GradientOrbs variant="hero" />
        <DotPattern className="text-line/60 opacity-60" />
        <Container>
          <div className="relative z-10 flex flex-col items-center gap-5 py-[clamp(4rem,8vw,7rem)] text-center">
            <div className="flex items-center gap-3">
              <Eyebrow>Open-source · Self-hosted</Eyebrow>
              <ThemeToggle />
            </div>
            <h1 className="max-w-[16ch] text-[clamp(2rem,4.5vw,3.2rem)] font-bold leading-[1.1] tracking-tight">
              <GradientText shimmer>AI infrastructure</GradientText>
              <span className="block text-kb-text"> for developers who ship</span>
            </h1>
            <p className="max-w-[56ch] text-[1.05rem] leading-[1.75] text-muted">
              KB Labs is a self-hosted control plane for AI workflows, gateway routing, and
              plugin-driven automation — all running on your own infrastructure.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-1">
              <Button variant="primary" size="lg" href="/install">
                <Terminal size={16} />
                Install KB Labs
              </Button>
              <Button variant="secondary" size="lg" href="/docs">
                <BookOpen size={16} />
                Read the docs
              </Button>
            </div>
            <p className="text-[0.82rem] text-muted/70">
              MIT License · No vendor lock-in · Self-hosted
            </p>
          </div>
        </Container>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────── */}
      <Section>
        <Container>
          <AnimateOnScroll animation="slide-up">
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              <StatCard value="10k+" label="Developers" description="Using KB Labs worldwide" />
              <StatCard value={48} label="Plugins" description="In the marketplace" trend={{ value: '+12 this month', up: true }} />
              <StatCard value={99} label="Uptime %" description="30-day average" />
              <StatCard value="MIT" label="License" description="Free forever, no exceptions" />
            </div>
          </AnimateOnScroll>
        </Container>
      </Section>

      {/* ── Terminal + Code ───────────────────────────────────────── */}
      <Section>
        <Container>
          <SectionHeader
            eyebrow="Get started"
            title="From zero to running in minutes"
            subtitle="One install script. No Docker required."
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AnimateOnScroll animation="slide-left" delay={0}>
              <MockupFrame type="terminal" title="Install KB Labs">
                <TerminalBlock
                  commands={[
                    'curl -fsSL https://get.kblabs.dev | bash',
                    'kb-dev start',
                    'kb marketplace install @kb-labs/workflow',
                    'kb workflow run my-pipeline',
                  ]}
                  loop
                  bare
                />
              </MockupFrame>
            </AnimateOnScroll>
            <AnimateOnScroll animation="slide-up" delay={100}>
              <CodeBlock
                code={SDK_CODE}
                language="typescript"
                filename="my-plugin/index.ts"
              />
            </AnimateOnScroll>
          </div>
        </Container>
      </Section>

      {/* ── Bento features ────────────────────────────────────────── */}
      <Section>
        <Container>
          <SectionHeader
            eyebrow="Platform"
            title="Everything on one control plane"
            subtitle="Workflow engine, AI gateway, plugin marketplace — all extensible."
          />
          <BentoGrid>
            <BentoCard
              span={2}
              title="Workflow Engine"
              description="Define multi-step AI pipelines in YAML or TypeScript. Real-time SSE output, retry logic, and branching built-in."
              icon={<Workflow size={20} className="text-accent" />}
            />
            <BentoCard
              title="AI Gateway"
              description="Route LLM traffic, enforce rate limits, track costs."
              icon={<Globe size={20} className="text-accent" />}
            />
            <BentoCard
              title="Plugin SDK"
              description="TypeScript SDK with governed adapters and lifecycle hooks."
              icon={<Plug size={20} className="text-accent" />}
            />
            <BentoCard
              span={2}
              title="Plugin Marketplace"
              description="Install community plugins instantly. Duck-typed, zero-config discovery — if it has a manifest, it's a plugin."
              icon={<Package size={20} className="text-accent" />}
            />
          </BentoGrid>
        </Container>
      </Section>

      {/* ── How it works ──────────────────────────────────────────── */}
      <Section>
        <Container>
          <SectionHeader
            eyebrow="How it works"
            title="Three steps to production"
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { num: 1, title: 'Install the platform', description: 'Run the install script. kb-dev, kb-devkit, and the gateway are set up automatically.' },
              { num: 2, title: 'Install plugins', description: 'Pick from the marketplace or bring your own. Plugins are discovered at startup.' },
              { num: 3, title: 'Start building', description: 'Define workflows in YAML, call the gateway API, or build a plugin with the TypeScript SDK.' },
            ].map((step, i) => (
              <AnimateOnScroll key={step.num} animation="slide-up" delay={i * 80}>
                <StepCard {...step} />
              </AnimateOnScroll>
            ))}
          </div>
        </Container>
      </Section>

      {/* ── Trusted by / Marquee ──────────────────────────────────── */}
      <Section>
        <Container>
          <AnimateOnScroll animation="fade">
            <p className="mb-8 text-center text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-muted/60">
              Built with the tools you already use
            </p>
          </AnimateOnScroll>
          <LogoGrid logos={LOGOS} mode="marquee" />
        </Container>
      </Section>

      {/* ── Open source ───────────────────────────────────────────── */}
      <Section>
        <Container>
          <SectionHeader
            eyebrow="Open source"
            title="Built in the open"
            subtitle="Every line of code is public. Audit it, fork it, contribute to it."
          />
          <GridSection cols={2}>
            <FeatureCard title="MIT License" description="No per-seat pricing, no usage caps. Use it in any project." icon={Shield} />
            <FeatureCard title="Monorepo architecture" description="One repo, topological builds, workspace packages." icon={GitBranch} />
            <FeatureCard title="TypeScript-first" description="Strong types across SDK, plugins, gateway, and workflow contracts." icon={Code2} />
            <FeatureCard title="Zero magic" description="Duck-typed plugins, explicit adapter pipeline, auditable governance." icon={Zap} />
          </GridSection>
        </Container>
      </Section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <Section>
        <Container maxWidth="720px">
          <SectionHeader
            eyebrow="FAQ"
            title="Common questions"
            align="center"
          />
          <Accordion items={FAQ} />
        </Container>
      </Section>

      {/* ── Component showcase ────────────────────────────────────── */}
      <Section noBorder>
        <Container maxWidth="800px">
          <SectionHeader
            eyebrow="Design kit"
            title="Component showcase"
            subtitle="All primitives — theme-aware, dark/light."
            align="center"
          />

          {/* Gradient text */}
          <div className="mb-10 flex flex-col gap-3">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.09em] text-muted">Gradient Text</p>
            <div className="flex flex-col gap-2">
              <span className="text-2xl font-bold"><GradientText>Default gradient</GradientText></span>
              <span className="text-2xl font-bold"><GradientText shimmer>Shimmer effect</GradientText></span>
            </div>
          </div>

          {/* Buttons */}
          <div className="mb-10 flex flex-col gap-3">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.09em] text-muted">Buttons</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="accent">Accent</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="primary" size="sm">Small</Button>
              <Button variant="primary" size="lg">Large</Button>
            </div>
          </div>

          {/* Badges */}
          <div className="mb-10 flex flex-col gap-3">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.09em] text-muted">Badges</p>
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="accent">Accent</Badge>
              <Badge variant="muted">Muted</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="danger">Danger</Badge>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-10 flex flex-col gap-3">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.09em] text-muted">Tabs</p>
            <Tabs
              items={[
                { id: 'install', label: 'Install', content: <CodeBlock code={INSTALL_CODE} language="bash" /> },
                { id: 'sdk', label: 'SDK', content: <CodeBlock code={SDK_CODE} language="typescript" filename="plugin.ts" /> },
                { id: 'empty', label: 'Notes', content: <p className="text-muted text-sm">No notes yet.</p> },
              ]}
            />
          </div>

          {/* Tooltips */}
          <div className="mb-10 flex flex-col gap-3">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.09em] text-muted">Tooltips</p>
            <div className="flex flex-wrap items-center gap-6">
              <Tooltip content="Tooltip on top"><Button variant="secondary" size="sm">Top</Button></Tooltip>
              <Tooltip content="Tooltip on bottom" side="bottom"><Button variant="secondary" size="sm">Bottom</Button></Tooltip>
              <Tooltip content="Left side" side="left"><Button variant="secondary" size="sm">Left</Button></Tooltip>
              <Tooltip content="Right side" side="right"><Button variant="secondary" size="sm">Right</Button></Tooltip>
            </div>
          </div>

          {/* Skeleton */}
          <div className="mb-10 flex flex-col gap-3">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.09em] text-muted">Skeleton</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SkeletonCard />
              <div className="flex flex-col gap-2">
                <SkeletonText lines={3} />
              </div>
            </div>
          </div>

          {/* Input */}
          <div className="mb-10 flex flex-col gap-3">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.09em] text-muted">Input</p>
            <div className="flex flex-col gap-2">
              <Input placeholder="your@email.com" type="email" />
              <Input placeholder="Error state" error />
            </div>
          </div>

          {/* Border beam */}
          <div className="mb-10 flex flex-col gap-3">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.09em] text-muted">Border Beam</p>
            <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-6">
              <BorderBeam />
              <p className="text-sm text-muted">Animated gradient border — hover to see it in action.</p>
            </div>
          </div>

          {/* Patterns */}
          <div className="mb-10 flex flex-col gap-3">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.09em] text-muted">Patterns</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="relative h-32 overflow-hidden rounded-xl border border-line bg-surface">
                <DotPattern className="text-line" />
                <span className="absolute inset-0 flex items-center justify-center text-xs text-muted">DotPattern</span>
              </div>
              <div className="relative h-32 overflow-hidden rounded-xl border border-line bg-surface">
                <GridPattern className="text-line" />
                <span className="absolute inset-0 flex items-center justify-center text-xs text-muted">GridPattern</span>
              </div>
            </div>
          </div>

          {/* Theme toggle */}
          <div className="flex flex-col gap-3">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.09em] text-muted">Theme toggle</p>
            <ThemeToggle />
          </div>
        </Container>
      </Section>

      {/* ── Forms ─────────────────────────────────────────────────── */}
      <Section>
        <Container maxWidth="800px">
          <SectionHeader
            eyebrow="Forms"
            title="Form primitives"
            subtitle="FormField + Input + Select + Textarea with validation states."
            align="center"
          />

          <div className="flex flex-col gap-6">
            {/* Normal fields */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Email address" htmlFor="email-demo" required description="We'll never share your email.">
                <Input id="email-demo" type="email" placeholder="you@example.com" />
              </FormField>
              <FormField label="Use case" htmlFor="usecase-demo">
                <Select>
                  <SelectTrigger id="usecase-demo">
                    <SelectValue placeholder="Select a use case…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workflows">Workflow automation</SelectItem>
                    <SelectItem value="gateway">AI Gateway</SelectItem>
                    <SelectItem value="plugins">Plugin development</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            {/* Error states */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Email" htmlFor="email-err" error="Please enter a valid email address." required>
                <Input id="email-err" type="email" placeholder="you@example.com" error />
              </FormField>
              <FormField label="Use case" htmlFor="usecase-err" error="Please select an option.">
                <Select>
                  <SelectTrigger id="usecase-err" error>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workflows">Workflow automation</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            {/* Textarea */}
            <FormField label="Message" htmlFor="message-demo" description="Max 500 characters.">
              <Textarea id="message-demo" placeholder="Tell us about your project…" />
            </FormField>
          </div>
        </Container>
      </Section>

      {/* ── Alerts ────────────────────────────────────────────────── */}
      <Section>
        <Container maxWidth="800px">
          <SectionHeader eyebrow="Feedback" title="Alerts" align="center" />
          <div className="flex flex-col gap-3">
            <Alert variant="info" title="New version available">
              KB Labs v1.2 introduces the new plugin governance pipeline. Update with <code className="font-mono text-xs">kb-create update</code>.
            </Alert>
            <Alert variant="success" title="Deployment successful">
              Your workflow was deployed to production in 2.4 seconds.
            </Alert>
            <Alert variant="warning" title="Rate limit approaching">
              You've used 85% of your AI Gateway quota for this month.
            </Alert>
            <Alert variant="danger" title="Build failed">
              The workflow engine failed to start. Check logs with <code className="font-mono text-xs">kb-dev logs workflow</code>.
            </Alert>
          </div>
        </Container>
      </Section>

      {/* ── Dialog & Toast ────────────────────────────────────────── */}
      <Section>
        <Container maxWidth="800px">
          <SectionHeader eyebrow="Overlays" title="Dialog & Toast" align="center" />
          <ShowcaseDialogToast />
        </Container>
      </Section>

      {/* ── Pricing ───────────────────────────────────────────────── */}
      <Section>
        <Container>
          <SectionHeader
            eyebrow="Pricing"
            title="Simple, transparent pricing"
            subtitle="Start free. Scale when you're ready."
            align="center"
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {PRICING_TIERS.map((tier) => (
              <PricingCard key={tier.name} {...tier} href="/pricing" cta={tier.featured ? 'Get started' : 'Choose plan'} />
            ))}
          </div>
        </Container>
      </Section>

      {/* ── Comparison table ──────────────────────────────────────── */}
      <Section>
        <Container>
          <SectionHeader eyebrow="Compare" title="Feature comparison" align="center" />
          <ComparisonTable
            headers={['Feature', 'Hobby', 'Pro', 'Enterprise']}
            categories={COMPARISON_CATEGORIES}
          />
        </Container>
      </Section>

      {/* ── Testimonials ──────────────────────────────────────────── */}
      <Section>
        <Container>
          <SectionHeader eyebrow="Testimonials" title="What developers say" align="center" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <TestimonialCard
              quote="KB Labs cut our LLM integration time in half. The plugin system is exactly what we needed — no glue code, just drop it in."
              author="Alex Rivera"
              role="CTO"
              company="Stackflow"
              avatarFallback="AR"
            />
            <TestimonialCard
              quote="Self-hosted AI gateway with full TypeScript SDK? We moved off our hand-rolled setup in a weekend. Best decision this quarter."
              author="Mia Chen"
              role="Staff Engineer"
              company="Hypernode"
              avatarFallback="MC"
            />
            <TestimonialCard
              quote="The workflow engine handles our 50+ step pipelines without breaking a sweat. Observability out of the box is a huge plus."
              author="Jonas Weber"
              role="Lead Developer"
              company="Dataform"
              avatarFallback="JW"
            />
          </div>
        </Container>
      </Section>

      {/* ── Blog cards ────────────────────────────────────────────── */}
      <Section>
        <Container>
          <SectionHeader eyebrow="Blog" title="Latest posts" action={<Button variant="ghost" href="/blog">All posts →</Button>} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <BlogCard
              title="Building a production AI gateway with KB Labs"
              excerpt="How to route, rate-limit, and observe every LLM call across your stack using the KB Labs gateway plugin."
              date="May 18, 2026"
              href="/blog/ai-gateway"
              tags={['Gateway', 'Tutorial']}
              readTime="8 min read"
            />
            <BlogCard
              title="Workflow engine internals: how we handle 10k steps/sec"
              excerpt="A deep dive into the execution model, state machine design, and persistence strategy behind the workflow engine."
              date="May 10, 2026"
              href="/blog/workflow-internals"
              tags={['Workflow', 'Architecture']}
              readTime="12 min read"
            />
            <BlogCard
              title="From monolith to plugins: the duck-typing approach"
              excerpt="Why we chose structural typing over interfaces for plugins, and how it keeps the platform extensible without tight coupling."
              date="Apr 28, 2026"
              href="/blog/duck-typing-plugins"
              tags={['Plugins', 'Design']}
              readTime="6 min read"
            />
          </div>
        </Container>
      </Section>

      {/* ── Changelog ─────────────────────────────────────────────── */}
      <Section>
        <Container maxWidth="720px">
          <SectionHeader eyebrow="Changelog" title="What's new" action={<Button variant="ghost" href="/changelog">Full changelog →</Button>} />
          <div>
            <ChangelogEntry
              version="v0.9.0"
              date="May 20, 2026"
              title="AI Gateway + credential chain"
              latest
              changes={[
                { type: 'added', text: 'Credential provider chain for marketplace publish' },
                { type: 'added', text: 'Gateway upstream auto-discovery from plugin manifests' },
                { type: 'changed', text: 'Auth middleware now validates JWT scope per route' },
                { type: 'fixed', text: 'Race condition in workflow session memory flush' },
              ]}
            />
            <ChangelogEntry
              version="v0.8.2"
              date="May 8, 2026"
              title="Workflow stability"
              changes={[
                { type: 'fixed', text: 'Worker pool IPC proxy drops messages on reconnect' },
                { type: 'fixed', text: 'CLI discovery cache stale after incremental build' },
                { type: 'security', text: 'Updated dependencies to patch CVE-2025-30066' },
              ]}
            />
            <ChangelogEntry
              version="v0.8.0"
              date="Apr 22, 2026"
              title="Plugin marketplace"
              changes={[
                { type: 'added', text: 'Marketplace registry with publish/install/list commands' },
                { type: 'added', text: 'kb-dev service manager with health checks and restart policies' },
                { type: 'changed', text: 'Plugin scaffold now generates tsconfig + eslint config' },
                { type: 'removed', text: 'Legacy DevLink mode — replaced by workspace:* protocol' },
              ]}
            />
          </div>
        </Container>
      </Section>

      {/* ── Prose ─────────────────────────────────────────────────── */}
      <Section>
        <Container maxWidth="720px">
          <SectionHeader eyebrow="Prose" title="Article / Legal layout" />
          <Prose>
            <h1>Getting started with KB Labs</h1>
            <p>KB Labs is an open-source AI and infrastructure control plane for developers. It gives you a self-hosted platform with a plugin system, an AI gateway, and a workflow engine — all in one monorepo.</p>
            <h2>Installation</h2>
            <p>Run the install script to bootstrap your workspace. The script detects your Node version and sets up the <code>kb</code> CLI automatically.</p>
            <pre><code>curl -fsSL https://get.kblabs.dev | bash</code></pre>
            <h2>Core concepts</h2>
            <ul>
              <li><strong>Plugins</strong> — duck-typed modules that register commands, routes, and handlers.</li>
              <li><strong>Gateway</strong> — API gateway that handles auth, routing, and observability.</li>
              <li><strong>Workflow engine</strong> — persistent, resumable pipelines with step-level state.</li>
            </ul>
            <blockquote>Everything in plugins/ is a plugin. If it uses the SDK and registers commands, it is a plugin.</blockquote>
            <h3>Further reading</h3>
            <p>See the <a href="/docs">documentation</a> for a full reference, or check out the <a href="/blog">blog</a> for tutorials and deep dives.</p>
          </Prose>
        </Container>
      </Section>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-t border-line bg-surface">
        <GradientOrbs variant="section" />
        <Container>
          <div className="relative z-10 flex flex-col items-center gap-5 py-[clamp(4rem,7vw,5.5rem)] text-center">
            <h2 className="max-w-[18ch] text-[clamp(1.75rem,3.5vw,2.8rem)] font-bold leading-[1.08] tracking-tight text-kb-text">
              Start building on your own infrastructure
            </h2>
            <p className="max-w-[52ch] text-[1.05rem] leading-[1.7] text-muted">
              Self-hosted, open-source, MIT licensed. Run it on your laptop or a VPS.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-1">
              <Button variant="primary" size="lg" href="/install">
                Get started free
                <ArrowRight size={16} />
              </Button>
              <Button variant="secondary" size="lg" href="/docs">
                Documentation
              </Button>
            </div>
          </div>
        </Container>
      </div>

    </div>
  );
}
