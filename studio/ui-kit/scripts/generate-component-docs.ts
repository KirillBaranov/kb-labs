#!/usr/bin/env tsx
/**
 * Автоматическая генерация глоссария компонентов для README.md
 *
 * Сканирует src/ директорию, находит все компоненты и генерирует таблицу
 * с категориями, именами, описаниями и props.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Component {
  name: string;
  category: string;
  description: string;
  file: string;
  hasTests: boolean;
}

const CATEGORIES = [
  'primitives',
  'core',
  'layout',
  'form',
  'navigation',
  'composite',
  'feedback',
  'overlay',
  'content',
] as const;

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  primitives: 'Foundation components for layout and typography',
  core: 'Essential UI components',
  layout: 'Layout and container components',
  form: 'Form controls and inputs',
  navigation: 'Navigation and menu components',
  composite: 'Complex composed components',
  feedback: 'Feedback and notification components',
  overlay: 'Modal and overlay components',
  content: 'Content display components',
};

/**
 * Извлекает JSDoc комментарий из файла компонента
 */
function extractDescription(filePath: string): string {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Ищем первый JSDoc комментарий в начале файла
    const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)(?:\s*\n\s*\*\s*\n|\s*\n\s*\*\/)/);
    if (jsdocMatch) {
      return jsdocMatch[1].trim();
    }

    // Ищем export function ComponentName с JSDoc
    const exportMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\s*\n[\s\S]*?\*\/\s*export\s+function/);
    if (exportMatch) {
      return exportMatch[1].trim();
    }

    // Fallback: берем имя компонента из имени файла
    const fileName = filePath.split('/').pop()?.replace('.tsx', '') || 'Component';
    return fileName;
  } catch (error) {
    return 'Component';
  }
}

/**
 * Сканирует директорию категории и находит все компоненты
 */
function scanCategory(category: string, srcPath: string): Component[] {
  const categoryPath = join(srcPath, category);
  const components: Component[] = [];

  try {
    const files = readdirSync(categoryPath);

    for (const file of files) {
      // Пропускаем index.ts, тесты и не-tsx файлы
      if (file === 'index.ts' || file.endsWith('.test.tsx') || !file.endsWith('.tsx')) {
        continue;
      }

      const componentName = file.replace('.tsx', '');
      const filePath = join(categoryPath, file);
      const testPath = join(categoryPath, `${componentName}.test.tsx`);

      let hasTests = false;
      try {
        statSync(testPath);
        hasTests = true;
      } catch {
        // No test file
      }

      const description = extractDescription(filePath);

      components.push({
        name: componentName,
        category,
        description,
        file: relative(srcPath, filePath),
        hasTests,
      });
    }
  } catch (error) {
    // Category directory doesn't exist
  }

  return components;
}

/**
 * Генерирует таблицу компонентов в Markdown
 */
function generateComponentTable(components: Component[]): string {
  const lines: string[] = [];

  // Группируем по категориям
  const byCategory = components.reduce((acc, comp) => {
    if (!acc[comp.category]) {
      acc[comp.category] = [];
    }
    acc[comp.category].push(comp);
    return acc;
  }, {} as Record<string, Component[]>);

  for (const category of CATEGORIES) {
    const categoryComponents = byCategory[category];
    if (!categoryComponents || categoryComponents.length === 0) {
      continue;
    }

    const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
    const categoryDesc = CATEGORY_DESCRIPTIONS[category] || '';

    lines.push(`### ${categoryName}`);
    lines.push('');
    lines.push(categoryDesc);
    lines.push('');
    lines.push('| Component | Description | Tests |');
    lines.push('|-----------|-------------|-------|');

    // Сортируем компоненты по имени
    categoryComponents.sort((a, b) => a.name.localeCompare(b.name));

    for (const comp of categoryComponents) {
      const testBadge = comp.hasTests ? '✅' : '❌';
      lines.push(`| **${comp.name}** | ${comp.description} | ${testBadge} |`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Генерирует статистику компонентов
 */
function generateStats(components: Component[]): string {
  const total = components.length;
  const withTests = components.filter(c => c.hasTests).length;
  const testCoverage = total > 0 ? Math.round((withTests / total) * 100) : 0;

  const byCategory = components.reduce((acc, comp) => {
    acc[comp.category] = (acc[comp.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const lines: string[] = [];
  lines.push('## 📊 Component Stats');
  lines.push('');
  lines.push(`- **Total Components:** ${total}`);
  lines.push(`- **With Tests:** ${withTests}/${total} (${testCoverage}%)`);
  lines.push('');
  lines.push('**By Category:**');
  lines.push('');

  for (const category of CATEGORIES) {
    const count = byCategory[category] || 0;
    if (count > 0) {
      const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
      lines.push(`- ${categoryName}: ${count}`);
    }
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Обновляет README.md с автоматически сгенерированным контентом
 */
function updateReadme(readmePath: string, componentTable: string, stats: string): void {
  const content = readFileSync(readmePath, 'utf-8');

  // Маркеры для автоматической генерации
  const START_MARKER = '<!-- AUTO-GENERATED:START -->';
  const END_MARKER = '<!-- AUTO-GENERATED:END -->';

  const startIndex = content.indexOf(START_MARKER);
  const endIndex = content.indexOf(END_MARKER);

  if (startIndex === -1 || endIndex === -1) {
    console.error('⚠️  Markers not found in README.md. Add these markers:');
    console.error('   <!-- AUTO-GENERATED:START -->');
    console.error('   <!-- AUTO-GENERATED:END -->');
    process.exit(1);
  }

  const before = content.substring(0, startIndex + START_MARKER.length);
  const after = content.substring(endIndex);

  const newContent = [
    before,
    '',
    stats,
    '## 📚 Component Reference',
    '',
    componentTable,
    after,
  ].join('\n');

  writeFileSync(readmePath, newContent, 'utf-8');
}

/**
 * Main
 */
function main() {
  console.log('🔍 Scanning components...');

  const rootDir = join(__dirname, '..');
  const srcPath = join(rootDir, 'src');
  const readmePath = join(rootDir, 'README.md');

  // Сканируем все категории
  const allComponents: Component[] = [];
  for (const category of CATEGORIES) {
    const components = scanCategory(category, srcPath);
    allComponents.push(...components);
    if (components.length > 0) {
      console.log(`  ✓ ${category}: ${components.length} components`);
    }
  }

  console.log(`\n📊 Total: ${allComponents.length} components\n`);

  // Генерируем таблицу и статистику
  const componentTable = generateComponentTable(allComponents);
  const stats = generateStats(allComponents);

  // Обновляем README
  updateReadme(readmePath, componentTable, stats);

  console.log('✅ README.md updated successfully!\n');

  // Показываем статистику тестов
  const withTests = allComponents.filter(c => c.hasTests).length;
  const testCoverage = Math.round((withTests / allComponents.length) * 100);
  console.log(`📈 Test Coverage: ${withTests}/${allComponents.length} (${testCoverage}%)`);
}

main();
