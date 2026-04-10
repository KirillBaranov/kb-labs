/**
 * @module @kb-labs/review-llm/llm-lite/prompt-loader
 * Load prompts and rules from .kb/ai-review/ directory.
 *
 * Reads markdown files and builds context for LLM prompts.
 */

import type { ReviewConfig } from '@kb-labs/review-contracts';
import { useConfig } from '@kb-labs/sdk';
import { readdir, readFile, access } from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Rule frontmatter metadata
 */
export interface RuleFrontmatter {
  /** Unique rule ID (e.g., "security/no-eval") */
  id: string;
  /** Default severity for this rule */
  severity?: 'blocker' | 'high' | 'medium' | 'low' | 'info';
  /** Rule type: 'positive' (report these issues) or 'negative' (do NOT report these) */
  type?: 'positive' | 'negative';
}

/**
 * Loaded rule content
 */
export interface RuleContent {
  /** Rule category (directory name) */
  category: string;
  /** Rule name (filename without extension) */
  name: string;
  /** Rule content (markdown without frontmatter) */
  content: string;
  /** Rule ID from frontmatter (e.g., "security/no-eval") */
  id?: string;
  /** Default severity from frontmatter */
  severity?: 'blocker' | 'high' | 'medium' | 'low' | 'info';
  /** Rule type: 'positive' (report these) or 'negative' (do NOT report these) */
  type?: 'positive' | 'negative';
}

/**
 * Loaded prompts
 */
export interface LoadedPrompts {
  /** System prompt (from prompts/system.md or default) */
  system: string;
  /** Task prompt (from prompts/task.md or default) */
  task: string;
  /** Rules content by category */
  rules: Record<string, RuleContent[]>;
  /** All rules as formatted string for prompt */
  rulesContext: string;
  /** Set of valid rule IDs for validation */
  ruleIds: Set<string>;
}

/**
 * Default system prompt (fallback if no file exists)
 */
const DEFAULT_SYSTEM_PROMPT = `You are a code reviewer analyzing changes in a codebase.

Your goal is to find REAL issues in the code - not hypothetical problems.

## Instructions

1. First, use get_diffs() to fetch diffs for suspicious files
2. Analyze the actual changes in the diffs
3. If you need more context, use get_file_chunks() sparingly
4. Report all findings using report_findings()

## Important Rules

- Only report issues you actually see in the code
- Include specific line numbers FROM THE DIFFS
- Include code snippets to prove the issue exists
- Focus on: security, correctness, performance, maintainability
- Don't report style issues unless they affect readability significantly

## What NOT to Report (False Positives)

- Constructor validation patterns - this is standard practice
- "Make this configurable" suggestions unless explicitly broken
- Async methods that don't await - may be intentional for interface compatibility
- "Add error handling" for internal code paths that can't fail
- Port/timeout validation for internal tools
- Empty dispose() methods - placeholder for future cleanup
- Optional logger parameters - dependency injection is valid

## Severity Calibration

Be CONSERVATIVE with severity. When in doubt, use lower severity.

### blocker (ONLY for these)
- Exploitable security vulnerability (SQL injection, XSS, RCE)
- Data loss or corruption risk
- Application crash in production path
- Authentication/authorization bypass

### high (Real bugs affecting behavior)
- Logic error causing incorrect results
- Race condition that can occur in practice
- Resource leak (memory, file handles, connections)
- Unhandled error that breaks functionality

### medium (Code smells, potential issues)
- Missing null/undefined check where input CAN be null
- Floating promise without explicit void
- Type safety bypass (any, type assertion without validation)

### low (Suggestions)
- Naming could be clearer
- Code could be simplified
- Missing documentation for public API

### info (Notes)
- FYI about pattern usage
- Style preference (not rule violation)`;

/**
 * Default task prompt (fallback if no file exists)
 */
