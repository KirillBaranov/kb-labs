# KB Labs — Positioning & Strategy

> # **Open the closed.**
>
> *This is the founder's long-standing position. It predates the product. Everything else in this document — the one-line truth, the three angers, the two pillars, the guardrails, the elevator pitches — is a projection of this single phrase onto a specific channel, audience, or moment. When two parts of this document conflict, the one closer to "open the closed" wins.*

> **Status:** v3.5 — 2026-04-08
> **Type:** Internal strategy document. **Not public-facing.** Used by the founder to keep positioning coherent across the public site, live conversations, and future content.
> **Owner:** Kirill Baranov
> **Purpose:** A working tool, not an artifact. Read it, consult it, update it. It exists so that copy on the site, answers in DMs, and decisions about features all trace back to one consistent worldview — and so that worldview survives the next six months of iteration without quietly drifting.
>
> **v3.1 changes:** Tightened the HAL story against the code. (1) §4.3 now draws an explicit boundary between public adapter contracts (vendor layer, ~17 interfaces, ~21 adapters shipping) and internal platform contracts (workflow, agent, plugin system — not adapters). (2) §4.2 reframes the event bus story: the contract is designed for Redis / RabbitMQ / Kafka / NATS, one reference implementation ships, broker adapters are roadmap — not "supported today". (3) §10 adds two messaging rails: no adapter names without a real manifest in the repo; no calling internal contracts "adapters". (4) §13 adds two guardrails enforcing the same.
>
> **v3.2 changes:** Collapsed the audience model from two to one. (1) §6 is now "one audience, one voice" — developers and tech leads in 2–50-person teams. The previous "Audience B — engineering leadership" framing is removed from public positioning. (2) §8 (industrialization framing) reoriented from "for CTOs / Audience B" to "for experienced developers and tech leads who already failed to put agents into their dev loop". (3) §11 Layer 4 stops mentioning leadership as a target reader. (4) §12 reduced to a single channel — public web — with the senior-network outreach moved out. (5) New §16 documents the senior-network distribution lever as an **internal note**, explicitly not part of public positioning, to be activated only after the public channel has real traction. (6) §13 guardrail #1 rewritten: not "do not write for two audiences" but "write for the developer end to end". (7) §14 open question #6 updated to point at §16 instead of "Audience B".
>
> **v3.3 changes:** Recognized that Workflows and Gateway are **two equally real entry hooks**, not one lead and one supporting. (1) §4 intro now says the pillars are structurally equal — the only asymmetry is which one carries the homepage hero, and that is a Layer-1 attention decision, not a product hierarchy. (2) §4.1 retitled "carries the homepage hero" instead of "the lead pillar"; the rationale is now explicitly about hook universality in the first ten seconds, not about Workflows being more important. (3) §4.2 retitled "structurally equal, lives below the fold"; the old "supporting pillar" framing is removed, replaced with an explanation of *why* Gateway lives in Layer 2 (the word "Gateway" reads as "AI proxy" in a hero and gets dismissed). (4) §11 Layer 2 is now explicitly **two equal sections** — Section A for the routine hook (Workflows) and Section B for the infra-lock-in hook (Gateway), in fixed order, equal visual weight. The broker-scar reader finds their pain on the homepage, not three pages deep. (5) §13 guardrail #3 rewritten: not "do not promote Gateway to co-equal" but "Gateway sits in Layer 2 Section B, equal weight, fixed slot — anything else is a regression in either direction". (6) §15 next step #2 expanded to spell out the two-section Layer 2; #3 says `/product` is now two co-equal top-level sections (`#workflows` and `#gateway`).
>
> **v3.4 changes:** Repositioned the document itself as an internal working tool, not a public asset. (1) "Open the closed" promoted to an epigraph at the very top — every other formulation in the document is now explicitly subordinate to it. (2) §3 (one-line truth) reframed as the *operational projection* of "open the closed" for the developer audience, not a parallel formula. (3) §2.4 thesis reframed as the *three concrete dimensions* of "open the closed" for the engineer, not three independent points. (4) New "How to use this document" section added before §1 — turns the document from a static source of truth into an operating manual with specific consultation moments. (5) New §17 "Hypotheses, not facts" — explicit list of things currently asserted in the document that are actually untested gambles waiting for first feedback. (6) §14 open question #2 updated for the now-two-section Layer 2 reality.
>
> **v3.5 changes:** Reframed the Gateway / event bus story from "broker adapters are roadmap" to **"the extension point is open today"**. The earlier framing was technically correct but understated the actual capability — the `IEventBus` contract and the runtime adapter loader are production code right now, and any team can write their own Kafka / RabbitMQ / NATS adapter against the same interface today, in their own repo, and it loads identically to the public ones. The public catalog will grow in parallel, but nobody has to wait. (1) §4.2 broker-scar paragraph rewritten to lead with "the extension point is open today" and explicitly distinguish capability claims from product claims. (2) §10.1 event-bus bullet rewritten parallel to §4.2 — now reads as a capability claim, not a roadmap promise. (3) §10.2 forbidden-phrases entry on adapters expanded to make the capability/product distinction explicit and to call out under-claiming as a regression alongside over-claiming. (4) Patch happened as Step 0 of the marketing site rewrite — see plan `snuggly-kindling-seahorse.md` — preserving the §5 "fix the document first" discipline before any site copy is touched.

---

## How to use this document

This is a tool, not a manifesto poster. It exists to be **opened and consulted**, not just read once. Specific moments when this document earns its keep:

- **Before writing or rewriting any landing copy** → re-read the epigraph, §1 (manifesto), §3 (one-line truth as operational projection), §4 (the two pillars), and the relevant Layer in §11. The new copy must trace back to "open the closed" without contortion. If it doesn't, rewrite the copy, not the document.

- **Before a live conversation with a senior engineer** → skim §7 (jobs to be done) and §8 (industrialization framing). Pick the job that fits the listener. Bring an elevator pitch from Appendix A as the opening line. Do not improvise the framing in front of someone whose pattern-matching is sharp.

- **Before any large site rewrite** → re-read all of §13 (guardrails). They are the things you'll forget without prompting. They are also the things that, once broken, take weeks to undo.

- **When something in the product changes meaningfully** → §5 rule applies: fix this document first, then the assets. Bump the version in the frontmatter and add a changelog entry. The day this stops happening is the day the document stops being load-bearing.

