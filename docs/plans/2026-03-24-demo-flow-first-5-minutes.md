# KB Labs — Demo Flow: First 5 Minutes

> **Status:** Draft
> **Created:** 2026-03-24
> **Goal:** New user goes from `curl install` to "wow" in under 5 minutes, with zero configuration.

---

## 0. Strategic Context

### Market gap

No existing tool combines local-first execution, plugin system, AI-native pipeline, and extensibility:

| | Local-first | Plugin system | AI-native | Pipeline |
|---|---|---|---|---|
| GitHub Actions | - | - | - | + |
| Husky / lint-staged | + | - | - | - |
| n8n / Zapier | ~ | + | ~ | + |
| Temporal / Prefect | + | - | - | + |
| danger.js | + | - | - | ~ |
| **KB Labs** | **+** | **+** | **+** | **+** |

KB Labs is not "another CI tool." It is a new category: **plugin-first engineering automation platform with AI built in**.

### Three engines

Each layer serves a different function in the growth model:

```
Demo pipeline    = adoption engine     (why people install)
Plugin system    = retention engine    (why people stay)
AI generator     = viral engine        (why people talk about it)
```

Build in this order. Ship in this order.

### What today looks like without KB Labs

Engineers glue together 5-8 tools (ESLint + Prettier + commitlint + semantic-release + danger.js + custom scripts + CI YAML). No unified policy, no audit trail, no local execution of the full pipeline. Adding AI review means yet another tool with its own config.

KB Labs replaces this Frankenstein with one platform where everything is a plugin, everything runs locally, and AI is a first-class citizen — not a bolt-on.

### Ultimate dogfooding argument

KB Labs (125 packages, 18 repos) is maintained by a single developer. This is only possible because the platform automates its own maintenance: agent-triaged bug reports, automated fixes with PR checks, baseline quality gates. If one person can sustain a platform of this scale — the automation works. This is the most honest proof point we have, and it should be part of the marketing story.

---

## 1. User Journey Overview

```
DISCOVER → INSTALL → CONSENT → FIRST WOW → ADOPT → EXPAND
  site      1 min     5 sec     3 min       day 1   week+
```

---

## 2. Stage-by-Stage Flow

### Stage 1: DISCOVER (website)

**Who:** Engineer or tech lead tired of CI glue, scattered scripts, inconsistent reviews.

**What they see:**
- Hero: "Replace script chaos with observable pipelines"
- Single CTA: `curl -fsSL https://kblabs.ru/install.sh | sh`
- Subtext: "See what KB Labs finds in your code — no signup, no API key"

**Goal:** User copies the command into terminal.

---

### Stage 2: INSTALL (1 minute)

```bash
# Step 1: install.sh downloads kb-create binary
curl -fsSL https://kblabs.ru/install.sh | sh
# → ~/.local/bin/kb-create

# Step 2: user runs on their project
kb-create --demo ~/work/my-saas
```

**What happens:**

```
KB Labs

Installing core...              12s
Installing demo plugins...      22s
  ✓ commit-policy
  ✓ ai-review
  ✓ qa-gate
                                ────
                                34s
```

- No questions asked during install
- `--demo` flag preselects the demo plugin set (commit, ai-review, qa-gate)
- ProjectDetector runs automatically, writes profile to `.kb/kb.config.jsonc`

**Output of ProjectDetector:**

```
Detecting project...
  TypeScript · pnpm · Next.js · 12 packages
  build: pnpm build
  test:  pnpm test
  lint:  eslint
```

**Goal:** Installed. Nothing was asked.

---

### Stage 3: CONSENT (5 seconds)

**This is mandatory. Code must never leave the user's machine without explicit permission.**

```
─────────────────────────────────────────────────

Demo includes AI-powered code review.
Your diffs are sent to KB Labs Gateway → OpenAI API.
No code is stored. 50 free calls included.

Details: kblabs.ru/privacy

? Run AI-powered demo?
  → Yes, run demo        diffs via KB Labs Gateway → OpenAI
  → Local only           no network requests, local checks only
  → Use my own API key   direct to provider, we see nothing

─────────────────────────────────────────────────
```

