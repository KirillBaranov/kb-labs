---
name: kb-labs-quickstart
description: Use when the user has just installed KB Labs and wants to verify the install, see what is available, or asks "what is kb-labs" / "how do I get started" / "is kb-labs working".
user-invocable: true
---

# KB Labs Quickstart

Help the user verify their KB Labs installation and discover what is available.

## Step 1: Verify the install

Run the doctor command — it checks node, pnpm, the platform directory, and the
installed manifest.

```bash
kb-create doctor
```

If this fails, switch to the `kb-labs-troubleshoot` skill.

## Step 2: Show platform status

```bash
kb-create status
```

This prints the installed platform version, the bound project directory, and the
selected services/plugins.

## Step 3: Show what platform commands are available

```bash
pnpm kb --help
```

The output groups commands by product (mind, qa, marketplace, workflow, etc).
For details on a group:

```bash
pnpm kb <group> --help
```

## Step 4: Check services (only if the user has services installed)

KB Labs ships an internal service manager called `kb-dev`. Check whether anything
is running:

```bash
pnpm kb-dev status
```

States: `alive` / `starting` / `failed` / `stopping` / `dead`. If the user has
no services installed yet, this is empty and that is fine.

## Step 5: Point the user at the right next skill

Based on what the user wants to do:

- Wants to build a plugin → suggest `kb-labs-create-plugin`
- Wants to build a service → suggest `kb-labs-create-product`
- Something is broken → suggest `kb-labs-troubleshoot`
- Wants to see what is installed → suggest `kb-labs-explore`
- Wants to upgrade the platform → suggest `kb-labs-update`

## Important rules

- Never edit files inside `.kb/` directly — it is platform runtime state.
- The user's project config lives at `.kb/kb.config.jsonc` (with comments) and
  is safe to edit.
- If `kb-create` is not on PATH, the user can also call `npx kb-create ...` from
  the project root.