- **When tempted to add executive-targeted copy to the public site** → re-read §6 and §16. The answer is no. The senior network is a future channel, not a present audience.

- **Once every two weeks, regardless** → re-read the epigraph, §1, §13, §17. Five minutes. Ask: *is this still true? has the product moved? have I drifted?* If yes — patch the document the same day.

The document is allowed to be wrong. It is not allowed to be silent or stale. A wrong document can be fixed in one commit; a stale document quietly poisons every piece of copy written from it.

---

## 1. The manifesto

**Open the closed.**

Every layer of modern software is being quietly closed. Vendors lock the industry into their APIs, formats, and billing. Large engineering organizations hoard internal platforms that everyone else reinvents from scratch. Tools lock the dev loop into UIs that can't be read, diffed, or owned. Each year, the working engineer owns a little less of their own stack.

KB Labs is built on one principle: **whatever has been closed, open it back up** — in code, not in slogans.

- Workflows you write instead of click.
- Infrastructure behind contracts, not vendor SDKs.
- Agents that run on your own machine with full audit.
- An open-source core that is meant to be used, forked, extended, and owned.

This manifesto predates the product. It is the founder's long-standing position, not a marketing frame. Every feature, every architectural decision, every piece of copy on the site must be traceable to it.

---

## 2. Origin — three problems KB Labs was built to solve

KB Labs was not designed top-down from a market analysis. It grew out of three concrete, accumulated problems the founder lived through. These are the load-bearing reasons the product exists, and they map cleanly to the three main surfaces of the platform.

### 2.1 Routine erodes the profession

Engineers spend a significant share of their week on repeatable manual work that nobody wants to do but everyone has to: releases, changelogs, reviews, QA gates, cross-repo bookkeeping, environment setup, agent orchestration by hand. This is not a time problem — it is a dignity problem. A workflow engine that treats this work as code, not as tribal knowledge, gives the profession its time back.

→ This problem shaped **Workflows** — the programmable, code-first workflow engine.

### 2.2 Internal developer platforms are a class privilege

Large engineering organizations build serious internal developer platforms for themselves: unified SDLC, standardized CI, shared infrastructure, agent orchestration, observability, release automation. Everyone else glues bash scripts together for years because nobody gives them a working version of the same. The gap is not about talent — it's about access to platform engineering.

KB Labs is the public, open-source answer to that gap. Built in the open, usable by a team of two or a team of two hundred, with no artificial tiering of what's available.

→ This problem shaped the **OSS-core posture, the plugin system, and the marketplace**.

### 2.3 Vendor lock-in is an architectural tax

Every product that directly imports a vendor SDK pays a tax forever: price hikes, deprecated APIs, broken migrations, rewrites when the business needs to switch providers. Experienced architects avoid direct vendor dependencies the same way they avoid global state — on principle, before it hurts.

KB Labs carries this principle into the code itself. The platform has **zero direct vendor dependencies in the core**. Every external service — LLM, cache, database, vector store, object storage, event bus, analytics, logging — sits behind a contract interface. Swapping a vendor is a configuration change, not a rewrite.

→ This problem shaped the **Gateway** and the entire **adapter contract layer (HAL)**.

### 2.4 What the three add up to — the three dimensions of "open the closed"

The epigraph at the top of this document — *open the closed* — is abstract until you say *what* has been closed. The three angers above answer that, in concrete terms. Modern software development quietly takes three things from the engineer:

- **Time**, drained by routine.
- **Access**, walled off behind internal-only platforms.
- **Control**, surrendered to vendors.

These are not three independent thesis points. They are **the three concrete dimensions of "open the closed"** for the working engineer. Each one names a specific thing that has been closed off, and each maps to one part of the platform that opens it back up:

- Workflows open up *time* — by turning routine into code instead of tribal knowledge.
- The open OSS core opens up *access* — by giving everyone a real platform engineering layer, not just companies that can afford one.
- The adapter layer opens up *control* — by putting every external vendor behind a contract instead of a direct dependency.

Whenever the document or the copy talks about "opening the closed", it should be possible to point at exactly which of these three dimensions is being addressed. The phrase is the philosophy; *time, access, control* is its operational decomposition.

---

## 3. The one-line truth — operational projection of the manifesto

The manifesto at the top of this document is *open the closed*. That phrase is the philosophy. It is sharp and load-bearing inside the founder's head, but it is too abstract to do the work of an opening line on a homepage written for tired engineers. So §3 exists to translate the manifesto into a sentence that lands on the actual reader the public site is built for.

**KB Labs is an open-source platform for developers who want their stack back.**

Programmable workflows. Vendor-free infrastructure. Agents you can trust. All in code, all on your own infra, all yours.

This is the **operational projection** of "open the closed" for the developer audience — not a parallel formula, not a competing slogan, not a replacement. *Getting your stack back* is what *opening the closed* feels like when you are the engineer who has been losing pieces of their stack year after year. The manifesto is the philosophy; the one-line truth is what the philosophy sounds like in the reader's own voice.

This is the sentence every other sentence on the public site has to live up to. If a paragraph, feature card, or CTA cannot be traced back to "giving the developer their stack back" — it doesn't belong. And if "giving the developer their stack back" itself ever drifts away from "open the closed" — the document, not the manifesto, is what gets fixed.

---

## 4. The product — two pillars and a foundation

KB Labs is one product, expressed on two pillars that share a common foundation. The pillars are structurally equal — both are real entry points, both bring real users in, both have to be told as full stories on `/product`. They are not equal, however, in *where on the homepage they appear*: one of them carries the hero, the other lives below the fold. That distinction is about Layer 1 attention, not about product hierarchy. See §11.

The pillars are what users *come for*. The foundation is what makes them *stay*.

### 4.1 Pillar 1 — Workflows *(carries the homepage hero)*

A programmable engine for describing dev and release automation as code. Not CI — CI is a narrow case of this. Not a low-code tool — everything is readable, diff-able, version-controlled. Not an agent SDK — agents run *on top of* Workflows as a first-class primitive, not as the product itself.

**What Workflows does:**

