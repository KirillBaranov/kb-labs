'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import s from './page.module.css';

// ── Adapter cycling data ──────────────────────────────────────────────────

const ADAPTER_SETS = [
  { llm: 'openai',      cache: 'redis',      vectorStore: 'qdrant',   analytics: 'sqlite' },
  { llm: 'anthropic',   cache: 'memcached',  vectorStore: 'pinecone', analytics: 'duckdb' },
  { llm: 'local-llama', cache: 'in-memory',  vectorStore: 'chromadb', analytics: 'clickhouse' },
];

const ADAPTERS = [
  { num: '.01', name: 'LLM',          desc: 'Language model access with tier-based routing and automatic failover.', providers: 'OpenAI, Anthropic, Ollama, Azure OpenAI' },
  { num: '.02', name: 'Cache',        desc: 'Key-value caching with TTL, sorted sets, and atomic operations.',       providers: 'Redis, Memcached, In-Memory' },
  { num: '.03', name: 'Vector Store', desc: 'Semantic search over embeddings with upsert, delete, and filtering.',   providers: 'Qdrant, Pinecone, ChromaDB' },
  { num: '.04', name: 'Analytics',    desc: 'Event tracking, time-series aggregation, and usage dashboards.',         providers: 'SQLite, DuckDB, ClickHouse' },
  { num: '.05', name: 'Storage',      desc: 'File read/write/list with a unified interface across backends.',         providers: 'S3, Local FS, MinIO' },
  { num: '.06', name: 'Embeddings',   desc: 'Text-to-vector conversion for search and similarity.',                  providers: 'OpenAI, Cohere, Local' },
];

// ── Types ─────────────────────────────────────────────────────────────────

interface PlatformApiContentProps {
  locale: string;
  t: {
    heroTitle: string;
    heroDescription: string;
    startBtn: string;
    contactBtn: string;
    configCaption: string;
    archTitle: string;
    adapterTitle: string;
    ctaTitle: string;
    ctaDescription: string;
    ctaStartBtn: string;
    ctaContactBtn: string;
  };
}

// ── Component ─────────────────────────────────────────────────────────────

export function PlatformApiContent({ locale, t }: PlatformApiContentProps) {
  const [setIndex, setSetIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setSetIndex((prev) => (prev + 1) % ADAPTER_SETS.length);
        setFading(false);
      }, 400);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  const current = ADAPTER_SETS[setIndex]!;
  const valClass = `${s.configValue} ${fading ? s.fading : ''}`;

  return (
    <>
      {/* ── Hero with Animated Config ── */}
      <section className={s.hero}>
        <span className={s.badge}>Platform API</span>
        <h1>{t.heroTitle}</h1>
        <p>{t.heroDescription}</p>

        <div className={s.configWrapper}>
          <div className={s.configBlock}>
            <div className={s.configDots}><span /><span /><span /></div>
            <pre className={s.configPre}><code>{'{\n'}<span className={s.configKey}>  &quot;adapters&quot;</span>{': {\n'}<span className={s.configKey}>    &quot;llm&quot;</span>{':         '}<span className={valClass}>&quot;{current.llm}&quot;</span>{',\n'}<span className={s.configKey}>    &quot;cache&quot;</span>{':       '}<span className={valClass}>&quot;{current.cache}&quot;</span>{',\n'}<span className={s.configKey}>    &quot;vectorStore&quot;</span>{': '}<span className={valClass}>&quot;{current.vectorStore}&quot;</span>{',\n'}<span className={s.configKey}>    &quot;analytics&quot;</span>{':   '}<span className={valClass}>&quot;{current.analytics}&quot;</span>{'\n  }\n}'}</code></pre>
          </div>
          <p className={s.configCaption}>{t.configCaption}</p>
        </div>

        <div className={s.heroCta}>
          <Link className="btn primary" href={`/${locale}/install`}>{t.startBtn}</Link>
          <Link className="btn secondary" href={`/${locale}/contact`}>{t.contactBtn}</Link>
        </div>
      </section>

      {/* ── Adapters — numbered narrative ── */}
      <section className={s.narrativeSection}>
        <div className={s.container}>
          <h2>{t.adapterTitle}</h2>
          <div className={s.narrativeList}>
            {ADAPTERS.map((a) => (
              <div key={a.num} className={s.narrativeItem}>
                <span className={s.narrativeNum}>{a.num}</span>
                <div>
                  <h3 className={s.narrativeName}>{a.name}</h3>
                  <p className={s.narrativeDesc}>{a.desc}</p>
                  <p className={s.narrativeProviders}>{a.providers}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Code example ── */}
      <section className={s.codeSection}>
        <div className={s.container}>
          <div className={s.codeBlock}>
            <div className={s.codeDots}><span /><span /><span /></div>
            <pre><code><span className={s.cKw}>import</span>{' { '}<span className={s.cType}>KBPlatform</span>{' } '}<span className={s.cKw}>from</span> <span className={s.cStr}>&apos;@kb-labs/platform-client&apos;</span>{';\n\n'}<span className={s.cKw}>const</span>{' platform = '}<span className={s.cKw}>new</span> <span className={s.cType}>KBPlatform</span>{'({\n  endpoint: '}<span className={s.cStr}>&apos;http://gateway:4000&apos;</span>{',\n  apiKey: '}<span className={s.cVar}>process</span>{'.env.'}<span className={s.cVar}>KB_API_KEY</span>{',\n});\n\n'}<span className={s.cComment}>{'// LLM — provider resolved by platform config'}</span>{'\n'}<span className={s.cKw}>const</span>{' answer = '}<span className={s.cKw}>await</span>{' platform.'}<span className={s.cFn}>llm</span>{'.'}<span className={s.cFn}>complete</span>{'('}<span className={s.cStr}>&apos;Explain this code&apos;</span>{');\n\n'}<span className={s.cComment}>{'// Cache — Redis, Memcached, or in-memory, same API'}</span>{'\n'}<span className={s.cKw}>await</span>{' platform.'}<span className={s.cFn}>cache</span>{'.'}<span className={s.cFn}>set</span>{'('}<span className={s.cStr}>&apos;session:123&apos;</span>{', userData, '}<span className={s.cNum}>3600</span>{');\n\n'}<span className={s.cComment}>{'// Telemetry — batched, auto-flushed'}</span>{'\nplatform.'}<span className={s.cFn}>telemetry</span>{'.'}<span className={s.cFn}>event</span>{'('}<span className={s.cStr}>&apos;user.signup&apos;</span>{', { plan: '}<span className={s.cStr}>&apos;pro&apos;</span>{' });'}</code></pre>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="final-cta-block reveal">
        <h2>{t.ctaTitle}</h2>
        <p>{t.ctaDescription}</p>
        <div className="cta-row">
          <Link className="btn primary" href={`/${locale}/install`}>{t.ctaStartBtn}</Link>
          <Link className="btn secondary" href={`/${locale}/contact`}>{t.ctaContactBtn}</Link>
        </div>
      </section>
    </>
  );
}
