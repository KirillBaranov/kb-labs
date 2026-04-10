---
name: kb-labs-update
description: Use when the user wants to update the installed KB Labs platform, upgrade to a new version, or asks "is there an update". Do not use for updating plugins (handled by the marketplace) or for pnpm-level dependency bumps.
user-invocable: true
---

# Update the KB Labs Platform

Guide the user through a safe platform update using `kb-create update`.

## Step 1: Show current install

Before updating, show what is currently installed so the user can confirm:

```bash
kb-create status
```

## Step 2: Run the update with a dry diff

`kb-create update` already computes and prints the diff before applying
anything. Run it:

```bash
kb-create update
```

Expected output:

- a list of added / updated / removed packages
- a confirmation prompt before applying

Review the diff with the user. Watch for:

- **Removed packages** — was this intentional? If not, abort.
- **Major version bumps** — check release notes before accepting.
- **Core packages** (`@kb-labs/core-*`) — these affect plugin compatibility.

If the user is unsure, they can abort at the prompt — nothing has been written
at that point.

## Step 3: Apply the update

Confirm at the prompt. After `kb-create` finishes, it will also refresh Claude
Code assets under `.claude/skills/kb-labs-*` and the managed CLAUDE.md section.

## Step 4: Verify the update

```bash
kb-create doctor
kb-create status
pnpm kb --help
```

If services are configured:

```bash
pnpm kb-dev restart
pnpm kb-dev status
```

## Step 5: Clear stale caches

After an update, plugin manifests may have changed:

```bash
pnpm kb marketplace clear-cache
```

## If the update fails partway

Do not try to fix things by hand. Run:

```bash
kb-create doctor --json
```

and switch to the `kb-labs-troubleshoot` skill.

## Important rules

- Never bypass `kb-create update` by running `pnpm update @kb-labs/*` manually —
  the launcher tracks state and resolves cross-package versions; manual bumps
  will desynchronise the install.
- Never delete `.kb/kb.config.json` to "start fresh" — it is the main platform
  config and cannot be trivially recreated.
- If the user wants to downgrade, the cleanest path is `kb-create uninstall`
  followed by `kb-create` at the desired version. Warn them that project state
  under `.kb/` is preserved by default but plugin data may be incompatible.