- Runs release pipelines, review gates, QA regressions, commit policies, and custom automation as a single coherent system.
- Treats AI agents as regular steps in the workflow, with sandbox, audit, and observability built in — not as a separate risky process.
- Lets you write workflows in code, share them as plugins, and compose them into products.
- Works alongside your existing CI, not instead of it.

**Why it carries the homepage hero:** it is the surface most developers recognize first, because routine is the most visceral pain — every team has it, every day, regardless of size or stack. Its hook is also the easiest to feel in ten seconds: *"you are drowning in glue scripts and YAML, and you know there's a better way."* Gateway's hook is just as sharp, but it requires the reader to already know they have an infrastructure problem — which not every Layer-1 visitor knows about themselves yet. Hero attention goes to the more universal pain; the second pillar gets the next slot on the page, not a later page.

### 4.2 Pillar 2 — Gateway *(structurally equal, lives below the fold)*

A unified contract layer for every external service a product touches: LLM providers, cache, SQL and document databases, vector stores, object storage, event bus, observability, and more. One set of contracts, swappable implementations, zero product rewrites when the vendor changes.

**What Gateway does:**

- Presents a single, stable interface for each infrastructure category.
- Ships with around twenty-one adapters maintained in the open, covering the most common vendors (OpenAI, SQLite, MongoDB, Redis, Qdrant, Pino, Docker, local filesystem, git worktrees, and others).
- Allows companies to write their own adapters against the same interfaces — private, public, whatever the business needs — and they load identically to the public ones.
- Adds multi-tenant routing, audit, and observability as a built-in layer across all of it.

**Why it lives below the fold rather than in the hero:** not because it is weaker — it is not — but because the "AI Gateway" category is crowded and narrow, and a hero that opens with the word "Gateway" gets read as one more LLM proxy and dismissed. KB Labs Gateway is a full infrastructure abstraction layer, not an LLM proxy, and that story needs about thirty seconds to land. Thirty seconds is not a hero, it is a Layer-2 section. There the reader has already chosen to keep reading and is willing to absorb a sharper claim. The Gateway hook is co-equal with the Workflows hook on the page — it just runs second in vertical order, with its own headline, its own one-paragraph pain, its own example, and its own clear path into `/product`.

**The sharpest single hook inside Gateway** — worth naming explicitly because almost nobody is seriously solving it — is the **event bus abstraction**.

Most mature engineering organizations carry a quiet, unresolved scar: a broker they picked years ago that doesn't fit anymore. Redis Pub/Sub chosen when the product was small and now failing under real load. RabbitMQ chosen when ordering mattered, and now the team needs Kafka for analytics. NATS adopted for one service, with every other service still on something else. The migration is never a week of work — it is months of platform engineering, touching every producer and every consumer, with a long tail of subtle bugs in delivery semantics. Teams postpone it until it becomes an emergency.

KB Labs takes a position on this: **the broker should be a configuration line, not an architectural decision that hardens over three years.** And the load-bearing point is that **the extension point is open today**. The `IEventBus` contract and the runtime adapter loader are production code right now, in `@kb-labs/core-platform` and `@kb-labs/core-runtime`. The public catalog ships one reference adapter in the open. But that one adapter is not the limit of the mechanism — it is one example of it. Any team that wants Kafka, RabbitMQ, NATS, or any other backend can write their own adapter against the same interface today, in their own repository, private or public, and it loads into the runtime identically to the public ones. No waiting on us, no roadmap dependency, no "come back when we ship Kafka." The door is already open.

The common broker adapters are on the public roadmap and the catalog will grow over time. But the value for a platform lead is **already there today**, not in the future. The contract exists, the loader is production, the extension surface is documented, and the producer/consumer code in your service does not change when you swap the backend behind it. A team can solve their migration problem with this **right now**, against an interface that ships, with an adapter they own. For a class of engineering organizations already hurting from this exact problem, that capability alone is enough to start a real conversation — and it is one of the few places where KB Labs is honestly stronger than what exists in the market.

We are careful with the language here. We **do not say** "KB Labs supports Kafka" or "works with RabbitMQ out of the box" — those are product claims and they would be false until those adapters ship in the public catalog. We **do say** "the extension point is open today, write your own against the same contract, it loads identically to ours." That is a capability claim and it is true. The distinction is small in words and large in honesty. See §13#11 for the discipline this depends on.

### 4.3 The foundation — the adapter layer (HAL)

Underneath both pillars sits a formal contract layer. It has two parts, with a deliberate boundary between them. The boundary is not cosmetic — it is enforced in the code itself, and every piece of copy must respect it.

**Public adapter contracts — the vendor layer.**
About seventeen contracts, each one a TypeScript interface in `@kb-labs/core-platform` paired with a formal adapter manifest (`implements: "I<Name>"`). They cover every external dependency a product normally touches: LLM, embeddings, cache, SQL / document / key-value / time-series databases, vector store, object storage, event bus, analytics, logger, log persistence, workspace backend, execution environment. Around twenty-one adapter packages ship in the open today, covering the most common vendors — OpenAI, SQLite, MongoDB, Redis, Qdrant, Pino, Docker, local filesystem, git worktrees, and more. Third parties — including companies adopting KB Labs internally — write their own adapters against the same interfaces, and they load identically to the public ones. **This is the extension surface. Anyone can build here.**

**Internal platform contracts — the engine itself.**
The workflow runtime, plugin system, agent runtime, state broker, resource broker, marketplace, and policy engine are also built on contracts. But those contracts are not adapter points — they are the platform itself. They are extended through **plugins** (workflow steps, CLI commands, agent tools), not through vendor swaps. All of this is open source, but it is never marketed as "swap the workflow engine." The engine is the thing you build on top of; the adapters are the thing you swap underneath it.

This separation is the technical realization of Anger #3. The product has **zero direct vendor dependencies in the core** — every external system is reached through an adapter contract. The internal engine stays stable while the vendor layer underneath is completely replaceable. That is the part that is defensible, and that is the part that compounds every time a new adapter is added.

The HAL is not marketed as a separate product. It is explained inside `/product` and in the docs, as the foundation that makes both Workflows and Gateway possible. But strategically, it is the **defensible moat** — because building the HAL took years of interface design work, and because every new adapter added to the catalog makes the next vendor migration cheaper for every existing user.

### 4.4 Why this is one product, not three

