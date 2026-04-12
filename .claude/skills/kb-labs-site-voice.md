---
name: kb-labs-site-voice
description: Voice, tone, structure, and copy rules for editing any page on the KB Labs marketing site. Applies automatically when working in sites/web/**.
globs:
  - sites/web/**
---

# KB Labs Site — Voice & Writing Guide

This skill applies to every edit under `sites/web/`. Read it before writing any copy. It is not a style suggestion — it is the agreed voice we iterated on for hours. Deviations will be reverted.

---

## 1. What KB Labs actually is (anchor truth)

KB Labs is an **open-source engine for the whole engineering delivery loop** — workflows, reviews, releases, infrastructure, agents. It is a runtime that applies one set of rules to any executor: humans, plugin-agents, external agents (Claude, Codex), CI bots, future MCP connections.

The project was built out of **three accumulating frustrations**, in this order:

1. **Routine as a tax on the craft.** Engineers doing by hand every day what a machine can do. → Became Workflows.
2. **Big tech hoarding what should be shared.** Internal platforms closed as moats. → Became the open-source core and plugin system.
3. **Vendors renting you your own stack.** Migration costs months, lock-in is quiet. → Became the Gateway and adapters (25+ contract interfaces).

Every product surface maps to one of those three. This is not a marketing construction — it is the literal build history. Philosophy and product are structurally coherent. Every page on the site exists to reflect this.

**The tagline is "Open the closed."** It stays in English across both locales. It is the meta title, it lives in the header area, it is in the founder's bio, he plans to tattoo it. Do not translate it. Do not soften it. Do not bury it.

**Stage discipline.** The project is MVP / closed beta. We are **not** a movement yet. We are **built in the open** — showing our work as it happens. The word *movement* is banned from site copy at this stage; we earn it after a real community exists. Until then: GitHub, Roadmap, Changelog are the surfaces we point to.

---

## 2. Voice rules (non-negotiable)

### Write as "we"
- Voice is **"we"** as the KB Labs project, never "I", never "KB Labs (3rd person)".
- Personal "I" lives only on `/about` and on the footer link to `k-baranov.ru`. Nowhere else.
- "Мы" in Russian, "we" in English.

### Register: calm conviction, not agitation
- We are not fighting anything. We are building what we wish already existed. Keep this line in mind for every sentence.
- No enemy-naming in the style of "big tech hoards" as a direct accusation. Name the problem coldly: *"Internal platforms should be open. They don't need to live behind closed doors."* — state a belief, do not throw a punch.
- No pathos. No exclamation marks. No "!" in any copy, ever. The only strong emotion allowed is cold certainty.
- No emoji in page copy. Ever.

### "We believe X. So we built Y."
This is the load-bearing rhetorical pattern. When describing any feature or product area, express it as: *belief → thing we built in answer*. This is how Workflows, Plugins, and Gateway map onto the three frustrations on the homepage, and it is how every other product page should introduce itself.

Examples of the pattern:
- *"We believe engineers shouldn't do by hand what a machine can do. So we built Workflows."*
- *"We believe your stack should stay yours. So every vendor sits behind a contract you control."*
- *"We believe internal platforms should be open. So everything is a plugin, and every plugin is code you can read."*

### Words and phrases to avoid (with nuance)

These words **usually** make copy worse, but context matters. Use judgment, not a blanket ban.

**Avoid in positioning / hero / marketing copy (EN):**
- **movement**, **join the movement** — we're MVP; promising a community that isn't there breaks trust
- **empower**, **unlock**, **revolutionize**, **cutting-edge**, **seamless**, **best-in-class**, **robust**, **next-generation** — vendor-pitch filler
- **trusted by** — we have no logos
- **try for free**, **book a demo** — replace with *Install*, *View on GitHub*
- **AI-powered**, **AI-first** — we do AI integration honestly, not as a label

**`enterprise` has a special status.** The `/enterprise` page exists as a deliberate back door for larger buyers. The word is fine **on that page** and in links pointing to it. What to avoid is *framing the main homepage / developer-facing copy* around it — "enterprise tier", "enterprise features" in a pricing table on the homepage, or nav items called "Enterprise" that dilute the developer-first register. If an `/enterprise` link lives in main nav or footer, that's a product decision — not a voice violation. Use judgment.

**Avoid in RU copy:**
- **инжиниринг** (калька — use *разработка*, *инструменты*, *стек* as context allows)
- **ложится**, **как ляжет движок** (2010s dev-talk)
- **премиум**, **лучшее решение**, **передовой**, **революционный**
- **обсудить внедрение** (sales script — prefer *написать команде*)
- any direct translation of the avoided EN words above

### Hard rules (not nuance, do not break)
- No exclamation marks in any page copy
- No emoji in any page copy
- "Open the closed" stays in English in both locales — do not translate it
- SEO floor words (`workflow`, `open-source`, `self-hosted`) must appear in hero subtitle + meta description of pages that rank for them

### Russian is a separate language, not a translation target

**This is the single most-violated rule. Read it twice.**

Russian copy is **not** a sentence-by-sentence translation of the English file. It is a parallel version of the same message, written natively in Russian. The two locales share structure and meaning, but every sentence in RU is composed as if written from scratch by a Russian-speaking engineer who never saw the English.

Signs you are translating instead of writing:
- You can map every RU word back to an EN word in the same order → **rewrite it**.
- The sentence follows English word order (subject → verb → object with English rhythm) → **rewrite it**.
- The sentence contains calques: *инжиниринг*, *ассетам*, *экспириенс*, *делаем фокус на*, *в рамках данного решения* → **replace with natural Russian**.
- The sentence uses prepositions the way English does but Russian does not: *"работает через"* where Russian would say *"работает по"* — check each preposition.
- The sentence reads fine if you squint, but a native speaker would never say it aloud → **read it aloud in your head; if it clanks, rewrite it**.

What "natural Russian" means here:
- Shorter sentences than English. Russian tolerates less subordination. Cut where English chains.
- Active voice over passive. *"KB Labs применяет правила"* beats *"Правила применяются KB Labs'ом"*.
- Concrete verbs over abstract constructions. *"поставьте"* beats *"произведите установку"*.
- Don't invent Russian equivalents for technical terms. Leave in English: *runtime, workflow, plugin, OSS, roadmap, SLA, governance, pull request, CI/CD, capabilities, handlers, manifest, self-hosted, on-prem, open-source, commit, deploy, PR*. A Russian engineer reads these in English in their head already; converting them to *"самоуправляемый"*, *"оркестратор задач"*, *"договорные обязательства"* makes the text worse.
- Connective tissue is always natural Russian, never Runglish. *"Мы believe в том что..."* is forbidden. *"Мы верим, что..."* is right.
- When you have multiple sentences in a row, vary length and rhythm — Russian copy with three 20-word sentences in a row reads as translated.

**Rule of thumb:** after writing RU, read it aloud in your head one pass. If any sentence makes you wince, that sentence is a translation, not Russian. Rewrite before committing.

### Be direct, not clever
- Short sentences. State the thing.
- No metaphor that requires explanation.
- No cute headings.
- If you can cut a word, cut it.

---

## 3. Page-level structure

### Every page starts with position, not feature
Hero headline expresses a **belief** or a **stance**, not a feature name. The subtitle can contain feature/category words (workflow, open-source, self-hosted) because that is where SEO anchors live — but the headline itself is register-setting.

Examples of correct hero headlines:
- *"We believe engineering should stay yours."* (homepage)
- *"Ваши инструменты должны оставаться вашими."* (homepage RU)

Examples of WRONG hero headlines (corporate / feature-pitch register):
- *"Programmable workflows for the modern dev loop."*
- *"The unified platform for engineering teams."*
- *"Инжиниринг должен оставаться вашим."*

### SEO floor (do not violate)
Regardless of how manifesto-driven the headline is, the following words **must** appear in the hero subtitle **and** the meta description of every page that ranks for them:
- `workflow` / `workflows`
- `open-source`
- `self-hosted`

Organic traffic today lands on these keywords. Losing them while rewriting is a real and measurable cost.

### Every page ends with the shared final CTA
Use the existing `.final-cta-block` pattern (it lives on most pages already). Do not invent a new CTA block. Do not replace it with something clever. It looks like this:

```tsx
<section className="final-cta-block reveal">
  <h2>{t('page.finalCta.title')}</h2>
  <p>{t('page.finalCta.description')}</p>
  <div className="cta-row">
    <Link className="btn primary" href={`/${locale}/install`}>
      {t('page.finalCta.installBtn')}
    </Link>
    <Link className="btn secondary" href={`/${locale}/contact`}>
      {t('page.finalCta.contactBtn')}
    </Link>
  </div>
</section>
```

### Standard section rhythm
Content sections inside a page should use the same visual rhythm already established by `.wf-section` in `globals.css`:
```css
padding-block: clamp(3rem, 6vw, 5rem);
border-bottom: 1px solid var(--line);
```
Do not invent new paddings. Match the existing rhythm so pages feel like one site.

---

## 4. Content blocks — allowed and forbidden

### Allowed
- Hero with position-first headline
- "We believe / we built" content sections
- Belief → answer rows (two columns, like `BeliefsSection`)
- 3-card grids with one-line descriptions (like `SameRailsSection.points`)
- Step-by-step flows with monospace numbers (like `StartBesideSection.steps`)
- Dogfooding strip: short factual labels about how we run KB Labs on KB Labs, facts only
- Inline security markers strip: `Self-hosted · Permissioned · Full audit trail · On-prem by default` (link each to `/security#...`)
- "Built in the open" door-cards (GitHub, Roadmap, Changelog)
- FAQ rows using the existing `FaqSection`
- Final CTA using the shared `.final-cta-block`

### Avoid these content patterns
- **Founder-quote block as a content card.** The founder voice lives in the *tone of the whole site*, not in an island block. Do not resurrect `FounderSection`. Do not embed a pull-quote from Kirill as decoration. "Open the closed" works as a tagline in header/footer/meta, not as a framed card.
- **"Trusted by" / logos grid / testimonials.** We have none. Faking it destroys the rest of the voice.
- **Empty-community links.** Do not surface Discord/Slack/forums until there is real activity behind them. GitHub + Roadmap + Changelog are reliable surfaces. If the user explicitly asks for a Discord link once a server exists, add it.
- **Decorative SVG graphics floating on empty whitespace.** Abstract capsules travelling a rail with nothing around them read as a screensaver. If a graphic is added, it must carry context — surrounding labels, real data, integration with a code/config example, or tight coupling with an adjacent text block. When in doubt, no graphic is better than a bad one.
- **Emoji, gradient-heavy hero orbs, particle backgrounds, animated "wow" blocks.** The aesthetic is Linear / Vercel / Resend — cold, geometric, restrained.

### Patterns that are fine in the right place
- **Security cards block** — great on `/security`. On other pages prefer the inline markers strip.
- **Pricing table** — lives on `/pricing`. Homepage prefers one FAQ item pointing at it.
- **Commercial layer / enterprise framing** — fine on `/pricing` and `/enterprise` with the soft framing from §5. Not a violation to link to them from main nav or footer.

---

## 5. Commercial framing (how to leave the monetization door open without being vendor-coded)

KB Labs is pre-revenue. The site must **leave the door open** for a future commercial layer, because introducing paid tiers later without prior signaling reads as a betrayal. But we also cannot put corporate-style pricing tables on an MVP homepage — it kills the voice.

Rules:
- OSS core is **free and will stay free**. Write this directly. "The engine doesn't close" is the load-bearing line.
- A **commercial support layer** is on the roadmap — for teams that need SLA, dedicated support, advanced governance. It is **additive**, never a gate in front of the core. Use exactly this framing.
- **Never cite a date.** No "Q3 2026", no "H2 next year". Dates read as "not ready" and age badly. Use *"on the roadmap"* / *"на roadmap"*.
- **Never use the word `enterprise`** in customer-facing copy. Use *commercial support*, *teams that need guarantees*. Enterprise is internally still the target of that layer, but saying so in public copy cuts the developer audience.
- On the homepage, the commercial door is a single FAQ item. Nothing more.
- On `/pricing`, full description lives, with the same soft framing.

---

## 6. AI / agents framing

KB Labs is **runtime-level agent-friendly by architecture**, not as a feature. Every surface is dual-format (human-readable and agent-consumable). Plugin-agents live inside the platform. External agents (Claude, Codex) connect through the same contracts. MCP support is on the roadmap as the next protocol-level extension of the same permissions / observability / extension model.

When writing anything about AI or agents:
- **Never** position as "AI-powered" / "AI-first". We are not pitching AI. We are a runtime that happens to treat agents as first-class runners.
- **Always** frame as "same rails for humans and agents" — philosophical equality, not feature checkbox.
- Plugin-agent, external agent, CI bot, future MCP connection: all **runners**. But do not call them "executors" — sounds depressing and machinic. *"Runner"*, *"everyone who runs"*, *"any kind of runner"* are acceptable.
- A person plus agents is a team. This is a load-bearing sentence — it reframes solo builders from "alone" to "team of one plus agents". Useful on pages aimed at individual developers.

---

## 7. i18n rules

- Both `messages/en.json` and `messages/ru.json` are kept in structural parity. Every key that exists in one locale exists in the other.
- Add new keys in **both** files in the same commit. Do not leave RU missing a key EN has.
- RU is rewritten from scratch in natural Russian, not transliterated.
- Keep technical terms in English in RU copy (§2, "Russian is not translated English").
- Meta title contains `"KB Labs"` and the tagline or page subject, tagline in EN in both locales.
- Meta description contains the SEO floor words from §3.

---

## 8. Checklist for any new or rewritten page

Before shipping, walk through these in order:

1. **Hero headline** — is it a belief/stance, not a feature pitch?
2. **Hero subtitle** — does it contain `workflow`, `open-source`, `self-hosted` in some form?
3. **Meta title** — contains `KB Labs` + subject?
4. **Meta description** — SEO floor words present, 150–160 chars?
5. **Voice** — is everything "we"? No stray "I" (except `/about`)? No "the platform does X"?
6. **Banned words** — sweep for movement, enterprise, empower, инжиниринг, ложится, etc.
7. **"We believe / we built"** — are the main product surfaces framed this way where relevant?
8. **Final CTA** — using the shared `.final-cta-block` at the bottom?
9. **SEO parity** — same structure in EN and RU, same keys present?
10. **Russian naturalness** — read the RU version aloud mentally. If it sounds translated, rewrite.
11. **No forbidden blocks** — founder-quote card, logos grid, hero orbs, empty community links, pricing table, enterprise tier block.
12. **"Open the closed" is findable** — in meta title, in header/footer tagline, or in the narrative thread. It should not be absent from the page entirely.
13. **typecheck + lint** — run `pnpm --filter @kb-labs/web-site typecheck` and `pnpm --filter @kb-labs/web-site lint` before considering the edit done.

---

## 9. When to ask the user instead of guessing

- **Hero headline for a new page** — always show 2–3 options and let Kirill pick. Voice calibration is the single hardest thing and trying to ship it in one shot usually fails.
- **Any block that would be visible on the first fold** — confirm before editing.
- **New pattern that doesn't yet exist on the site** — pause, describe it, get agreement.
- **Anything that touches commercial framing** — commercial copy is load-bearing for future monetization; never improvise.

For copy changes inside an existing section pattern (FAQ item, belief row, step description), edit directly — these are low-risk.

---

## 10. Why this skill exists

Kirill rewrote the homepage positioning **three times** before this guide existed. Every rewrite re-discovered the same voice from scratch because there was no anchor. This skill is the anchor. When in doubt, re-read §1 and §2 — the answer is almost always there.

The project is one person plus agents, shipping toward a public launch. Every page on the site is load-bearing. Consistency of voice across pages is the single most visible quality signal we have. Do not deviate from this guide without an explicit instruction from Kirill to do so.