const DEFAULT_TASK_PROMPT = `## Your Task

1. Review the file list and identify files most likely to have issues:
   - Security-sensitive files (auth, crypto, input handling)
   - Files with large changes (+50 lines)
   - New files (need thorough review)
   - Core business logic

2. Use get_diffs() to fetch diffs for suspicious files (max 15 per call)

3. Analyze the diffs for:
   - Security vulnerabilities (REAL, exploitable ones)
   - Logic errors and edge cases
   - Performance issues (measurable impact)
   - Code quality problems (actual bugs, not style)

4. Report all findings using report_findings()

## Quality Bar

Before reporting a finding, ask yourself:
- Is this a REAL issue or just my opinion?
- Would fixing this actually improve the code?
- Is the severity I'm assigning accurate?

Focus on ACTUAL issues in the changed code, not hypothetical problems.`;

/**
 * Load all prompts and rules from .kb/ai-review/
 */
export async function loadPrompts(cwd: string): Promise<LoadedPrompts> {
  const config = await useConfig<ReviewConfig>('review');

  const kbDir = path.join(cwd, '.kb');
  const rulesDir = path.join(kbDir, config?.rulesDir ?? 'ai-review/rules');
  const promptsDir = path.join(kbDir, config?.promptsDir ?? 'ai-review/prompts');

  // Load system and task prompts
  const system = await loadPromptFile(promptsDir, 'system.md', DEFAULT_SYSTEM_PROMPT);
  const task = await loadPromptFile(promptsDir, 'task.md', DEFAULT_TASK_PROMPT);

  // Load rules by category
  const rules = await loadRules(rulesDir);

  // Collect all rule IDs for validation
  const ruleIds = new Set<string>();
  for (const categoryRules of Object.values(rules)) {
    for (const rule of categoryRules) {
      if (rule.id) {
        ruleIds.add(rule.id);
      }
    }
  }

  // Format rules as context string
  const rulesContext = formatRulesContext(rules);

  return { system, task, rules, rulesContext, ruleIds };
}

/**
 * Load a single prompt file with fallback
 */
async function loadPromptFile(dir: string, filename: string, fallback: string): Promise<string> {
  try {
    const filePath = path.join(dir, filename);
    await access(filePath);
    const content = await readFile(filePath, 'utf-8');
    return content.trim();
  } catch {
    return fallback;
  }
}

/**
 * Load all rules from rules directory
 */