Workflows, Gateway, and the HAL are often described separately because each has a distinct user story. Internally, they are one product: Workflows call into Gateway, Gateway uses the HAL, the HAL is what lets the platform stay vendor-free end to end. Marketing them as three products dilutes all three. Marketing them as one product with two visible surfaces and a foundation underneath keeps the story clean.

---

## 5. Stage and commercial posture

**Stage: private beta.** The platform works end-to-end on its happy path and is stable enough for early adopters. Broader reliability guarantees are still being built. We say this explicitly — it builds trust, not hesitation.

**Commercial model today: OSS core, self-hosted, no paid features.** This is both the honest current state and the right choice for building initial adoption.

**Commercial model tomorrow:** a commercial layer is planned and explicitly on the roadmap — enterprise features, team plugins, managed offerings. The door to this layer must never be closed by current copy.

**Rules for commercial language:**

- Never say "free forever." Say "open-source core."
- Never say "self-hosted only." Say "self-hosted today."
- Never claim "100% open source" in absolutes. Say "open-source core with a commercial layer on the roadmap."
- The SaaS waitlist lives in the footer and in a low-key section of the pricing page. It is never promoted on the homepage.

**What KB Labs is not, at this stage:**

- Not an "enterprise platform." We don't claim enterprise readiness we haven't earned.
- Not a CI replacement. KB Labs works alongside existing CI.
- Not a low-code tool. Everything is code-first.
- Not a LangChain competitor. LangChain is an SDK for building agents. KB Labs is the runtime where agents actually run.
- Not "trusted by Fortune 500." Early adopters only, and we name them when they exist.

---

## 6. Audience

### 6.1 One audience, one voice

KB Labs has one audience: **developers and tech leads in small-to-mid teams (roughly 2–50 engineers)** who are building real products and feeling the routine drown them. The site, the README, the blog, the cold DM, the conference talk — all of it is written for this person. There is no second audience that the public copy needs to serve. When the temptation appears to "also speak to leadership" inside the same paragraph, the result is always grey marketing text that lands with neither side. The rule is simple: **write for the developer, end to end.**

The public-facing positioning ends here. Engineering leadership exists as a future distribution channel, not as a target reader of the site — that conversation lives in §16 as an internal note, not as a marketing audience.

### 6.2 Primary ICP — the person the website talks to

A developer or tech lead in a team of 2–20 people, working on a real product (not a side project), already using or experimenting with AI tools (Claude Code, Cursor, agent frameworks), currently maintaining a growing pile of shell scripts, YAML pipelines, and manual steps that nobody else on the team fully understands.

**What they feel:**
- Specifically tired — not "I'd like a tool" tired, but "I'm losing hours a week to glue code and I know there's a better way" tired.
- Skeptical of marketing. Fluent in bullshit detection.
- Open to OSS, suspicious of SaaS-only pitches.
- Excited about AI agents but burnt by the gap between demos and production.

**What they want:**
- One engine to describe their dev loop as code.
- A safe place to run AI agents, with audit and sandbox.
- Code-first tools, not click-first.
- Self-hosted by default.
- Honest communication about what works and what doesn't.

**What they reject on sight:**
- "Enterprise platform" framing.
- Architecture diagrams above the fold.
- Three pricing tiers when only one is real.
- Logos of companies they don't recognize labeled "trusted by."
- Any copy that could appear on any other SaaS site without changing a word.

---

## 7. Jobs to be done

When a user arrives at KB Labs, they are hiring it to do one of the following jobs. The homepage and product pages should make these jobs immediately recognizable.

**Primary jobs (lead with these):**

1. **Replace the glue tax.** "I have thirty ad-hoc scripts and a CI setup held together by tribal knowledge. I want one engine that holds all of it as code."
2. **Run AI agents safely.** "I want to use agents in my real dev loop, but I'm not running them outside a sandbox, and I'm not shipping them without audit and observability."
3. **Describe the dev loop as code, end to end.** "Releases, reviews, QA gates, automation, agents — all of it, in one source of truth I can read, diff, and PR."
4. **Tame the monorepo.** Adjacent but common entry point — many users arrive through monorepo pain and stay for the rest.

**Secondary jobs (discovered after arrival, especially by larger orgs):**

5. **Stop hand-wiring every external service.** "Every product we build re-implements cache, DB, vector store, event bus, LLM client, storage. I want one contract for all of them so I can swap vendors without rewrites."
6. **Stop being trapped by an early broker choice.** "We picked Redis Pub/Sub three years ago and now we need Kafka. The migration is a quarter of engineering work. I want the broker to sit behind a contract so the next migration is a sprint instead of a quarter — and I want that contract to be designed by someone who has thought about this class of problem seriously, not bolted on after the fact."
7. **Industrialize AI agents in production.** "My team wrote five agents and none of them behave the same way twice. I need predictable, observable, governable agent execution — not another agent framework."

Jobs 1–4 are the **entry jobs**. They bring users in through the Workflows pillar. Jobs 5–7 are the **deepening jobs**. They surface inside the product once a user is already engaged, and they are what convince engineering leadership that KB Labs is more than "another workflow tool."

---

## 8. The "industrialization of AI agents" framing

This is the positioning angle that resonates most strongly with experienced developers and tech leads — the people who have already tried to put AI agents into a real dev loop and watched it fall apart. It is the framing of choice on `/product` and in technical content.

**The problem, stated the way an experienced engineer hears it:**
Everyone in 2026 is trying to put AI agents into a real dev loop. Almost everyone is stuck. The reason is always the same: agents work unpredictably, integrate with infra ad-hoc, and cannot be governed like the rest of the system. You can't ship what you can't reproduce.

**The analogy that makes it click:** McDonald's does not produce predictable output by hiring better cooks. It produces predictable output by standardizing the inputs — the suppliers, the equipment, the processes, the training. The variability in people is absorbed by constraints in the environment. KB Labs applies the same principle to AI agents: Workflows define the processes, plugins define the equipment, adapter contracts define the suppliers, the marketplace defines the training, the baseline gates define the quality controls. The agent operates inside an environment that forces its output to be predictable.

**Why this framing is powerful:**
- It names the exact problem the reader is currently failing to solve in their own repo.
- It translates a technical platform into an outcome the reader cares about (predictable agent execution in their dev loop).
- It uses an analogy every listener already understands in under ten seconds.
- It is honest — it actually describes what the platform does.

