'use client';

import Link from 'next/link';
import { useState } from 'react';

type AdapterOption = {
  id: string;
  label: string;
  packageName: string;
  badge: string;
};

type GatewayHookSectionProps = {
  title: string;
  lead: string;
  honesty: string;
  ctaLabel: string;
  ctaHref: string;
  configCaption: string;
  codeCaption: string;
  codeNote: string;
  adapters: AdapterOption[];
};

export function GatewayHookSection({
  title,
  lead,
  honesty,
  ctaLabel,
  ctaHref,
  configCaption,
  codeCaption,
  codeNote,
  adapters,
}: GatewayHookSectionProps) {
  const [activeId, setActiveId] = useState(adapters[0]?.id ?? '');
  const active = adapters.find((a) => a.id === activeId) ?? adapters[0];

  return (
    <section className="wf-section gw-section">
      <div className="gw-grid">
        {/* ─── Left: text ──────────────────────────────────────── */}
        <div className="gw-left reveal">
          <h2 className="wf-title">{title}</h2>
          <p className="wf-lead">{lead}</p>
          <p className="gw-honesty">{honesty}</p>
          <Link className="wf-cta gw-cta" href={ctaHref}>
            {ctaLabel}
          </Link>
        </div>

        {/* ─── Right: interactive code ─────────────────────────── */}
        <div className="gw-right reveal">
          {/* Adapter switcher */}
          <div className="gw-tabs" role="tablist" aria-label="Event bus adapter">
            {adapters.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={opt.id === activeId}
                className={`gw-tab ${opt.id === activeId ? 'is-active' : ''}`}
                onClick={() => setActiveId(opt.id)}
              >
                <span className="gw-tab-label">{opt.label}</span>
                <span className="gw-tab-badge">{opt.badge}</span>
              </button>
            ))}
          </div>

          {/* JSON config (the only thing that changes) */}
          <div className="gw-code gw-code-config">
            <div className="gw-code-bar">
              <span className="gw-code-caption">{configCaption}</span>
              <span className="gw-code-pill">changes</span>
            </div>
            <pre className="gw-code-block">
              <code>
                {`{\n  `}
                <span className="gw-c-string">{`"platform"`}</span>
                {`: {\n    `}
                <span className="gw-c-string">{`"adapters"`}</span>
                {`: {\n      `}
                <span className="gw-c-string">{`"eventBus"`}</span>
                {`: `}
                <span className="gw-c-string gw-c-highlight">{`"${active.packageName}"`}</span>
                {`\n    }\n  }\n}`}
              </code>
            </pre>
          </div>

          {/* TS code (never changes) */}
          <div className="gw-code gw-code-app">
            <div className="gw-code-bar">
              <span className="gw-code-caption">{codeCaption}</span>
              <span className="gw-code-pill gw-code-pill-stable">never changes</span>
            </div>
            <pre className="gw-code-block">
              <code>
                <span className="gw-c-keyword">import</span>
                {` { `}
                <span className="gw-c-fn">useEventBus</span>
                {` } `}
                <span className="gw-c-keyword">from</span>
                {` `}
                <span className="gw-c-string">{`'@kb-labs/sdk'`}</span>
                {`;\n\n`}
                <span className="gw-c-keyword">const</span>
                {` bus = `}
                <span className="gw-c-fn">useEventBus</span>
                {`();\n\n`}
                <span className="gw-c-keyword">await</span>
                {` bus.`}
                <span className="gw-c-fn">publish</span>
                {`(`}
                <span className="gw-c-string">{`'order.created'`}</span>
                {`, order);`}
              </code>
            </pre>
            <p className="gw-code-note">{codeNote}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
