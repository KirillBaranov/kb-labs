---
name: tool-release
description: KB Labs release pipeline — versioning, changelog, publish. Flows, checks, dry-run.
globs:
  - "plugins/release/**"
  - ".kb/kb.config.json"
  - ".kb/release/**"
---

# Release Pipeline

CLI entry point: `pnpm kb release <command>`.

## Release runtime preflight

`kb-labs-workspace` is the only source checkout for a platform release.
`/Users/kirillbaranov/Desktop/work/kb-labs-infra/platform` is a production
runtime installation outside the worktree. It may be selected for dogfood
testing through `platform.dir`, but it must never supply the workflow root or
branch for a workspace release.

Before starting `release-prepare`:

1. Confirm `git branch --show-current` is `main` in `kb-labs-workspace` and
   its remote CI is green.
2. Switch to dev runtime with `pnpm config:dev` if `platform.dir` points to
   the production installation; then restart the workspace workflow daemon.
3. Confirm the workflow daemon resolves `.kb/workflows/release-prepare.yml`
   from this workspace. If it reports another checkout or branch, stop and
   repair the runtime root—never use the direct release CLI as a workaround.

---

> ## ⛔ КРИТИЧЕСКИЕ ПРАВИЛА — НАРУШЕНИЕ ЛОМАЕТ РЕЛИЗ
>
> **1. Для обычного релиза агент запускает только воркфлоу `release-prepare`.**
> Воркфлоу сам выполняет validation, checks, build, release review artifacts, approval, changelog, version bump,
> commit, tag и push. Агент не заменяет его цепочку прямыми вызовами CLI.
> Запрещено: `pnpm publish`, `npm publish`, `pnpm -r publish`, прямой stable
> `pnpm kb release run`, ручной `git tag`/`git push` для обхода workflow.
> `pnpm release:*:prepare` — только аварийный fallback, если workflow-демон
> недоступен, и только после явного подтверждения человека.
>
> **`stage`/`deliver` vs `promote` — two different flows, don't mix them:**
> `kb release stage --release-tag <tag>` packs the already-committed versions into real npm tarballs, once; `kb release deliver --release-tag <tag> --target npm` ships those exact tarballs and verifies against the registry. Both resolve `{flow, channel}` from the tag itself via `release.flows[*].tagPattern` (`<flow>-v<version>`, e.g. `platform-v2.105.0`) — no `--flow` needed when `--release-tag` is given. This is the CI half of the local `.kb/workflows/release-prepare.yml` → tag push → `.github/workflows/publish-npm-on-tag.yml` flow. `promote` is the older interactive Verdaccio/pre-flight path for a human and is not part of the agent release path. For a tagged release, CI owns `stage`+`deliver`.
>
> **2. ВСЕГДА указывать `--flow`. Без флоу — НЕЛЬЗЯ.**
> `pnpm kb release run` без `--flow` захватит все 149 пакетов разом и сломает независимые циклы релиза platform и sdk.
> Каждый вызов должен иметь либо `--flow platform` либо `--flow sdk` — без исключений.
>
> **3. Changesets больше не используется.** `.changeset/`, `pnpm changeset`, `pnpm release`(старый alias на `changeset publish`) — удалены. `plugins/release/*` (эта страница) — единственный источник правды для версий/changelog/публикации.
>
> **4. Агент никогда сам не паблишит в npm.** После запушенного тега доставку
> выполняет CI (`stage` → `deliver-candidate` → `launcher-smoke`) с credentials
> из GitHub Secrets и проверяет результат в registry. Stable promotion вынесен
> в отдельный ручной `promote-npm-release.yml`: он принимает `release_tag` и
> `candidate_run_id`, проверяет canary против manifest и делает только
> `npm dist-tag add <name>@<version> latest` для тех же артефактов.

---

## Как агенту катить релиз

**Всегда через воркфлоу `release-prepare`.** Он принимает только обязательный
input `flow`, проверяет, что запуск идёт с `main`, а затем последовательно
выполняет `Preview → Checks → Build → Release Review → Approval → Prepare → Git`.
До approval package versions не bump-аются и git refs не меняются; changelog,
plan и ссылки для ревью уже подготовлены как workflow artifacts. Нужен локально
запущенный daemon (`kb-dev start`):