**Three paths:**

| Choice | What runs | LLM | Network |
|--------|-----------|-----|---------|
| **Yes, run demo** | commit-policy + ai-review + qa-gate | via Gateway (demo token, 50 calls) | diffs → Gateway → OpenAI |
| **Local only** | commit-policy + qa-gate | none | none |
| **My own API key** | commit-policy + ai-review + qa-gate | direct to provider | diffs → provider (bypass Gateway) |

**Why this matters:**
- Sending source code diffs to external servers without consent is a trust-killer
- The team lead who discovers this happened without approval = product is dead to them forever
- "Local only" is not a degradation — it's the on-prem story, core to KB Labs positioning
- One question, three choices, clear description of what goes where

**Privacy page (kblabs.ru/privacy) must state:**
- What is sent: git diffs only (not full source code)
- Where: OpenAI API via KB Labs Gateway proxy
- Storage: none, pass-through only
- Logging: token count for rate-limiting only, no content logged

**Goal:** User makes an informed choice in 5 seconds.

---

### Stage 4: FIRST WOW (3 minutes)

#### Path A: "Yes, run demo" (full pipeline)

```
Analyzing last 5 commits...

┌─────────────────────────────────────────────────┐
│  COMMIT POLICY          4/5 pass                │
│    ✗ a3f2c1d "fix stuff" — missing type/scope   │
│                                                  │
│  AI REVIEW              3 issues                 │
│    ⚠ src/api/users.ts:42                         │
│      DB query without try/catch                  │
│    ⚠ src/lib/auth.ts:15                          │
│      JWT secret from env, no fallback            │
│    ℹ src/utils/parse.ts:8                        │
│      Manual parsing → consider zod               │
│                                                  │
│  QA GATE                build OK · tests pass    │
│                                                  │
│  Score: B+ — 1 commit issue, 2 code risks       │
└─────────────────────────────────────────────────┘
```

#### Path B: "Local only" (no LLM)

```
Analyzing last 5 commits...

┌─────────────────────────────────────────────────┐
│  COMMIT POLICY          4/5 pass                │
│    ✗ a3f2c1d "fix stuff" — missing type/scope   │
│                                                  │
│  AI REVIEW              skipped (no LLM)        │
│                                                  │
│  QA GATE                build OK · tests pass    │
│                                                  │
│  Score: B — 1 commit issue                       │
└─────────────────────────────────────────────────┘

  To enable AI review:
    kb config set llm.apiKey sk-...       your key, direct
    kb config set llm.provider ollama     fully local LLM
```

#### Path C: "My own API key"

Same as Path A, but user enters key first:

```
? OpenAI API key: sk-...
  Saved to .kb/kb.config.jsonc
  Requests go directly to OpenAI. KB Labs sees nothing.

Analyzing last 5 commits...
  [same output as Path A]
```

#### All paths end with:

```
What's next?
  kb run demo              Run pipeline again
  kb workflow show demo    See pipeline config
  kb marketplace browse    Explore 11 plugins
  kb docs                  Full documentation
```

**If pipeline finds nothing:**

```
  Score: A — your project is in great shape.
  KB Labs will keep it that way.

  Set up CI:  kb ci setup
  Add checks: kb marketplace browse
```

Even "all clean" is a useful signal and leads deeper into the product.

**Goal:** "It found real issues in MY code" or "It confirmed my code is clean."

---

### Stage 5: ADOPT (day 1)

User is interested. Three natural paths:

#### Path A: "I want this in CI"

```bash
kb ci setup
# → generates .github/workflows/kb-pipeline.yml
# → commit policy + AI review + QA on every PR
# → "Push this file and your PRs are covered"
```

#### Path B: "I want to customize"

```bash
kb workflow show demo
# → prints .kb/workflows/demo.yaml (readable YAML)

kb workflow edit demo
# → opens in $EDITOR
# → user adds/removes/configures steps
# → kb run demo — runs updated pipeline
```

#### Path C: "What else is there?"

```bash
kb marketplace browse
# → TUI browser with 11 plugins
# → descriptions, install counts, ratings
# → kb marketplace install release-automation
# → immediately available in workflows
```