**Where to use it:**
- On `/product` as the headline framing of the AI-agent story.
- In technical blog posts.
- In any direct conversation where the listener is already past the "is this a toy?" question.
- Not on the homepage hero — the homepage still leads with the immediate developer pain (glue code, broken CI, manual steps), because that is the door the reader walks through first.

---

## 9. Competitive frame

In the user's head, KB Labs will be compared against some subset of the following. The table below gives the honest comparison, not the marketing one.

| Compared against | Their strength | KB Labs angle |
|---|---|---|
| **GitHub Actions + custom scripts** | Ubiquitous, free with the repo, good at build/test/deploy. | CI is narrow. KB Labs covers everything around CI — agent orchestration, release pipelines, custom automation, review gates — as first-class, code-first, composable. Works alongside CI, not instead of it. |
| **n8n / Zapier / low-code tools** | Fast to start, visual, good for non-technical teams. | Code-first. Readable, diff-able, PR-able. Built for developers, not operators. Version control and review processes apply to workflows the same way they apply to any other code. |
| **Temporal / Dagster** | Mature workflow engines with strong execution guarantees. | Designed for the AI-era dev loop from day one. Agents, LLM calls, and AI-era primitives are first-class, not bolted on. Open core, self-hostable, no per-execution SaaS billing model. |
| **LangChain / LlamaIndex / agent frameworks** | SDKs for building agents. | KB Labs is not an SDK for building agents — it is the runtime where agents *run*. Workflows, sandbox, observability, audit, infrastructure contracts. Agents built with any framework fit inside KB Labs as steps. |
| **Internal platform teams' homegrown stacks** | Custom-fit to the org, deeply integrated. | Stop rebuilding the same thing every time. Adopt the open-source version, contribute back what's specific, keep engineering focused on the product — not on maintaining three ad-hoc internal platforms. |
| **Generic "AI Gateway" products** | Narrow focus on LLM routing and cost management. | KB Labs Gateway is a full infrastructure abstraction layer — LLM is one of many adapters. Broader scope, deeper architectural value, defensible against the crowded AI-Gateway category. |

**The single defensible angle, stated once:**
Every workflow engine on that list was designed before LLMs and AI agents became part of the daily dev loop. KB Labs is the first one designed *with* them as first-class citizens, on an open foundation that lets the user own every layer of the stack underneath.

---

## 10. Messaging

### 10.1 What we say

- Open-source core, self-hosted.
- Built for the AI-era dev loop.
- Programmable, code-first, PR-able.
- Workflows, agents, observability, and plugins in one system.
- Private beta — early adopters welcome, the founder reads every issue.
- Honest architecture. ADRs are public. The blog has real technical depth.
- Built by a developer who got tired of being a tenant in his own stack.
- Includes a built-in infrastructure layer that lets you swap any vendor without rewrites *(one line, mentioned as a natural extension of the story).*
- Around seventeen public adapter contracts, around twenty-one open adapters, zero direct vendor dependencies in the core. *(Hard numbers, safe to use, updated as the catalog grows.)*
- On the event bus specifically: **the `IEventBus` contract and the runtime adapter loader are production code today. We ship one reference adapter in the public catalog. Any team can write their own Kafka, RabbitMQ, or NATS adapter against the same interface today, in their own repo, and it loads identically to ours. The common adapters are on the public roadmap and the catalog will grow over time, but you do not have to wait for us — the door is already open.** This is a capability claim, not a product claim — see §10.2 for the discipline that keeps this honest.

### 10.2 What we do not say

- "Enterprise-grade." "Production-ready at scale." "Trusted by Fortune 500." None of these are earned yet.
- SOC2, HIPAA, any compliance claim we don't actually have.
- Customer logos we don't have.
- "Free forever." "Self-hosted only." Anything that closes the door on a future commercial layer.
- "Replace your CI." This scares developers and is not what the product does.
- "Platform" as a hero word. It kills curiosity for developers. The word appears from `/product` onward, not on the homepage hero.
- Architecture diagrams above the fold. They belong in docs.
- Three pricing tiers presented as if they all exist today.
- **Adapter names for adapters that don't exist yet, framed as product claims.** Kafka, RabbitMQ, NATS, Postgres, Kinesis, S3 — none of these are listed as "supported", "shipping", or "works with" until a real package with a manifest exists in the public repo. The discipline: **product claims** ("we support X", "ships with Y", "works with Z out of the box") are forbidden until the adapter ships. **Capability claims** ("the extension point is open today, write your own adapter against the same contract, it loads identically to ours") are encouraged because they are accurate — the `IEventBus` contract and the runtime loader are production code, and any team can extend them right now. The distinction is small in words and large in honesty: we do not over-claim shipped adapters, and we do not under-claim the extension capability. Both failure modes are regressions.
- **"Adapter" applied to the workflow engine, agent runtime, or plugin system.** These are the platform itself. Adapters are the vendor layer underneath. Collapsing the two weakens both stories and is easy to fact-check against.

### 10.3 Tone of voice

- **Direct, technical, honest.** If a sentence could appear on any other SaaS site without changing a word, delete it.
- **First-person where it counts.** "I built this because…" is stronger than "We help teams to…" — especially at the founder-led stage.
- **Code > screenshots > illustrations.** Developers trust code. The homepage should show code.
- **One human behind the product.** The founder's name, voice, and position are visible. At this stage, personal brand and product brand are the same thing, and that is a feature.
- **Beta-honest.** Saying "we're in private beta" is a trust signal, not a weakness.

---

## 11. Information architecture — progressive disclosure

The platform is large. The site must not feel large. The solution is not to hide complexity — it is to layer it. Each layer shows only what that layer's reader needs.

**Layer 1 — Homepage hero (10 seconds).**
One sentence that names the pain and the answer. One clear action: look at the code, install, or star on GitHub. No "platform" word. No diagrams. No pricing. No enterprise language.

**Layer 2 — Homepage below the fold (one to two minutes).**
This is where the page splits into the two pillars. Both hooks live here, side by side in vertical order, each as a self-contained section the reader can recognize themselves in.

- **Section A — the routine hook (Workflows).** "You are drowning in glue scripts, broken CI workarounds, and manual release steps that nobody else on the team fully understands." Three use cases written as pains the reader recognizes in themselves. One short code example. One short demo (GIF or video). Clear path to `/product#workflows`.