```bash
pnpm kb workflow run --workflow-id release-prepare --input '{"flow":"platform"}'
# сохрани run-id из вывода, затем последи за прогрессом:
pnpm kb workflow runs status --run-id <runId>
```

Допустимые значения `flow` берутся из `release.flows` в `.kb/kb.config.json`.
В текущей конфигурации это `platform` и `sdk`; запуск без `flow`, с пустым
значением или с самодельным channel/version input не допускается. Platform и
SDK запускаются отдельными workflow runs. Бинарники — отдельный release
контур и не подменяются npm-flow.

### Input `skipChecks` — аварийный пропуск фазы Checks

Воркфлоу принимает необязательный boolean-input `skipChecks` (default
`false`):

```bash
pnpm kb workflow run --workflow-id release-prepare --input '{"flow":"platform","skipChecks":true}'
```

Это не общий обход релиза, а точечный escape hatch на одну фазу: при
`skipChecks:true` шаг `Checks` (`if: ${{ !inputs.skipChecks }}`) целиком
пропускается — `dist-exports`/`pack-install`/`typecheck`/`lint`/`tests` не
запускаются. `Preview`, `Build`, `Release Review`, `Approval`, `Prepare`,
`Git` выполняются как обычно; версии по-прежнему бампаются и коммит/тег/пуш
происходят только после явного approval. Approval-шаг явно показывает
`skipChecks=true` в инструкции, чтобы approver не одобрил непроверенный
релиз вслепую.

Использовать только когда сама фаза Checks сломана или блокирует
несвязанный с содержимым релиза gate — не как способ ускорить обычный
релиз. После прогона **обязательно** прогнать `pnpm kb release checks
--flow <flow>` вручную и не считать релиз verified, пока он не зелёный.
Это отдельный, более узкий механизм, чем break-glass ниже (который снимает
ровно один check из конфига для bootstrap-дедлока) — `skipChecks` снимает
всю фазу целиком через input воркфлоу, ничего в `.kb/kb.config.json` не
трогая и не требуя revert-коммита.

Воркфлоу дойдёт до шага `Confirm release` и встанет в `waiting_approval` —
это и есть точка, где уже доступны release review, JSON-план, changelog,
ссылка на сравнение с предыдущим тегом и ссылка на будущий release tag.
Approve отдаёт человек (или агент — **только** после того, как
человек в чате явно сказал "ок, апрувь"; это реальный тег + push, ничего
не публикует в npm само по себе, но необратимо в смысле git-истории):

```bash
pnpm kb workflow runs approve --run-id <runId>
```

После approve воркфлоу сам доводит `prepare` до конца (version bump,
changelog, `git commit` + `git tag` + `git push`). Тег имеет вид
`<flow>-v<version>` (например `platform-v2.105.0`, `sdk-v3.2.0`) — этот
push и есть триггер CI. `flow` — `"platform"` или `"sdk"` (см. Release
Order ниже), передаётся через `--input`.

Определение воркфлоу: `.kb/workflows/release-prepare.yml`. Это явная оркестрация
команд `plan`, `checks`, `build`, `changelog`, `version` и `git` с approval после
полного review-пакета, но до version bump и git-операций; обходить её составными
CLI-командами нельзя.
ID воркфлоу —
`release-prepare`, без каких-либо префиксов (`kb workflow list` или
`GET /api/v1/workflows` на daemon, если сомневаешься в актуальном списке).

Дальше — **не паблишить самому**, а посмотреть, что CI подхватил тег и
делает остальное:

```bash
gh run list --workflow=publish-npm-on-tag.yml --limit 3
gh run watch <run-id>
```