**Goal:** Integrated into team's daily workflow.

---

### Stage 6: EXPAND (week+)

| Path | Action | Result |
|------|--------|--------|
| More plugins | `kb marketplace install` | release, deps health, agents |
| Custom plugins | `kb plugin create my-policy` | scaffold from template, own logic |
| AI plugin generator | `kb create-plugin` | describe problem in text → working plugin in 30s |
| Own LLM | `kb config set llm.provider ollama` | fully on-prem, zero external calls |
| Team rollout | everyone runs `kb-create --demo` | shared workflows via git |
| Own API key | `kb config set llm.apiKey sk-...` | unlimited, no Gateway dependency |
| Publish to marketplace | `kb plugin publish` | share generated/custom plugins with community |

**Goal:** Platform became part of team infrastructure.

**AI Plugin Generator** (`kb create-plugin`):

```bash
kb create-plugin
# ? Describe what you want to check or automate:
# → "Every API handler must have request/response logging"
#
# Plugin: api-logging-policy
#   .kb/plugins/api-logging-policy/
#   ├── manifest.json
#   ├── index.ts          (34 lines)
#   └── README.md
#
# Test: kb run api-logging-policy
# Edit: code .kb/plugins/api-logging-policy/index.ts
# Add:  kb workflow add demo api-logging-policy
```

This is the **viral engine** — the "holy shit" moment for Twitter/Product Hunt demos.
It does NOT replace marketplace (generated plugins are basic, community plugins are production-grade).
It IS the top-of-funnel for marketplace contributors: generate → use → polish → publish.

---

## 3. Infrastructure

### What needs to be hosted

**One service: AI Gateway** (proxy to OpenAI for demo tier).

```
User's machine                    KB Labs infra
──────────────                    ──────────────

kb run demo
  ├─ commit-policy  (local)       nothing needed
  ├─ qa-gate        (local)       nothing needed
  └─ ai-review ─── HTTPS ──→  [ API Gateway ]
     diff + prompt                    │
                                      │ auth (demo-token)
                                      │ rate-limit (in-memory)
                                      │ token counting
                                      │
                                 [ OpenAI API ]
                                 (free-tier key, 2.5M tokens/day)
                                      │
     result ←──── HTTPS ─────────────┘
```

Everything except AI review runs locally. Gateway is a thin proxy.

### Cost model

**LLM costs per demo run (GPT-4o-mini):**

| Action | Tokens in | Tokens out | Cost |
|--------|-----------|------------|------|
| AI Review (3 commits) | ~3,000 | ~500 | $0.001 |
| Commit analysis | ~1,500 | ~200 | $0.0003 |
| Project summary | ~2,000 | ~500 | $0.0006 |
| **Total per demo** | **~6,500** | **~1,200** | **$0.0017** |

**Free-tier OpenAI key: 2.5M tokens/day = ~1,470 demos/day at zero cost.**

**Demo token limit: 50 LLM calls per user** (= ~10 full demo runs).

### Infrastructure costs

```
Current setup (sufficient for launch):
  VPS 1 CPU / 1 GB (500 rub/mo) — frontend + Gateway
  OpenAI free-tier key           — 2.5M tokens/day
  ────────────────────────────────────────────────
  Total: 500 rub/mo (~$5)

Capacity:
  10 users/day    → 0.1% VPS load, 0.3% token budget
  100 users/day   → 1% VPS load, 3% token budget
  1,000 users/day → 10% VPS load, 34% token budget (upgrade VPS)
```

**When to upgrade (VPS → 2 CPU / 4 GB, ~800 rub/mo):**
- 1,000+ daily active users
- Realistically: not for the first 6-12 months

---

## 4. What Needs to Be Built

### P0 — Without this, no demo