- **Section B — the infra-lock-in hook (Gateway).** "You picked Redis Pub/Sub three years ago, now you need Kafka, and the migration is a quarter of engineering work — and that's just one of five vendors you can't easily move off." One sharp paragraph naming the broker scar specifically. One short code example showing the same producer/consumer working against two different backends through the same contract. Clear path to `/product#gateway`.

Both sections also contain one personal sentence from the founder somewhere in this layer, and a path to the GitHub repo. The two sections are visually equal in weight — same heading size, same density. The reader picks the one that hurts more and follows it.

**The order is fixed: routine first, then infra lock-in.** Not because Gateway is weaker — see §4 — but because the routine pain is more universal, more visceral in the first ten seconds, and serves as the wider funnel. The reader who keeps scrolling past Section A is exactly the reader who will recognize themselves in Section B. The reverse is less reliable.

**Layer 3 — `/product` (three minutes).**
The first place the word "platform" appears. Workflows is presented as the main surface. Gateway appears as one dedicated section, framed as "and because vendor lock-in is unacceptable, we also built this." The adapter layer is explained as the foundation underneath both. Plugins, observability, and the marketplace appear as feature sections, not as separate top-level pages.

**Layer 4 — `/docs`, `/architecture`, ADRs.**
The full technical story: state broker, Mind RAG, marketplace internals, agent runtime, plugin system, multi-tenancy, security model, adapter contracts, extension guides. This is where the technically curious reader goes when they want to verify that the platform is as serious as the homepage claims.

**The rule:** a deeper layer never leaks into a shallower layer just because the content is technically impressive. Right reader, right depth, right moment.

---

## 12. Distribution channel — public web

There is one public distribution channel for KB Labs at this stage: the public web — site, repo, blog, technical content, OSS communities. Everything in this document is written to serve that single channel.

- **Goal:** reach developers and tech leads who feel the pain. Get them to the repo, into the community, running their first workflow.
- **Funnel:** site → GitHub star → install → first workflow → community (issues, discussions, Discord/Telegram, blog).
- **Voice:** developer-to-developer. Honest, technical, code-first.
- **Assets:** homepage, `/product`, `/docs`, blog, GitHub, public channels.
- **Success signal:** depth of engagement. Active installs, real issues, real contributors. Stars are a vanity signal and are tracked but not prioritized.

A second channel — direct outreach into the founder's existing network of senior engineering contacts — exists, but it is **a distribution lever for later**, not a marketing audience the site is written for. It is documented separately in §16 as an internal note, not as part of public positioning.

---

## 13. Strategic guardrails

These are the rules that, if broken, quietly kill the positioning. Re-read before any large change to the site, the copy, or the pitch.

1. **Write for the developer, end to end.** No paragraph should drift into "executive summary" voice or "for leadership" framing. There is one reader: the engineer who feels the pain. If a sentence sounds like it was written for a budget approver, delete it.
2. **Do not lead with "platform."** Lead with the pain and the engine. "Platform" is a Layer-3 word.
3. **Do not put Gateway in the hero. Do not bury it past the homepage.** Gateway is structurally co-equal with Workflows and lives below the fold, in its own dedicated Section B (see §11). It does not appear in the Layer-1 hero (the word "Gateway" reads as "AI proxy" in ten seconds and gets the page dismissed). It also does not get demoted to a `/product`-only mention — that loses the broker-scar reader entirely. The exact slot is Layer 2, second section, equal visual weight with Workflows. Anything else is a regression in either direction.
4. **Do not fake traction.** No fake logos. No inflated numbers. No "trusted by" without real names. Internal dogfooding metrics are fine when labeled honestly.
5. **Do not close the door on a future commercial layer.** No "free forever," no "self-hosted only," no anti-cloud framing.
6. **Do not run seven parallel solution pages.** Two pillars and one flagship use case. Everything else is feature documentation inside `/product`.
7. **Do not hide the founder.** At this stage, the founder is the brand. Name, voice, face, blog, ADRs — all visible.
8. **Do not add a feature to the homepage because it is technically impressive.** Add it only if the Layer-1 reader needs it to decide whether to keep reading.
9. **Do not write in marketing voice.** If a sentence sounds like any other SaaS landing page, delete it.
10. **Do not measure success by traffic volume.** At this stage, success is depth. Five real users beat five thousand bounces.
11. **Do not list adapters that do not ship.** Before any vendor name appears in marketing copy as "supported", there must be a real package in the repo with a manifest and an `implements:` binding. Roadmap items are labeled as roadmap, explicitly. This is the single claim that a technical CTO will fact-check first, and it must hold.
12. **Do not blur the boundary between adapter contracts and internal contracts.** Adapters are the vendor swap layer — LLM, cache, database, vector store, event bus, logger, workspace, environment, and so on. The workflow engine, agent runtime, plugin system, and state broker are not adapters; they are the platform itself, extended through plugins. Marketing copy must preserve this distinction because the whole "vendor-free core" story depends on it.

---

## 14. Open strategic questions

These are decisions deferred on purpose. They do not block execution, but they will need answers as the product matures.

1. **Naming.** Is "KB Labs" the long-term brand? Does the workflow engine need a shorter, more memorable product name of its own?
2. **Flagship use cases for Layer 2 — one per section.** Layer 2 is now two sections (Workflows / routine pain, Gateway / infra lock-in), and each needs its own anchor use case. Section A working bet: AI-powered code review with full audit — visceral, visual, easy to demo, sits on top of Workflows + agent runtime. Section B working bet: the broker-as-a-config-line story (one producer/consumer, one contract, swap the backend) — sharp, technical, falsifiable. Both need real demos before commitment.
3. **Pricing page shape.** Keep three visible tiers with the future ones marked as roadmap? Or collapse to one tier today ("OSS core") with future tiers mentioned only in a footer?
4. **Marketplace prominence.** How visible should the plugin marketplace be in Layer 2 vs Layer 3? It's a real moat but adds complexity to the first impression.
5. **Dedicated Gateway landing page — eventually.** The "unified infrastructure abstraction" framing is strong enough to justify its own page for platform teams who arrive specifically for that job. Not now. After Workflows has traction.
6. **Dedicated insider surface — eventually.** A private page or invite-only experience for the senior-network distribution lever described in §16, separate from the public site. Open question: needed at all, or does direct founder-led outreach + the public site as legitimization cover it entirely? Leaning toward "not needed" until proven otherwise.