CI-часть (`stage` → `deliver-candidate` → `launcher-smoke`, см.
`.github/workflows/publish-npm-on-tag.yml`)
сама резолвит `{flow, channel}` из тега (`resolveFlowFromTag`,
`release.flows[*].tagPattern`), пакует тарболы один раз (`kb release stage`)
и публикует candidate под `canary` (`kb release deliver --target npm`) —
никакого `--flow` вручную, никакого `NPM_TOKEN` от агента. Если
`deliver-candidate` упал после успешного `stage` — перезапустить эту джобу
(`gh run rerun <run-id> --job=deliver-candidate`), публикация идемпотентна,
тарболы переиспользуются, не пересобираются. После зелёного smoke promotion
запускается отдельно:

```bash
gh workflow run promote-npm-release.yml \
  -f release_tag=platform-vX.Y.Z \
  -f candidate_run_id=<successful-publish-run-id>
```

Promotion отклоняет любой run без успешных `deliver-candidate` и
`launcher-smoke`, проверяет, что `@canary` указывает на версии из manifest,
и не делает новый build/pack/publish.

**Если что-то пошло не так до пуша тега** (validation/checks/build упали, approval
отклонён) — просто чинить и перезапускать воркфлоу заново, тег ещё не
создан, ничего не сломано. **Если тег уже запушен, а `stage`/`deliver-npm`
красные** — не трогать git руками (не удалять тег, не форсить), разбираться
в логах CI (`gh run view <run-id> --log-failed`) и перезапускать нужную
джобу.

**Без демона** (`kb-dev start` не поднят) workflow недоступен. Не обходить
это прямым stable CLI автоматически: сначала восстановить daemon. Если
fallback действительно необходим, запускать только соответствующий
`pnpm release:<flow>:prepare` после явного подтверждения человека и отдельно
зафиксировать, что встроенного workflow approval в этом пути нет.

---

## Break-glass: обход ровно одного check на один релиз

Bootstrap-дедлок: если пакет уже опубликован битым (например,
`workspace:*` утёк в `dependencies`/`devDependencies`), gate
`pack-install` тянет реальные peer-зависимости с npm и падает **на любом
следующем релизе**, включая тот, что должен это исправить. Circular:
почини публикацией → публикация блокируется checks → checks блокируются
тем, что ещё не исправлено.

Это редкий, разовый случай — не общий механизм обхода checks. Речь здесь
именно о голом CLI `--skip-checks` на прямом `kb release run` в обход
воркфлоу — он остаётся полностью запрещён (см. критическое правило №1
выше) и физически блокируется защитным классификатором среды выполнения
агента. Это не то же самое, что input `skipChecks` у самого воркфлоу
`release-prepare` (см. выше) — тот легитимен, проходит через approval gate
и не требует правки `.kb/kb.config.json`.

Узкая, auditable процедура для ровно этого случая:

1. **Только после явного "ок, апрувь" от человека в чате на этот
   конкретный шаг** — не по инструкции наперёд, не по умолчанию.
2. Определить, какой check реально бьётся о bootstrap-дедлок (обычно
   `pack-install`) — **не** отключать более одного check за раз.
3. Временно убрать ровно этот check из `.kb/kb.config.json` — и из
   глобального `release.checks`, и из `release.flows.<flow>.checks`
   (иначе глобальная копия всё равно попадёт в смерженный список для
   этого flow — см. `mergeConfigWithFlow` в `manager-core/planner.ts`).
   Оставить все остальные checks (`dist-exports` и т.д.) активными.
4. Прогнать релиз **только через `release-prepare` workflow** (не через
   `--skip-checks`, не через голый CLI) — это единственный сертифицированный
   agent-путь, обход остаётся заблокирован даже здесь.
5. Сразу после (в том же заходе, без промежуточных коммитов между) —
   восстановить check обратно и закоммитить отдельным коммитом
   ("revert emergency check bypass for `<flow>` release").
   `git diff` конфига до и после должен быть пустым.
6. В описании обоих коммитов (bypass + revert) — ссылка на инцидент:
   какой пакет был опубликован битым и каким релизом это чинится.

Никогда не оставлять check отключённым дольше одного релизного прогона и
никогда не отключать больше одного check за раз — если кажется, что нужно
больше одного, это сигнал остановиться и разобраться в первопричине
вместо расширения bypass.