| Component | Where | Est. effort | Description |
|-----------|-------|-------------|-------------|
| `--demo` flag | kb-create (Go) | 1 day | Preselects demo plugins, triggers pipeline after install |
| ProjectDetector | kb-create (Go) | 1-2 days | Detect language, PM, build/test/lint commands |
| Consent prompt | kb-create (Go) | 0.5 day | Three-choice consent before any network calls |
| Demo token provisioning | kb-create (Go) + Gateway | 1 day | Anonymous token, 50-call limit |
| Gateway demo endpoint | VPS (Node.js) | 1-2 days | Auth, rate-limit (in-memory), proxy to OpenAI |
| qa-lite plugin | platform (TS) | 2-3 days | Runs build/test/lint from ProjectDetector profile |
| Adapt commit plugin | platform (TS) | 1 day | Remove KB-specific scopes, make generic |
| Adapt ai-review plugin | platform (TS) | 1 day | Fallback when no ESLint config, LLM-only mode |
| Demo workflow template | platform (TS) | 1 day | commit-policy → ai-review → qa-gate YAML |
| Score calculation | platform (TS) | 0.5 day | A/B/C/D/F grade from pipeline results |

**Total P0: ~10-13 days**

### P1 — Day-1 experience

| Component | Where | Est. effort | Description |
|-----------|-------|-------------|-------------|
| `kb ci setup` | platform (TS) | 2 days | Generate GitHub Actions workflow from pipeline config |
| `kb marketplace browse` | platform (TS) | 2 days | TUI plugin browser |
| `kb workflow show/edit` | platform (TS) | 1 day | Human-readable pipeline YAML |
| Call counter in CLI | platform (TS) | 0.5 day | "47 demo calls remaining" |
| `kblabs.ru/privacy` page | website | 0.5 day | Privacy policy for demo tier |

**Total P1: ~6 days**

### P2 — Growth & Virality

| Component | Where | Est. effort | Description |
|-----------|-------|-------------|-------------|
| `kb create-plugin` (AI generator) | platform (TS) | 3-4 days | Describe problem → LLM generates working plugin |
| `kb plugin publish` | platform (TS) | 2 days | Publish to marketplace from local plugin |
| `kb plugin create` scaffold | platform (TS) | 2 days | Manual scaffold from template (non-AI path) |
| More demo templates (release, deps) | platform (TS) | 2 days | Additional pipeline presets |
| Bring-your-key flow (multi-provider) | platform (TS) | 1 day | OpenAI, Anthropic, Google, local |
| Ollama fallback | platform (TS) | 1-2 days | Fully offline LLM |
| Anonymous telemetry (funnel tracking) | kb-create + Gateway | 2 days | Measure conversion at each stage |

**Total P2: ~13-17 days**

---

## 5. Key Principles

### Product principles

1. **Zero questions during install** — `--demo` decides everything
2. **Explicit consent before any network call** — one prompt, three choices, clear wording
3. **Real code, not hello-world** — analyze user's actual commits
4. **Always show value** — even "all clean" is a useful result
5. **Each exit points deeper** — every screen ends with next actions
6. **Local-first** — everything works without network; AI is an enhancement, not a requirement
7. **On-prem is a feature, not a limitation** — "Local only" path leads to Ollama story

### Growth model

Each layer of the platform serves a distinct role:

```
Demo pipeline       = ADOPTION engine    why people install
                      P0, < 3 min to value
                      "It found real bugs in my code"

Plugin marketplace  = RETENTION engine   why people stay
                      P1, day 1+
                      "I added release automation in 10 seconds"

AI plugin generator = VIRAL engine       why people talk about it
                      P2, week+
                      "I described a problem and got a working plugin in 30 seconds"
```

All three are necessary. Build and ship in this order.

---

## 6. Roadmap: Current State → Launch

### Where we are

```
✅ Platform works (dev mode, monorepo)
✅ Plugins work (inside monorepo)
✅ kb-create written (Go, TUI wizard)
✅ Website ready (kb-labs-web)
⏳ Publishing packages to npm              ← CURRENT
⬜ Launcher tested with npm packages
⬜ Demo flow
⬜ Launch
```

### Phase 1: FOUNDATION (current)

> **Goal:** Platform installs from npm and works on a clean machine.