async function loadRules(rulesDir: string): Promise<Record<string, RuleContent[]>> {
  const rules: Record<string, RuleContent[]> = {};

  try {
    await access(rulesDir);
  } catch {
    return rules;
  }

  // Read category directories
  const entries = await readdir(rulesDir, { withFileTypes: true });
  const categories = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

  for (const categoryDir of categories) {
    const category = categoryDir.name;

    // Path traversal protection: skip names with path separators or '..'
    if (category.includes('..') || category.includes(path.sep) || category.includes('/')) {
      continue;
    }

    const categoryPath = path.join(rulesDir, category);

    // Read rule files in category
    // eslint-disable-next-line no-await-in-loop -- Sequential directory reading
    const ruleFiles = await readdir(categoryPath, { withFileTypes: true });
    const mdFiles = ruleFiles.filter(f => f.isFile() && f.name.endsWith('.md'));

    rules[category] = [];

    for (const ruleFile of mdFiles) {
      // Path traversal protection: skip names with path separators or '..'
      if (ruleFile.name.includes('..') || ruleFile.name.includes(path.sep) || ruleFile.name.includes('/')) {
        continue;
      }

      const ruleName = ruleFile.name.replace('.md', '');
      const rulePath = path.join(categoryPath, ruleFile.name);

      try {
        // eslint-disable-next-line no-await-in-loop -- Sequential file reading for rule loading
        const rawContent = await readFile(rulePath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(rawContent);

        rules[category].push({
          category,
          name: ruleName,
          content: body.trim(),
          id: frontmatter?.id,
          severity: frontmatter?.severity,
          type: frontmatter?.type ?? 'positive', // Default to positive rule
        });
      } catch {
        // Skip unreadable files
      }
    }
  }

  return rules;
}

/**
 * Format rules as context string for prompt
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Complex multi-level categorization and formatting of rules into structured prompt sections
function formatRulesContext(rules: Record<string, RuleContent[]>): string {
  const positiveSections: string[] = [];
  const negativeSections: string[] = [];

  for (const [category, categoryRules] of Object.entries(rules)) {
    if (categoryRules.length === 0) {
      continue;
    }

    // Separate positive and negative rules
    const positiveRules = categoryRules.filter(r => r.type !== 'negative');
    const negativeRules = categoryRules.filter(r => r.type === 'negative');

    // Format positive rules (issues to report)
    if (positiveRules.length > 0) {
      positiveSections.push(`## ${capitalize(category)} Rules\n`);
      for (const rule of positiveRules) {
        if (rule.id) {
          positiveSections.push(`### Rule: ${rule.id}\n`);
        }
        positiveSections.push(rule.content);
        positiveSections.push('');
      }
    }

    // Format negative rules (patterns NOT to report)
    if (negativeRules.length > 0) {
      for (const rule of negativeRules) {
        if (rule.id) {
          negativeSections.push(`### ${rule.id}\n`);
        }
        negativeSections.push(rule.content);
        negativeSections.push('');
      }
    }
  }

  if (positiveSections.length === 0 && negativeSections.length === 0) {
    return '';
  }

  // Collect positive rule IDs for the explicit list
  const allRuleIds: string[] = [];
  for (const categoryRules of Object.values(rules)) {
    for (const rule of categoryRules) {
      if (rule.id && rule.type !== 'negative') {
        allRuleIds.push(rule.id);
      }
    }
  }

  const ruleIdList = allRuleIds.length > 0
    ? `\n\n**Available Rule IDs:** ${allRuleIds.join(', ')}`
    : '';

  // Build false positive prevention section
  const falsePositiveSection = negativeSections.length > 0
    ? `\n\n## FALSE POSITIVE PREVENTION (Do NOT Report These)\n\n**CRITICAL:** Before reporting any issue, check if it matches a pattern below. If it does, DO NOT REPORT IT.\n\n${negativeSections.join('\n')}`
    : '';

  return `# Project-Specific Rules (MANDATORY)

## CRITICAL: You MUST Use Rule IDs

When reporting findings, you MUST check if the issue matches one of these project rules and use the exact ruleId:
${ruleIdList}

### How to Report:

1. **If issue matches a rule** → Use the EXACT ruleId from the list above
   Example: \`"ruleId": "security/path-traversal"\` or \`"ruleId": "consistency/validation-logic"\`

2. **If issue does NOT match any rule** → Use \`"ruleId": null\`

### Examples:

- Path traversal issue → \`"ruleId": "security/path-traversal"\`
- Input validation issue → \`"ruleId": "security/input-validation"\`
- Inconsistent validation logic → \`"ruleId": "consistency/validation-logic"\`
- Dead code → \`"ruleId": "architecture/dead-code-paths"\`
- Some other issue not in rules → \`"ruleId": null\`

## Project Rules

${positiveSections.join('\n')}${falsePositiveSection}`;
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Parse YAML frontmatter from markdown content
 *
 * Frontmatter format:
 * ---
 * id: category/rule-name
 * severity: medium
 * ---
 */
function parseFrontmatter(content: string): { frontmatter: RuleFrontmatter | null; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n*/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: null, body: content };
  }

  const yamlContent = match[1] ?? '';
  const body = content.slice(match[0].length);

  // Simple YAML parsing (id and severity only)
  const frontmatter: Partial<RuleFrontmatter> = {};

  for (const line of yamlContent.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (key === 'id') {
      frontmatter.id = value;
    } else if (key === 'severity') {
      const validSeverities = ['blocker', 'high', 'medium', 'low', 'info'];
      if (validSeverities.includes(value)) {
        frontmatter.severity = value as RuleFrontmatter['severity'];
      }
    } else if (key === 'type' && (value === 'positive' || value === 'negative')) {
      frontmatter.type = value;
    }
  }

  if (!frontmatter.id) {
    return { frontmatter: null, body: content };
  }

  return { frontmatter: frontmatter as RuleFrontmatter, body };
}