---

## Release Order — IMPORTANT

**Always release in this order: `platform` first, then `sdk`.**

The SDK's `peerDependencies` use `>=2.0.0` ranges (not pinned versions), so order no longer causes
peer mismatch. However releasing SDK after platform is still correct practice because:
- SDK may re-export symbols from platform packages — platform must be published first
- Downstream users install platform + SDK together; platform being newer is always safe

**If you accidentally release SDK before platform:**
- Users get peer warnings on `pnpm install` (not errors — `>=2.0.0` is lenient)
- No functional breakage, but noisy install output

## Flows

Two named release profiles, configured in `.kb/kb.config.json` under `release.flows`.

| Flow | Packages | Strategy |
|------|----------|----------|
| `platform` | All 148 packages (excludes `@kb-labs/sdk`) | lockstep — all bump to the same version |
| `sdk` | `@kb-labs/sdk` only | independent — own semver |

**Always specify a flow.** No `--flow` = global config defaults (lockstep, all 149 packages).

## Commands

```bash
# Preview what would be released — no side effects
pnpm kb release plan --flow platform
pnpm kb release plan --flow sdk

# Generate changelog only (writes .kb/release/CHANGELOG.md)
pnpm kb release changelog --flow platform
pnpm kb release changelog --flow sdk

# Full pipeline dry-run (plan + checks, no publish, no git)
pnpm kb release run --flow platform --dry-run
pnpm kb release run --flow sdk --dry-run

# Диагностический пример полного CLI-пайплайна. Не использовать для обычного
# agent stable-релиза: его заменяет release-prepare с approval-гейтом.
pnpm kb release run --flow platform --skip-build
pnpm kb release run --flow sdk --skip-build
```

## Local Release Path — Verdaccio Pre-flight, then Promote (human only)