| Step | What | Status | Notes |
|------|------|--------|-------|
| 1.1 | Publish all packages to npm | ⏳ in progress | core, sdk, cli, contracts, shared, plugins, adapters |
| 1.2 | Test kb-create with real npm packages | ⬜ next | Clean machine: `kb-create my-project` → `kb --help` works |
| 1.3 | Fix what breaks | ⬜ | Paths, peer deps, missing exports, entry points |
| 1.4 | Claude Code skill for installation | ⬜ parallel | `/install-kb` — installs via kb-create, good for early adopters |

**Key risks:**
- DevLink `--mode=npm` must be run before publish (link: → ^version)
- Entry points (`main`, `exports`, `bin`) must all resolve correctly
- Peer dependency chains across 100+ packages

**Done when:** `kb-create my-project` on a fresh machine → `kb --help` → commands work.

### Phase 2: DEMO PIPELINE

> **Goal:** `kb-create --demo` works end-to-end.

| Step | What | Est. effort | Notes |
|------|------|-------------|-------|
| 2.1 | ProjectDetector in kb-create (Go) | 1-2 days | Detect language, PM, build/test/lint commands |
| 2.2 | Adapt plugins for generic projects | 3 days | commit (remove KB scopes), ai-review (LLM fallback), qa-lite (new) |
| 2.3 | Gateway demo endpoint on VPS | 1-2 days | Auth, rate-limit (in-memory), proxy to OpenAI |
| 2.4 | Demo workflow template | 1 day | commit-policy → ai-review → qa-gate YAML + score |
| 2.5 | `--demo` flag in kb-create | 1-2 days | Consent prompt, preselect plugins, run pipeline after install |

**Done when:** `kb-create --demo ~/any-project` → consent → pipeline results on real code.

### Phase 3: POLISH & DOGFOOD

> **Goal:** You are happy with the result. 2-3 beta testers confirm it works.

| Step | What | Est. effort | Notes |
|------|------|-------------|-------|
| 3.1 | Test on external projects | 3-5 days | 2-3 devs, different stacks (Next.js, Express, Python, Go) |
| 3.2 | Privacy page (kblabs.ru/privacy) | 0.5 day | What is sent, where, storage policy |
| 3.3 | Update website | 1 day | CTA matches real flow, remove outdated sections |
| 3.4 | Getting started docs | 1 day | One page: curl → kb-create --demo → what you see |

**Done when:** 3 people outside your team ran `kb-create --demo` successfully on their projects.

### Phase 4: FRIENDS & DEV PILOTS

> **Goal:** First real users on real projects. Unfiltered feedback from people you trust.

| Step | What | Notes |
|------|------|-------|
| 4.1 | 3-5 dev friends install on their projects | Different stacks, honest feedback, you're on call to help |
| 4.2 | Sit with them (call/screen share) | Watch where they get stuck — what they do, not what they say |
| 4.3 | Fix everything that broke | Install issues, confusing output, missing edge cases |
| 4.4 | Second round with fixes | "Try again, fixed X and Y" |

**What to watch for:**
- Did anyone get stuck at install? → fix kb-create
- Did anyone get stuck at consent? → reword the prompt
- Did anyone say "so what"? → pipeline didn't find anything useful
- Did the output make sense without explanation? → if you had to explain it, the UX is broken

**Done when:** 3 friends ran it independently (without your help) and it worked.

### Phase 5: CTO VALIDATION

> **Goal:** Product-market signal from decision-makers.

| Step | What | Notes |
|------|------|-------|
| 5.1 | Show to 2-3 CTO/tech lead friends | Demo call or async video + install link |
| 5.2 | Ask different questions than devs | "Would you roll this out to your team?" / "What's missing for that?" |
| 5.3 | Incorporate strategic feedback | CTOs see different problems — policy, compliance, team adoption |

**Key questions for CTOs:**

1. "Would you let your team install this?" — trust / security signal
2. "What would need to change for you to roll it out?" — blockers
3. "Is this solving a real problem for your team right now?" — PMF signal

**Done when:** At least 1 CTO says "I'd use this" or gives clear feedback on what would make them use it.

### Phase 6: FOCUS GROUP (300-person IT community)

