import type { Metadata } from 'next';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { buildPageMetadata } from '@/lib/page-metadata';
import s from '../post.module.css';

// Placeholder posts — replace with real MDX/CMS source later
export const POSTS: Record<string, {
  tag: string;
  title: string;
  date: string;
  readTime: string;
  content: React.ReactNode;
}> = {
  'open-the-closed': {
    tag: 'Philosophy',
    title: 'Open the closed: why vendor lock-in is a design choice, not a given',
    date: 'January 2026',
    readTime: '6 min read',
    content: (
      <>
        <p>
          Every platform dependency is a bet. You&apos;re betting that this vendor
          will still be the right choice in two years — on price, on capability, on
          reliability. Most bets age poorly.
        </p>
        <p>
          The standard advice is &quot;choose wisely.&quot; Pick the vendor with the best
          track record, the largest ecosystem, the most stable API. Solid advice.
          Also: not sufficient.
        </p>
        <h2>The real problem is coupling, not choice</h2>
        <p>
          Lock-in doesn&apos;t happen because you picked the wrong vendor. It happens
          because your business logic learned the shape of that vendor&apos;s API. Your
          prompts know about OpenAI&apos;s message format. Your queries know about
          Pinecone&apos;s filter syntax. Your workflows know about Temporal&apos;s
          activity model.
        </p>
        <p>
          When a better option appears — and it will — switching requires rewriting
          the business logic that referenced those shapes. That cost is almost always
          higher than the cost of staying. So you stay. Not because the vendor is best;
          because leaving is expensive.
        </p>
        <h2>Contracts as the fix</h2>
        <p>
          The structural fix is simple: your business logic should never reference
          a vendor&apos;s concrete types. It should reference a contract — an interface
          that describes what you need, not how it&apos;s implemented.
        </p>
        <pre><code>{`// Bad — business logic knows about OpenAI
import OpenAI from 'openai';
const res = await openai.chat.completions.create({ model: 'gpt-4o', ... });

// Good — business logic knows about a contract
import { ILLMAdapter } from '@kb-labs/contracts';
const res = await llm.chat({ messages, model: 'default' });`}</code></pre>
        <p>
          The adapter layer translates the contract into whatever the vendor requires.
          Swap the adapter, not the logic.
        </p>
        <h2>What &quot;open the closed&quot; means in practice</h2>
        <p>
          We apply this to every system boundary in KB Labs:
        </p>
        <ul>
          <li><strong>LLM providers</strong> — swap between OpenAI, Anthropic, local models via one config change</li>
          <li><strong>Vector stores</strong> — Qdrant today, something else tomorrow, same query interface</li>
          <li><strong>Cache backends</strong> — in-memory for local dev, Redis for production, identical API</li>
          <li><strong>Workflow runtimes</strong> — the engine is behind a contract; your workflow YAML doesn&apos;t know about it</li>
          <li><strong>State storage</strong> — State Broker works over in-memory, Redis, or custom backends</li>
        </ul>
        <p>
          The test we apply to every new abstraction: <em>can a developer swap this
          dependency without touching their business logic?</em> If no, the abstraction
          is leaking.
        </p>
        <h2>The cost of this approach</h2>
        <p>
          There&apos;s a real cost. More interfaces to maintain. More adapter code to write.
          Occasionally, an abstraction that doesn&apos;t fit perfectly over a vendor&apos;s
          quirky API surface.
        </p>
        <p>
          We think that cost is worth paying — and we think it compounds in your favour.
          The first swap is work. The second swap is routine. By the third, your team
          treats infrastructure as genuinely interchangeable, because it is.
        </p>
        <p>
          That&apos;s the freedom we&apos;re building towards. Not freedom from vendors —
          freedom to choose them on their merits, any time.
        </p>
      </>
    ),
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = POSTS[slug];
  if (!post) return {};
  const meta = buildPageMetadata({
    locale,
    title: post.title,
    description: `${post.tag} • ${post.date} • ${post.readTime}`,
    path: `/blog/${slug}`,
    imageSegment: `blog/${slug}`,
  });
  // Mark as article and surface publication date for richer crawler hints.
  return {
    ...meta,
    openGraph: {
      ...meta.openGraph,
      type: 'article',
      publishedTime: post.date,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = POSTS[slug];

  if (!post) notFound();

  return (
    <>
      <SiteHeader />
      <main>

        <header className={s.header}>
          <span className={s.tag}>{post.tag}</span>
          <h1>{post.title}</h1>
          <div className={s.meta}>
            <span>{post.date}</span>
            <span className={s.metaDot} />
            <span>{post.readTime}</span>
          </div>
        </header>

        <Link className={s.back} href={`/${locale}/blog`}>← All posts</Link>

        <article className={s.article}>
          {post.content}
        </article>

      </main>
      <SiteFooter />
    </>
  );
}