**This is not the path an agent uses** — see "Как агенту катить релиз" above
for the normal `prepare` → tag → CI flow, which is the *only* path an agent
can complete (it can't type an OTP code). But if **you** want to ship a
release from your own laptop right now, this still works — build once →
publish to Verdaccio (a local registry, never touches real npm, unaffected
by any of npm's token policy changes) → verify → **promote the same,
already-committed versions to npm**. For the promote step: don't export
`NPM_TOKEN` — run `kb release promote` bare and it prompts you for the npm
OTP interactively (`publishPackagesWithOTP`), which is npm's normal 2FA
flow and isn't part of what got deprecated (only *headless* publish with a
stored bypass-2FA token was).

Compared to the agent's `stage`/`deliver` CI path: this manual path re-packs
from source at publish time instead of shipping a single pre-verified
tarball, and doesn't verify post-publish against real npm — fine for a
one-off local release or a from-scratch registry sanity-check, but
`stage`+`deliver` is the more rigorous path for anything that matters.

There is no second bump, no second build, and no rerunning the full
pipeline for this manual path either — Step 2 is a dedicated command
(`kb release promote`) that publishes exactly what step 1 already committed
and tagged.

**Important constraint:** `config.registry` (the `release` key in
`.kb/kb.config.json`) is still config-only — no `--registry` CLI override for
`release run`. It controls where a `channel: stable` run publishes (normally
Verdaccio for this pre-flight step). `kb release promote` **does** accept a
`--registry` override (defaults from `config.publish.npmRegistry`, falling
back to real npm) since it's a separate, later step.

### Verdaccio setup (one-time)

```bash
# 1. Start Verdaccio
npx verdaccio -l 4873

# 2. Allow anonymous publish — edit ~/.config/verdaccio/config.yaml:
#    packages:
#      '@*/*':
#        access: $all
#        publish: $all       ← change from $authenticated
#      '**':
#        access: $all
#        publish: $all       ← change from $authenticated
#
#    max_body_size: 200mb    ← required for studio-app (~50MB tarball)
#
# 3. Add npmrc auth token so npm client doesn't block scoped packages:
#    echo '//localhost:4873/:_authToken=verdaccio-local' >> ~/.npmrc
#
# 4. Restart Verdaccio after config changes.
```

### Step 1 — Release to Verdaccio

```bash
# 1. Ensure Verdaccio is running on :4873 (see setup above)

# 2. Set registry in .kb/kb.config.json
#    "release": { "registry": "http://localhost:4873", ... }

# 3. Run the full pipeline — build + bump + git commit/tag + publish to
#    Verdaccio + registry verification (mandatory for stable, not opt-in —
#    confirms the published tarball is sane before it's ever eligible for
#    promotion)
NPM_REGISTRY=http://localhost:4873 NPM_TOKEN=verdaccio-local pnpm release:platform
# or:
NPM_REGISTRY=http://localhost:4873 NPM_TOKEN=verdaccio-local pnpm release:sdk
```

After this step: `package.json` versions are bumped, git commit + tag are
created, packages are published to `http://localhost:4873` and verified
against it (`plugins/release/manager-core/src/verdaccio-verify.ts`).

> **Version drift warning:** if publish fails before the git commit/tag step, `package.json`
> files are already bumped but no tag exists. Each retry bumps again. To reset:
> `git diff --name-only | grep "package.json" | xargs git checkout --`

### Validate from Verdaccio (optional manual spot-check)

```bash
# Check a package in the registry
curl http://localhost:4873/@kb-labs/core-platform

# Install from Verdaccio in a separate test project
npm install @kb-labs/core-platform --registry http://localhost:4873
```

### Step 2 — Promote to npm

```bash
# 1. Remove "registry" field from .kb/kb.config.json (or leave it — promote
#    ignores config.registry entirely, it always targets
#    config.publish.npmRegistry / real npm)

# 2. Make sure NPM_TOKEN/NODE_AUTH_TOKEN are NOT set in your shell — a
#    stored bypass-2FA token is exactly what npm now rejects on real npm.
#    Leaving both unset makes promote fall back to an interactive OTP
#    prompt (npm's normal 2FA flow), which still works.
unset NPM_TOKEN NODE_AUTH_TOKEN

# 3. Promote the exact versions committed in Step 1 — no re-bump, no rebuild,
#    no re-plan. Publishes whatever is currently on disk in package.json.
#    You'll be prompted for your npm OTP.
pnpm kb release promote --scope <scope>
# e.g.:
pnpm kb release promote --scope @kb-labs/sdk

# --tag/--registry override config.publish.stableTag/npmRegistry for
# one-off or emergency promotes:
pnpm kb release promote --scope @kb-labs/sdk --tag next
```

Promote is idempotent — re-running it after a partial failure is safe
(already-published versions are treated as success).

## Canary Releases

Canary publishes straight to real npm under a prerelease dist-tag — no
Verdaccio leg, no git commit, no git tag. The version is computed in-memory
as `<base-version>-canary.<shortsha>` and only ever exists on the npm
registry; `package.json` and git history stay untouched.

```bash
pnpm kb release run --flow platform --channel canary --yes
# or:
pnpm kb release run --flow sdk --channel canary --yes

# Preview the canary version shape without publishing:
pnpm kb release plan --flow sdk --channel canary
```

Users install a canary build with `npm install @kb-labs/sdk@canary` (dist-tag
name from `config.publish.canaryTag`, default `canary`). Because canary
versions are deterministic per commit, retrying a failed canary run from the
same commit is naturally idempotent — no checkpoint needed.

---

## Recommended Release Scripts (root package.json)

These scripts are fallback/diagnostic entry points. For an agent stable release,
use `release-prepare`, because these scripts do not provide the workflow approval
step. They run a full build + plugin cache clear BEFORE the release pipeline.

```bash
# Dry-run (safe, no publish, no git)
pnpm release:platform:dry
pnpm release:sdk:dry

# Prepare fallback (no workflow approval; use only with explicit human approval):
# checks, build, version bump, changelog, git commit/tag/push. Never touches npm.
pnpm release:platform:prepare
pnpm release:sdk:prepare

# Manual path only (needs local NPM_TOKEN) — publishes to config.registry
# (Verdaccio for the pre-flight step above, or npm directly if no override
# is set)
pnpm release:platform
pnpm release:sdk
```

Each script does:
1. `node scripts/release-preflight.mjs` — token + registry reachability check
2. `kb-devkit run build` — full topological build of the entire monorepo (CLI discovery cache auto-invalidates via content-hash check)
3. `pnpm kb release run --flow <flow> --skip-build --yes` — pipeline with `--skip-build` (already built)

The preflight reads `NPM_REGISTRY` env var to check the right registry.
For Verdaccio: `NPM_REGISTRY=http://localhost:4873 NPM_TOKEN=verdaccio-local pnpm release:platform`

**Why not build inside the pipeline**: the release CLI is itself a plugin. If `kb-devkit build --affected`
runs inside the pipeline, it may rebuild CLI packages and invalidate the plugin cache mid-run, crashing
the pipeline. Build must happen before the CLI process starts.

## Full Pipeline Stages

`plan → snapshot → checks → build → verify → version bump → changelog → publish → registry verify → git tag`

The last two stages differ by channel:
- **stable**: version bump persists to `package.json`, changelog is generated and written, publish targets `config.registry`, registry verification is mandatory, git commit/tag/push runs. Git tag is `<flow>-v<version>` (e.g. `platform-v2.105.0`, `sdk-v3.2.0`) — see `resolveFlowFromTag`/`buildReleaseTag` in `manager-core/src/tag.ts`.
- **canary**: version bump, changelog, and git commit/tag/push are all skipped — only plan → checks → build → verify → publish run, targeting `config.publish.npmRegistry` (real npm) under `config.publish.canaryTag`.
- **`--skip-publish`** (what `release:*:prepare` uses): everything above runs through changelog + git commit/tag/push, but the publish stage, checkpoint-write, and registry-verify are all skipped — no npm contact, no `NPM_TOKEN` needed. This is fallback-only for an agent when the workflow daemon cannot be restored (see "Как агенту катить релиз").

Skip flags (use with care):
```bash
--skip-checks    # skip pre-release gates
--skip-build     # skip build stage (if already built)
--skip-verify    # skip pack+install verification
--skip-publish   # prepare-only — version/changelog/git tag, never touches npm (agent's normal path)
--dry-run        # simulate everything, no publish/git
--yes            # skip confirmation prompt
--channel        # 'stable' (default) or 'canary'
```

## Pre-release Checks

Configured in `release.checks` in `.kb/kb.config.json`. Currently:
- `build` — `pnpm run build` per scope
- `dist-exports` — `scripts/gates/check-dist-exports.sh` per package
- `pack-install` — `scripts/gates/check-pack-install.sh` per package
- `typecheck`, `lint`, `tests` — optional, per scope

## Version Bump Logic

- `auto` (default): reads conventional commits since last tag
  - `feat:` → minor, `BREAKING CHANGE` / `!:` → major, else → patch
- `platform` flow: lockstep — max bump across all packages → single version for all
- `sdk` flow: independent — `@kb-labs/sdk` bumped on its own commits only

## Changelog

- Template: `corporate-ai` (LLM-enhanced via configured LLM adapter)
- Groups configured in `release.changelog.groups` (Core & SDK, Gateway & API, Adapters, Plugins, Studio)
- Most commits land in **🔧 Other** because they lack a conventional scope
- Output: `.kb/release/CHANGELOG.md` (prepends new version block, deduplicates same-version)
- Fallback to simple bullet list if LLM unavailable

## Config Location

`release` key inside the `profiles[0].products` block in `.kb/kb.config.json`:

```json
"release": {
  "versioningStrategy": "lockstep",
  "channel": "stable",
  "packages": { "exclude": ["templates/*", "{{.Name}}", "@product-name/*"] },
  "flows": {
    "sdk":      { "versioningStrategy": "independent", "packages": { "include": ["@kb-labs/sdk"] } },
    "platform": { "versioningStrategy": "lockstep",    "packages": { "exclude": ["@kb-labs/sdk", "templates/*", "{{.Name}}", "@product-name/*"] } }
  },
  "publish": {
    "access": "public",
    "canaryTag": "canary",
    "stableTag": "latest",
    "npmRegistry": "https://registry.npmjs.org",
    "verifyRegistryTimeoutMs": 30000
  },
  "changelog": {
    "locale": "en",
    "groups": [ ... ]
  },
  "checks": [ ... ]
}
```

`channel` and the `publish.*` fields above are all optional — every default
matches current stable behavior, so omitting them changes nothing.

## Adding a New Flow

Add to `release.flows` in `.kb/kb.config.json`:
```json
"my-flow": {
  "versioningStrategy": "independent",
  "packages": { "include": ["@kb-labs/my-package"] },
  "checks": []
}
```
No code changes needed — flows are config-only.

## Releasing Go Binaries (kb-create, kb-dev, kb-devkit, kb-deploy, kb-monitor)

Go binaries are released separately from npm packages via GitHub Actions + goreleaser.

**Trigger:** push a tag `v<MAJOR>.<MINOR>.<PATCH>-binaries` (e.g. `v0.4.7-binaries`).
The `-binaries` suffix distinguishes it from npm release tags, which now
look like `platform-v2.47.0` / `sdk-v3.2.0` (see "Как агенту катить релиз"
above) — the two tag shapes are structurally disjoint on purpose, so a
binaries tag can never accidentally trigger the npm-publish workflow or
vice versa.

```bash
# 1. Make changes to tools/kb-create/ (or any other tool)
# 2. Build locally to verify
cd tools/kb-create && go build -o kb-create .

# 3. Commit + push code changes
git add tools/kb-create/... && git commit -m "feat(launcher): ..." && git push origin main

# 4. Tag and push — GitHub Actions runs goreleaser for all 5 binaries
git tag v0.4.7-binaries && git push origin v0.4.7-binaries
```

GitHub Actions workflow (`.github/workflows/*.yml`):
- Triggered by `v*-binaries` tag
- Runs goreleaser with root `.goreleaser.yaml`
- Builds all 5 tools: kb-create, kb-dev, kb-devkit, kb-deploy, kb-monitor
- Platforms: darwin/linux/windows × amd64/arm64 (windows arm64 excluded)
- Uploads raw binaries (no archives) as GitHub Release assets
- Release marked `prerelease: false` so `/releases/latest/download/...` works

**Manifest change → install.sh picks it up automatically** — the manifest is
embedded in the binary at build time. No changes to the install script needed.

**Version bump:** increment the patch (or minor/major) from the previous `-binaries` tag.
Check the last tag: `gh release list --repo KirillBaranov/kb-labs --limit 3`

## Source Packages

| Package | Role |
|---------|------|
| `@kb-labs/release-manager-core` | `planRelease()`, `runReleasePipeline()`, `mergeConfigWithFlow()`, versioning strategies, `resolvePublishTag`/`resolvePublishRegistry` (`channel.ts`), `verifyAgainstRegistry` with retry (`verdaccio-verify.ts`), `buildReleaseTag`/`resolveFlowFromTag` — tag grammar, `<flow>-v<version>` (`tag.ts`) |
| `@kb-labs/release-manager-changelog` | Commit parsing, template rendering (`corporate-ai`) |
| `@kb-labs/release-manager-cli` | CLI commands (`plan`, `run`, `changelog`, `publish`, `promote`, `stage`, `deliver`), REST handlers. `stage`/`deliver` are the CI-thin pack-once/ship pair — see "Как агенту катить релиз" above. `pack` (verification-only, `npm pack` + static checks on *proposed* packages) is a different, older command — don't confuse it with `stage` |
| `@kb-labs/release-manager-contracts` | Zod schemas, TypeScript types for REST API (`ReleaseChannelSchema`, etc.) |

## Build After Changes

```bash
pnpm --filter @kb-labs/release-manager-contracts build
pnpm --filter @kb-labs/release-manager-core build
pnpm --filter @kb-labs/release-manager-cli build
```

Build in that order — contracts → core → cli.