> **Goal:** Broad validation and first public exposure.

By this point the product has been through dev pilots and CTO feedback — rough edges are smoothed out.

**Format — short message + video + one command:**

```
Запилил штуку — KB Labs, автоматизация инженерных процессов
через плагины. Ставится за минуту, прогоняет pipeline
на вашем коде (commit policy + AI review + QA gate).

30-сек видео: [ссылка]

Попробовать:
  curl -fsSL https://kblabs.ru/install.sh | sh
  kb-create --demo ~/ваш-проект

Буду рад критике — что сломалось, где непонятно,
нужна ли такая штука вообще.
```

**Demo video (30 sec, no voiceover):**

```
0:00  empty terminal
0:03  curl install
0:08  kb-create --demo ~/project
0:15  "TypeScript · pnpm · Next.js"
0:18  consent → Yes
0:22  pipeline running
0:28  result: "B+ — 2 code risks found"
0:30  end
```

Just a terminal recording. Honest, no hype. C-levels don't read READMEs — they watch 30-second videos and decide.

**Three specific questions to ask:**

1. "Would you install this on your project?" — yes/no and why
2. "What was unclear from the video?" — UX problems
3. "What plugin would you add first?" — feature priorities

| Step | What | Notes |
|------|------|-------|
| 6.1 | Record demo video | 30 sec, terminal only, no voiceover |
| 6.2 | Post in community chat | Message + video + install command |
| 6.3 | Collect feedback (1 week) | Track: installed / broke / confused / "not for me" |
| 6.4 | Fix issues from feedback | Whatever breaks at scale |
| 6.5 | Second round (optional) | "Fixed X, Y, Z — try again?" |

**Done when:** 10-20 people from the group tried it, you have quantifiable feedback.

### Phase 7: PUBLIC LAUNCH

> **Goal:** First 50+ users outside your network.

| Step | What | Notes |
|------|------|-------|
| 7.1 | Incorporate all prior feedback | Three rounds of polish by now |
| 7.2 | Longer demo video (2 min) | Extended version with customization / marketplace |
| 7.3 | Habr article | Technical deep-dive, honest tone, real metrics from pilots |
| 7.4 | Twitter/X thread | 5-7 tweets showing the flow |
| 7.5 | dev.to / Reddit | Cross-post for international audience |
| 7.6 | Product Hunt / HN | Only when stable and feedback is consistently positive |

**Done when:** 50 installs, conversion data, clear signal on what to build next.

### Phase 8: GROWTH (P1 + P2 features)

> **Goal:** Retention and expansion.

| Step | What | Engine |
|------|------|--------|
| 8.1 | `kb ci setup` | Retention — integrate into team workflow |
| 8.2 | `kb marketplace browse` | Retention — discover more plugins |
| 8.3 | `kb create-plugin` (AI generator) | Viral — "holy shit" moment for demos |
| 8.4 | `kb plugin publish` | Viral — community grows marketplace |
| 8.5 | Ollama support | Retention — fully on-prem story |
| 8.6 | Multi-provider (Anthropic, Google) | Retention — no lock-in |

### Timeline (rough)

```
Phase 1      Phase 2       Phase 3    Phase 4      Phase 5    Phase 6      Phase 7     Phase 8
FOUNDATION   DEMO PIPELINE POLISH     DEV PILOTS   CTO        FOCUS GROUP  PUBLIC      GROWTH
──────────── ──────────── ────────── ──────────── ────────── ──────────── ─────────── ──────────
npm publish   ProjectDet   Dogfood    3-5 friends  2-3 CTOs   Record vid   Habr        CI setup
kb-create     Plugins      Beta       Screen share PMF signal Post chat    Twitter     Marketplace
fix breaks    Gateway      Site/docs  Fix & retry  Strategic  Collect fb   dev.to/HN   AI gen
CC skill      --demo flag  Privacy    Iterate      feedback   Fix issues   PH launch   Ollama
──────────── ──────────── ────────── ──────────── ────────── ──────────── ─────────── ──────────
    NOW        ~2 weeks     ~1 week    ~1 week     ~1 week    ~1 week     ~1-2 weeks  ongoing
```

