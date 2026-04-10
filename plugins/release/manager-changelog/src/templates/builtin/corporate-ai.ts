/**
 * AI-Enhanced Corporate Changelog Template
 *
 * Combines structured template format with LLM-powered descriptions:
 * - Template defines sections and hierarchy (Breaking > Features > Fixes)
 * - LLM enhances each group with human-friendly summaries
 * - Graceful degradation if LLM unavailable (falls back to basic descriptions)
 */

import type { TemplateData, PlatformLike } from '../types';
import type { Change } from '../../types';

export const version = '1.0' as const;

export async function render(data: TemplateData, platform?: PlatformLike): Promise<string> {
  const { package: pkg, breaking, changes, locale } = data;
  const lines: string[] = [];

  // Header: standard OSS format  ## [version] - YYYY-MM-DD
  const date = new Date().toISOString().split('T')[0]!;
  const reasonLabel = getReasonLabel(pkg.reason, locale);
  lines.push(`## [${pkg.next}] - ${date}`);
  lines.push('');
  lines.push(`> **${pkg.name}** ${pkg.prev} → ${pkg.next} (${reasonLabel})`);
  lines.push('');

  // Breaking changes (critical section)
  if (breaking.length > 0) {
    const breakingTitle = locale === 'ru' ? '⚠️ КРИТИЧЕСКИЕ ИЗМЕНЕНИЯ' : '⚠️ BREAKING CHANGES';
    lines.push(`### ${breakingTitle}`);
    lines.push('');
    for (const br of breaking) {
      lines.push(`- **${br.summary}**`);
      if (br.notes) {
        lines.push(`  ${br.notes}`);
      }
    }
    lines.push('');
  }

  // Features (AI-enhanced)
  if (changes.feat && changes.feat.length > 0) {
    const featTitle = locale === 'ru' ? '✨ Новые возможности' : '✨ New Features';
    lines.push(`### ${featTitle}`);
    lines.push('');

    const featuresText = await enhanceGroup(platform, changes.feat, 'features', locale);
    lines.push(featuresText);
    lines.push('');
  }

  // Performance improvements (AI-enhanced)
  if (changes.perf && changes.perf.length > 0) {
    const perfTitle = locale === 'ru' ? '⚡ Производительность' : '⚡ Performance Improvements';
    lines.push(`### ${perfTitle}`);
    lines.push('');

    const perfText = await enhanceGroup(platform, changes.perf, 'performance', locale);
    lines.push(perfText);
    lines.push('');
  }

  // Bug fixes (AI-enhanced)
  if (changes.fix && changes.fix.length > 0) {
    const fixTitle = locale === 'ru' ? '🐛 Исправления' : '🐛 Bug Fixes';
    lines.push(`### ${fixTitle}`);
    lines.push('');

    const fixesText = await enhanceGroup(platform, changes.fix, 'fixes', locale);
    lines.push(fixesText);
    lines.push('');
  }

  // Reverts — user-visible (something was undone)
  if (changes.revert && changes.revert.length > 0) {
    const revertTitle = locale === 'ru' ? '⏪ Откаты' : '⏪ Reverts';
    lines.push(`### ${revertTitle}`);
    lines.push('');

    const revertText = await enhanceGroup(platform, changes.revert, 'reverts', locale);
    lines.push(revertText);
    lines.push('');
  }

  // chore / build / ci / test / style / refactor / docs intentionally omitted:
  // they are internal changes and not relevant to package consumers.

  return lines.join('\n').trimEnd();
}

/**
 * Enhance a group of changes with LLM
 * Falls back to basic formatting if LLM unavailable
 */