---

## 15. Next steps — implementation order

Once this document is accepted as the source of truth, the marketing site rewrite follows this order. Each item is a standalone task.

1. **Homepage hero (Layer 1).** Rewrite around the one-line truth and the developer pain. Remove "platform" from above the fold.
2. **Homepage below the fold (Layer 2) — two equal sections.** Section A (Workflows / routine pain): three use cases in the developer's own voice, one code example, one demo. Section B (Gateway / infra lock-in pain): one sharp paragraph naming the broker scar, one code example showing the same producer/consumer working against two backends through one contract. Equal visual weight, fixed order (A then B), one founder quote somewhere across the layer.
3. **`/product` restructure (Layer 3).** Workflows and Gateway as two co-equal top-level sections (`/product#workflows` and `/product#gateway`), each linked from its respective Layer-2 hook. Adapter layer explained as the foundation underneath both. Plugins, observability, marketplace as feature sections inside `/product`, not as separate pages.
4. **Delete or merge the extra solution pages.** Code Intelligence, Code Quality, Observability, Platform API should be consolidated into `/product` sections or docs — not standalone top-level pages.
5. **Pricing page.** Make today's reality (OSS core, free) visually dominant. Future tiers clearly marked as roadmap, low-key, honest.
6. **Trust strip.** Relabel internal dogfooding metrics explicitly so they cannot be misread as customer traction.
7. **Founder voice on the homepage and about page.** Name, photo or signature, personal quote, link to the founder's blog and channel.
8. **Footer SaaS waitlist.** Quiet, honest, not promoted on the homepage.

Each of these becomes its own task once the document is locked.

---

## 16. Distribution lever — internal note (not public-facing)

> **Status:** internal operational note. **Not** part of the marketing positioning. Nothing in this section appears on the website, in copy, in talks, or in cold outreach. It exists so that the founder, when planning future distribution, has the context written down in one place.

The founder has, over a decade of working in the industry, accumulated a personal network of senior engineering contacts — heads of platform, staff+ engineers, directors, CTOs, founders of infrastructure-adjacent companies. This network is real and reachable. It is **not** a marketing audience right now. It is a **distribution lever for later**, to be activated deliberately, after the product and the public story are both ready to survive that level of scrutiny.

**Why it is not in §6 and not in §12:**

- These contacts are not the people the website is written for. Writing the site to also serve them would dilute the developer voice and produce grey marketing text — exactly the failure mode the rest of this document is built to avoid.
- They will not be convinced by a landing page anyway. They will be convinced — if at all — by the founder, by a private demo, and by a real conversation about their actual problem.
- Treating them as a present-day audience creates pressure to add "enterprise" framing to the public site, which destroys the developer-trust loop.

**When to activate this lever:**

- After Workflows has clear, demonstrable traction in the public channel — real installs, real issues, real contributors, ideally one or two named OSS users.
- After at least one technical blog post and one conference-grade talk exist as artifacts the founder can send.
- After the platform has survived a real outside user reporting bugs and getting them fixed.
- Roughly aligned with the launch roadmap window (see `project_launch_roadmap.md` in personal memory). Not before.

**How it will be used when activated:**

- Direct conversation → private demo → early access → real usage → references and second-order introductions.
- Founder-to-founder voice. Specific to the listener's actual problem (most often: how to industrialize AI agents in their own dev loop).
- The public site exists as **legitimization** at that point — the place the founder sends a link so the thing on the other end looks serious. Its job for this channel is "do not embarrass," not "convert."
- Success metric: 5–15 real engineering organizations using KB Labs against real problems and giving honest feedback. This beats any number of stars.

**Hard rules for this section, even though it is internal:**

1. The existence of this network does **not** justify adding leadership-targeted copy to the public site. Ever.
2. No specific number of contacts appears in any public asset. The number is private.
3. No "trusted by" or "advised by" framing using these contacts unless they have explicitly agreed and there is a real engagement to point to.
4. This section can be removed from the document entirely if the founder later decides the lever will be activated through a different mechanism (e.g., a separate insider surface). It is documented here only because the alternative — keeping it in the founder's head — loses information.

---

## 17. Hypotheses, not facts

Most of this document is written in declarative voice — "the audience is X", "the hook is Y", "the pillars are co-equal", "the broker scar resonates". That voice is correct for a strategy document. But it hides something important: **a meaningful chunk of what is asserted here has not yet been tested against a real outside reader**. These are working positions, not data. If they turn out to be wrong, the document gets patched, not defended.

This section exists so that the founder, six months from now, can tell at a glance which parts of the document are *known* and which parts are *bets the document is currently making on his behalf*. Without this section, the declarative tone of the rest of the document creates false confidence — and false confidence is what makes people defend wrong positioning instead of fixing it.

**Every item below is followed by a falsifier — the specific signal that would confirm or kill the hypothesis.**

### 17.1 Audience and ICP

**Hypothesis:** The primary ICP described in §6.2 — *developer or tech lead in a 2–20-person team, building a real product, drowning in glue scripts and YAML* — is actually the person who will install KB Labs first.

- **Source:** Founder's intuition from his own career and the people in his network. No live install data yet.
- **Falsifier:** After the first 20–50 real installs from the public channel, look at who actually showed up in issues, Discord, and email. If the modal installer is someone different (e.g. solo indie hacker without a team, or platform engineer at a 500-person org), §6.2 needs to be rewritten around the real installer, not the imagined one.

### 17.2 The two hooks

**Hypothesis:** The routine hook (Workflows) and the infra-lock-in hook (Gateway) are *both* strong enough to bring real users in, and both deserve equal weight on the homepage.

- **Source:** Founder's reading of two distinct pains he hears in conversations. Untested at scale.
- **Falsifier:** Track which Layer 2 section drives more clicks into `/product` and more GitHub stars in the first month after the rewrite. If the ratio is dramatically lopsided (worse than 4:1 in either direction), the weaker hook either needs a sharper formulation or should not be co-equal in Layer 2.

### 17.3 The Workflows hook order

**Hypothesis:** Routine pain is more universal than infra lock-in pain, which is why it carries the hero and Workflows comes first in Layer 2.