---

## 7. Success Metrics

| Metric | Target | How to measure |
|--------|--------|----------------|
| Install → First Wow | < 3 min | Telemetry (if consented) |
| Consent → "Yes" rate | > 50% | Gateway token issuance |
| Demo → second `kb run` | > 30% | CLI telemetry |
| Demo → `kb ci setup` | > 10% | CLI telemetry |
| Demo → own API key | > 5% | Config change events |

---

## 8. Platform Accounts & Presence Checklist

Everything that needs to exist before public launch.

### Email

| Address | Purpose | When |
|---------|---------|------|
| `help@kblabs.ru` | Support / general | Phase 3 |
| `sales@kblabs.ru` | Enterprise inquiries | Phase 6 |
| `press@kblabs.ru` | Media / press | Phase 7 |
| `noreply@kblabs.ru` | Transactional (demo tokens, notifications) | Phase 2 |

> Note: `.ru` addresses can be forwarded to `.dev` later when going international. No data loss.

### Social & Community

| Platform | Handle / URL | Purpose | When |
|----------|-------------|---------|------|
| GitHub org | `KirillBaranov` (existing) | Code, issues, discussions | ✅ exists |
| Twitter/X | `@kblabs_dev` or similar | Launch announcements, threads | Phase 6 |
| Telegram channel | `t.me/kblabs` | RU community, updates | Phase 6 |
| Discord | `discord.gg/kblabs` | Dev community, support | Phase 7 |
| LinkedIn company page | KB Labs | B2B presence for CTOs | Phase 7 |

### Content & Marketing

| Platform | Purpose | When |
|----------|---------|------|
| Habr | Technical articles, RU dev audience | Phase 7 |
| dev.to | International dev audience | Phase 7 |
| Product Hunt | Launch event | Phase 7 (when stable) |
| YouTube / screen recordings | Demo videos | Phase 6 |

### Developer Ecosystem

| Account | Purpose | When |
|---------|---------|------|
| npm org `@kb-labs` | Package publishing | ✅ exists (in progress) |
| PyPI (future) | Python SDK | Phase 8+ |
| Homebrew tap | `brew install kb-create` | Phase 7 |
| AUR (Arch Linux) | Linux distribution | Phase 8+ |

### Infrastructure

| Service | Purpose | When |
|---------|---------|------|
| VPS (existing) | Website + Gateway | ✅ exists |
| Domain `kblabs.ru` | Primary domain | ✅ exists |
| Domain `kblabs.dev` | International (future) | Phase 7+ |
| SSL cert (Let's Encrypt) | HTTPS | ✅ exists |
| Uptime monitoring (e.g. Upptime, BetterStack) | Status page | Phase 6 |
| Analytics (Plausible / Umami) | Website analytics, privacy-friendly | Phase 3 |
| Error tracking (Sentry free tier) | CLI crash reports (opt-in) | Phase 3 |

### Legal / Trust

| Item | Purpose | When |
|------|---------|------|
| `kblabs.ru/privacy` | Privacy policy for demo tier | Phase 3 |
| `kblabs.ru/terms` | Terms of service | Phase 7 |
| License (MIT / Apache 2.0) | OSS license in all repos | Phase 3 |

---

## 9. Open Questions

1. **Score algorithm** — How to calculate A/B/C/D/F? Weighted sum of findings? Configurable thresholds?
2. **"Last N commits" default** — 5 commits? 3? All commits since last tag? Configurable?
3. **Demo token lifecycle** — Expire after 7 days? 30 days? Never (just 50 calls)?
4. **Offline detection** — If no internet, auto-fallback to "Local only" without asking?
5. **Monorepo handling** — In a monorepo, analyze root or auto-detect most active package?
6. **CI providers** — `kb ci setup` for GitHub Actions first. GitLab CI, Bitbucket Pipelines later?
7. **Telegram vs Discord** — Both? Or Telegram first for RU, Discord for international later?
8. **Analytics** — Plausible (paid, EU-hosted) vs Umami (self-hosted, free)? Privacy-friendly is a must given on-prem positioning.