async function enhanceGroup(
  platform: PlatformLike | undefined,
  commits: Change[],
  groupType: string,
  locale: 'en' | 'ru'
): Promise<string> {
  // Fallback if no LLM
  if (!platform?.llm) {
    platform?.logger?.info?.(`[corporate-ai] No LLM platform for ${groupType}, using basic format`);
    return formatBasicGroup(commits);
  }

  try {
    // Prepare context for LLM
    const commitsContext = commits.map(c => ({
      scope: c.scope || 'general',
      subject: c.subject,
      body: c.body,
      refs: c.refs && c.refs.length > 0 ? c.refs.map(r => `#${r.id}`).join(', ') : undefined,
    }));

    const prompt = buildEnhancementPrompt(commitsContext, groupType, locale);

    const startTime = Date.now();
    const response = await platform.llm.complete(prompt, {
      temperature: 0.7,
      maxTokens: 500,
    });
    const durationMs = Date.now() - startTime;

    // Track LLM usage via analytics
    await platform?.analytics?.track?.('changelog.llm.enhanced', {
      groupType,
      locale,
      commitsCount: commits.length,
      contentLength: response.content.length,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.promptTokens + response.usage.completionTokens,
      durationMs,
      model: response.model,
    });

    // Validate LLM output
    const enhanced = response.content.trim();
    if (enhanced.length === 0) {
      platform?.logger?.warn?.(`[corporate-ai] LLM returned empty content for ${groupType}, using basic format`);
      return formatBasicGroup(commits);
    }

    return enhanced;

  } catch (error) {
    // Graceful degradation on error
    platform?.logger?.error?.(
      `[corporate-ai] LLM enhancement failed for ${groupType}, using basic format`,
      error instanceof Error ? error : undefined
    );
    return formatBasicGroup(commits);
  }
}

/**
 * Build prompt for LLM to enhance a group
 */
function buildEnhancementPrompt(
  commits: Array<{ scope: string; subject: string; body?: string; refs?: string }>,
  groupType: string,
  locale: 'en' | 'ru'
): string {
  const lang = locale === 'ru' ? 'Russian' : 'English';

  const commitsText = commits
    .map(c => `- ${c.scope}: ${c.subject}${c.refs ? ` [refs: ${c.refs}]` : ''}`)
    .join('\n');

  return `You are writing a professional changelog for a software release.

Group type: ${groupType}
Language: ${lang}

Commits in this group:
${commitsText}

Task: Write a clear, user-focused description for each commit as a markdown list.
- Explain WHY each change matters to users, not just WHAT changed
- Use clear, non-technical language when possible
- Keep each item to 1-2 sentences
- Start with scope in **bold** if present
- If a commit has refs like [refs: #123], append them at end of the line as (#123)

Example output format:
- **api**: Enables async request handling, improving throughput under high load (#42)
- **logger**: Fixes memory leak that occurred after 1000+ log entries

Write ONLY the markdown list, no explanations or meta-commentary.`;
}

/**
 * Basic formatting without LLM (fallback).
 * Includes issue/PR refs when present.
 */
function formatBasicGroup(commits: Change[]): string {
  return commits
    .map(c => {
      const scope = c.scope ? `**${c.scope}**` : '';
      const text = scope ? `${scope}: ${c.subject}` : c.subject;
      const refs = formatRefs(c);
      return refs ? `- ${text} (${refs})` : `- ${text}`;
    })
    .join('\n');
}

/**
 * Render issue/PR refs as comma-separated links or plain numbers.
 */
function formatRefs(change: Change): string {
  if (!change.refs || change.refs.length === 0) { return ''; }

  return change.refs
    .map(ref => {
      const issueLink = change.providerLinks?.issues?.find(l => l.endsWith(`/${ref.id}`));
      if (issueLink) { return `[#${ref.id}](${issueLink})`; }
      const prLink = change.providerLinks?.pr?.find(l => l.endsWith(`/${ref.id}`));
      if (prLink) { return `[#${ref.id}](${prLink})`; }
      return `#${ref.id}`;
    })
    .join(', ');
}

function getReasonLabel(reason: string, locale: 'en' | 'ru'): string {
  const labels: Record<string, Record<'en' | 'ru', string>> = {
    breaking: { en: 'major bump from breaking changes', ru: 'major из-за breaking changes' },
    feat: { en: 'minor: new features', ru: 'minor: новая функциональность' },
    fix: { en: 'patch: bug fixes', ru: 'patch: исправления' },
    perf: { en: 'patch: performance', ru: 'patch: производительность' },
    ripple: { en: 'patch: dependency update', ru: 'patch: обновление зависимостей' },
    manual: { en: 'manual', ru: 'ручное' },
  };

  return labels[reason]?.[locale] || reason;
}