- **Source:** §4.1 reasoning + founder's intuition. Plausible, not proven.
- **Falsifier:** If the broker scar in Section B turns out to convert better than the glue tax in Section A, and that pattern holds for more than a month — flip the order. The "more universal" claim is a bet, not a fact.

### 17.4 The event bus story in live conversation

**Hypothesis:** The broker-scar story in §4.2 (*"the broker should be a configuration line, not an architectural decision that hardens over three years"*) lands hard on senior platform engineers and is enough to start a real conversation, even though no Kafka/RabbitMQ/NATS adapter ships yet.

- **Source:** Founder's read of the pain. Not yet told live to a senior platform engineer who actually has the scar.
- **Falsifier:** First five live conversations with platform leads where this story comes up. If the response is "interesting, come back when you ship the adapter" rather than "show me the contract" — the story is too early and needs to wait until at least one second broker adapter exists.

### 17.5 "Open the closed" in English, on a cold reader

**Hypothesis:** The phrase *"Open the closed"* resonates with developers who are not already inside the founder's head — including English-speaking readers who land cold from Hacker News, Reddit, or a tweet.

- **Source:** Founder's personal philosophy. The phrase is load-bearing internally; its external resonance is untested.
- **Falsifier:** Use it as the headline on a blog post or a tweet that reaches a non-Russian-speaking developer audience. If the post lands flat (no shares, no replies that quote the phrase, no resonance signals) — the phrase works inside the founder's head and possibly inside the document, but not on cold readers. In that case it stays as the internal manifesto and §3 carries the public-facing weight without it.

### 17.6 Founder-led legitimization for the §16 channel

**Hypothesis:** A developer-voiced public site, plus a founder-led private demo, will be enough to legitimize KB Labs in front of senior engineering leadership when §16 is activated. No separate insider surface or "for leadership" page is needed.

- **Source:** Founder's read of how this audience actually evaluates serious projects (technical depth + a real human + a working demo). Untested at scale.
- **Falsifier:** First three to five §16 activations after launch. If senior contacts repeatedly ask for materials the public site does not have ("do you have a one-pager for my CTO?", "is there a security overview I can share?", "do you have a deck?"), the assumption is wrong and §14 open question #6 needs a real answer — possibly a private surface, possibly extended `/docs` content explicitly written for evaluation by a non-installing reader.

### 17.7 OSS-core / no paid features as a trust signal

**Hypothesis:** Saying "open-source core, no paid features today, commercial layer on the roadmap" is a trust signal in 2026, not a weakness. Senior developers reward honesty over polish at this stage.

- **Source:** Founder's read of the post-VC-fatigue indie/OSS culture. Plausibly true, not yet measured against real cold traffic.
- **Falsifier:** If the pricing page, written exactly to §5 / §10 rules, drives meaningful drop-off rather than depth — the assumption that honesty converts is wrong for this audience and needs a different framing (likely sharper, more confident, less apologetic). Watch the first month of pricing page analytics specifically.

### 17.8 The §4 architectural depth survives without becoming product description

**Hypothesis:** This document can hold §4 in its current architectural depth (two pillars, foundation, public/internal contract boundary, ~17 contracts, ~21 adapters) without leaking that depth into public copy. The boundary between *internal precision* and *public clarity* will hold across multiple iterations.

- **Source:** §13 guardrails are written specifically to enforce this. They have not yet been stress-tested against real copywriting work.
- **Falsifier:** During the next two or three site rewrites, count how often draft copy slips into "platform / pillar / foundation / adapter contract" language because *the document made it sound load-bearing*. If it happens repeatedly even with §13 in front of the writer, §4 is too dense for an internal document that also serves as a copy reference, and needs to be split into two documents — a positioning doc and a separate architectural reference.

---

### How to use §17

- When something in this list **gets falsified** — patch the relevant section of the document the same day, bump the version, log the change. Do not let a falsified hypothesis sit in the document in declarative voice.
- When something in this list **gets confirmed** — move the item from §17 into the relevant section as a fact, with a one-line note (*"confirmed by N installs / N conversations / N replies on date X"*). The list shrinks as the project matures.
- New hypotheses get added here as they are noticed. The list is **expected to grow before it shrinks**, especially in the first three to six months after launch.
- If §17 ever becomes empty, that does not mean the strategy is finished — it means the founder has stopped noticing his own assumptions. Treat an empty §17 as a smell, not as a victory.

---

## Appendix A — Elevator pitches

Variants for use in direct conversations, DMs, and talks. Pick the one that fits the context and iterate in practice.

1. "KB Labs is an open-source platform for developers who want their stack back. Programmable workflows. Vendor-free infrastructure. Agents you can trust. All in code, on your own infra."

2. "It's the engine I wished existed when I was drowning in bash, broken CI, and running AI agents without a safety net. Open source, self-hosted, code-first."

3. "Think of it as the runtime where AI agents actually live in production — workflows, sandbox, observability, and an infrastructure abstraction layer that lets you swap any vendor without rewriting your product."

4. "KB Labs industrializes AI agents the way McDonald's industrializes food — standardized processes, standardized infrastructure, predictable output. Not by hiring better cooks, but by removing variability in the environment."

---

## Appendix B — Homepage hero candidates

Drafts for Layer 1. To be tested in practice, not committed prematurely.

**Option 1 — identity-led**
> **Get your stack back.**
> KB Labs is an open-source platform for developers who are tired of being tenants in their own infrastructure. Programmable workflows. Vendor-free architecture. AI agents you can actually trust. All in code, all on your own infra.

**Option 2 — pain-led**
> **Stop gluing scripts. Start shipping workflows.**
> KB Labs is an open-source engine for the AI-era dev loop. Describe releases, reviews, and agent-driven automation as code. Run it on your own infra. Built so the vendor underneath never decides how your product works.

**Option 3 — engine-led**
> **The workflow engine for the AI-era dev loop.**
> Open source. Self-hosted. Code-first. Workflows, agents, and a full infrastructure abstraction layer in one system — so you can finally own every layer of your stack.

**Option 4 — short and direct**
> **Open the closed.**
> KB Labs is an open-source platform for developers who want programmable workflows, vendor-free infrastructure, and AI agents they can trust — all on their own machine.
