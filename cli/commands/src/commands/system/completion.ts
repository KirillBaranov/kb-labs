/**
 * kb completion bash|zsh|fish  — print shell completion script
 * kb completion install         — bake static completions into shell profile (instant Tab)
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { TrieBackedRegistry } from '../../registry/service';

type CompletionResult = CommandResult & { ok: boolean; status: string; script: string; shell: string };
type InstallResult   = CommandResult & { ok: boolean; status: string; shell: string; profilePath: string; alreadyInstalled: boolean };

const MARKER      = '# kb completion';
const STATIC_FILE = path.join(os.homedir(), '.config', 'kb', 'completion.zsh');

// ─── Dynamic scripts (fallback) ───────────────────────────────────────────────

function dynamicScript(shell: string): string | null {
  switch (shell) {
    case 'bash': return [
      '_kb_completion() {',
      '  local words cur',
      '  cur="${COMP_WORDS[COMP_CWORD]}"',
      '  words="${COMP_WORDS[*]:1:$((COMP_CWORD - 1))}"',
      '  COMPREPLY=($(kb __complete $words "$cur" 2>/dev/null))',
      '  return 0',
      '}',
      'complete -o nospace -F _kb_completion kb',
    ].join('\n');

    case 'zsh': return [
      '#compdef kb',
      '_kb_completion() {',
      '  local completions',
      '  completions=($(kb __complete ${words[2,-1]} 2>/dev/null))',
      '  compadd -a completions',
      '}',
      'compdef _kb_completion kb',
    ].join('\n');

    case 'fish': return [
      'function __kb_complete',
      '  set -l tokens (commandline -opc)',
      '  kb __complete $tokens[2..] (commandline -ct) 2>/dev/null',
      'end',
      'complete -c kb -f -a "(__kb_complete)"',
    ].join('\n');

    default: return null;
  }
}

// ─── Static zsh script generator ─────────────────────────────────────────────

function buildStaticZsh(tree: Map<string, Map<string, string[]>>): string {
  const lines: string[] = ['#compdef kb', '_kb() {'];

  // Level 1
  const l1 = [...tree.keys()];
  lines.push(`  if [[ $CURRENT -eq 2 ]]; then`);
  lines.push(`    compadd -- ${l1.join(' ')}`);
  lines.push(`    return`);
  lines.push(`  fi`);

  // Level 2
  lines.push(`  if [[ $CURRENT -eq 3 ]]; then`);
  lines.push(`    case $words[2] in`);
  for (const [cmd, subMap] of tree) {
    const subs = [...subMap.keys()];
    if (subs.length > 0) {
      lines.push(`      ${cmd}) compadd -- ${subs.join(' ')} ;;`);
    }
  }
  lines.push(`    esac`);
  lines.push(`    return`);
  lines.push(`  fi`);

  // Level 3
  lines.push(`  if [[ $CURRENT -eq 4 ]]; then`);
  lines.push(`    case "$words[2] $words[3]" in`);
  for (const [cmd, subMap] of tree) {
    for (const [sub, leaves] of subMap) {
      if (leaves.length > 0) {
        // strip the "cmd sub " prefix from leaf names to get the last segment
        const bare = leaves.map(l => l.split(' ').pop() ?? l);
        lines.push(`      "${cmd} ${sub}") compadd -- ${bare.join(' ')} ;;`);
      }
    }
  }
  lines.push(`    esac`);
  lines.push(`    return`);
  lines.push(`  fi`);

  lines.push(`}`, `compdef _kb kb`);

  // Hook into pnpm completion for 'pnpm kb ...' without breaking regular pnpm tab
  lines.push(``, `# pnpm kb — same completions, shifted by 1 position`);
  lines.push(`_kb_pnpm_wrap() {`);
  lines.push(`  if [[ \${words[2]-} == kb ]]; then`);
  lines.push(`    local CURRENT=$((CURRENT - 1))`);
  lines.push(`    local -a words=("kb" "\${words[3,-1]}")`);
  lines.push(`    [[ $CURRENT -lt 1 ]] && CURRENT=1`);
  lines.push(`    _kb`);
  lines.push(`    return 0`);
  lines.push(`  fi`);
  lines.push(`  (( $+functions[_pnpm_orig] )) && { _pnpm_orig; return; }`);
  lines.push(`  return 1`);
  lines.push(`}`);
  lines.push(`if (( $+functions[_pnpm] )) && ! (( $+functions[_pnpm_orig] )); then`);
  lines.push(`  functions[_pnpm_orig]=$functions[_pnpm]`);
  lines.push(`  _pnpm() { _kb_pnpm_wrap; }`);
  lines.push(`else`);
  lines.push(`  compdef _kb_pnpm_wrap pnpm`);
  lines.push(`fi`);

  return lines.join('\n');
}

async function collectTree(registry: TrieBackedRegistry): Promise<Map<string, Map<string, string[]>>> {
  const tree = new Map<string, Map<string, string[]>>();
  const l1 = registry.complete(['']);
  for (const cmd of l1) {
    const subMap = new Map<string, string[]>();
    const l2 = registry.complete([cmd, '']);
    for (const full2 of l2) {
      const sub = full2.split(' ').pop() ?? full2;
      const l3 = registry.complete([cmd, sub, '']);
      subMap.set(sub, l3);
    }
    tree.set(cmd, subMap);
  }
  return tree;
}

// ─── Shell helpers ────────────────────────────────────────────────────────────

function detectShell(): string {
  const name = path.basename(process.env['SHELL'] ?? '');
  return ['bash', 'zsh', 'fish'].includes(name) ? name : 'zsh';
}

function profilePath(shell: string): string {
  const home = os.homedir();
  if (shell === 'bash') { return path.join(home, '.bashrc'); }
  if (shell === 'fish') { return path.join(home, '.config', 'fish', 'config.fish'); }
  return path.join(home, '.zshrc');
}

function profileLine(shell: string): string {
  if (shell === 'zsh') { return `${MARKER}\n[ -f "${STATIC_FILE}" ] && source "${STATIC_FILE}"`; }
  if (shell === 'fish') { return `${MARKER}\ntest -f "${STATIC_FILE}" && source "${STATIC_FILE}"`; }
  // bash: fall back to dynamic since static file is zsh-specific
  return `${MARKER}\ncommand -v kb &>/dev/null && eval "$(kb completion bash 2>/dev/null)" || true`;
}

// ─── Auto-update ──────────────────────────────────────────────────────────────

function commandsHash(registry: TrieBackedRegistry): string {
  const keys = registry.complete(['']).sort().join(',');
  return createHash('sha256').update(keys).digest('hex').slice(0, 12);
}

function hashFromFile(content: string): string | null {
  const m = content.match(/^# hash: ([a-f0-9]+)/m);
  return m?.[1] ?? null;
}

export async function autoUpdateCompletion(registry: TrieBackedRegistry): Promise<void> {
  // Only update if the static file exists (user opted in via `completion install`)
  try { await fs.access(STATIC_FILE); } catch { return; }

  const current = commandsHash(registry);
  let existing = '';
  try { existing = await fs.readFile(STATIC_FILE, 'utf8'); } catch { return; }

  if (hashFromFile(existing) === current) { return; } // nothing changed

  const tree   = await collectTree(registry);
  const script = `# hash: ${current}\n` + buildStaticZsh(tree);
  await fs.writeFile(STATIC_FILE, script, 'utf8');
}

// ─── Command factory ──────────────────────────────────────────────────────────

export function createCompletionCommand(registry: TrieBackedRegistry) {
  return defineSystemCommand({
    name: 'completion',
    description: 'Generate or install shell completion',
    longDescription:
      'Print a shell completion script or bake a static one into your shell profile.\n\n' +
      'Usage:\n' +
      '  kb completion install   # auto-detect shell, write static file, add to profile\n' +
      '  kb completion zsh       # print dynamic zsh script\n' +
      '  kb completion bash      # print dynamic bash script\n' +
      '  kb completion fish      # print dynamic fish script',
    flags: {},

    async handler(_ctx, argv) {
      const arg = argv[0];

      // ── install ────────────────────────────────────────────────────────────
      if (!arg || arg === 'install') {
        const shell = argv[1] ?? detectShell();

        // For zsh: generate static file
        if (shell === 'zsh') {
          const tree   = await collectTree(registry);
          const hash   = commandsHash(registry);
          const script = `# hash: ${hash}\n` + buildStaticZsh(tree);
          await fs.mkdir(path.dirname(STATIC_FILE), { recursive: true });
          await fs.writeFile(STATIC_FILE, script, 'utf8');
        }

        // Ensure profile sources it
        const rcPath = profilePath(shell);
        let existing = '';
        try { existing = await fs.readFile(rcPath, 'utf8'); } catch { /* first time */ }

        const alreadyInstalled = existing.includes(MARKER);
        if (!alreadyInstalled) {
          await fs.appendFile(rcPath, `\n${profileLine(shell)}\n`);
        } else if (shell === 'zsh') {
          // Static file already updated — profile line unchanged, just updated the file
        }

        return { ok: true, status: 'success', shell, profilePath: rcPath, alreadyInstalled } as InstallResult;
      }

      // ── print dynamic script ───────────────────────────────────────────────
      const script = dynamicScript(arg);
      if (!script) { throw new Error(`Unsupported shell: ${arg}. Supported: bash, zsh, fish`); }
      return { ok: true, status: 'success', script, shell: arg } as CompletionResult;
    },

    formatter(result) {
      if ('script' in result) {
        process.stdout.write(result.script + '\n');
        return;
      }
      const r = result as InstallResult;
      if (r.shell === 'zsh') {
        process.stdout.write(`✓ Static completions → ${STATIC_FILE}\n`);
      }
      if (r.alreadyInstalled) {
        process.stdout.write(`Profile already configured: ${r.profilePath}\n`);
        process.stdout.write(`Run: source ${r.profilePath}\n`);
      } else {
        process.stdout.write(`✓ Added to ${r.profilePath}\n`);
        process.stdout.write(`Run: source ${r.profilePath}\n`);
      }
    },
  });
}
