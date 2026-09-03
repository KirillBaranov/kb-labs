/**
 * Демонстрация работы Profiles v2
 * 
 * Запуск: pnpm tsx demo-profiles.ts
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { readProfilesSection, resolveProfile, selectProfileScope } from './src/index';

async function demo() {
  const tmpDir = path.join(os.tmpdir(), `kb-profiles-demo-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  // Создаем пример kb.config.json с профилями
  const config = {
    profiles: [
      {
        id: 'base',
        label: 'Base Profile',
        description: 'Базовый профиль с настройками по умолчанию',
        products: {
          review: {
            engine: 'openai',
            maxComments: 20,
            riskThreshold: 'medium',
          },
        },
        scopes: [
          {
            id: 'root',
            include: ['**/*'],
            default: true,
            products: {
              review: {
                engine: 'openai',
              },
            },
          },
        ],
      },
      {
        id: 'frontend',
        label: 'Frontend Profile',
        extends: 'base',
        description: 'Профиль для фронтенда с другим движком',
        products: {
          review: {
            engine: 'anthropic',
            maxComments: 10,
          },
        },
        scopes: [
          {
            id: 'frontend',
            include: ['src/frontend/**', 'apps/web/**'],
            default: true,
            products: {
              review: {
                engine: 'anthropic',
                maxComments: 5,
              },
            },
          },
          {
            id: 'backend',
            include: ['src/backend/**', 'apps/api/**'],
            products: {
              review: {
                engine: 'openai',
                maxComments: 15,
              },
            },
          },
        ],
      },
    ],
  };

  await fs.writeFile(
    path.join(tmpDir, 'kb.config.json'),
    JSON.stringify(config, null, 2)
  );

  console.log('📁 Создан kb.config.json с профилями:\n');
  console.log(JSON.stringify(config, null, 2));
  console.log('\n' + '='.repeat(80) + '\n');

  // 1. Чтение profiles section
  console.log('1️⃣ Чтение profiles[] из kb.config.json:\n');
  const profilesSection = await readProfilesSection(tmpDir);
  console.log(`Найдено профилей: ${profilesSection.profiles.length}`);
  console.log(`Источник: ${profilesSection.sourcePath || 'не найден'}`);
  profilesSection.profiles.forEach((p) => {
    console.log(`  - ${p.id}${p.label ? ` (${p.label})` : ''}`);
  });
  console.log('\n' + '='.repeat(80) + '\n');

  // 2. Разрешение базового профиля
  console.log('2️⃣ Разрешение базового профиля "base":\n');
  const baseProfile = await resolveProfile({ cwd: tmpDir, profileId: 'base' });
  console.log(`ID: ${baseProfile.id}`);
  console.log(`Label: ${baseProfile.label}`);
  console.log(`Source: ${baseProfile.source}`);
  console.log(`Products:`, JSON.stringify(baseProfile.products, null, 2));
  console.log(`Scopes:`, baseProfile.scopes.map((s) => s.id).join(', '));
  console.log('\n' + '='.repeat(80) + '\n');

  // 3. Разрешение профиля с extends
  console.log('3️⃣ Разрешение профиля "frontend" с extends="base":\n');
  const frontendProfile = await resolveProfile({
    cwd: tmpDir,
    profileId: 'frontend',
  });
  console.log(`ID: ${frontendProfile.id}`);
  console.log(`Label: ${frontendProfile.label}`);
  console.log(`Source: ${frontendProfile.source}`);
  console.log(`Trace (extends):`, frontendProfile.trace?.extends || []);
  console.log(
    `Products (merged):`,
    JSON.stringify(frontendProfile.products, null, 2)
  );
  console.log(
    `  → engine: ${frontendProfile.products?.review?.engine} (переопределен)`
  );
  console.log(
    `  → maxComments: ${frontendProfile.products?.review?.maxComments} (переопределен)`
  );
  console.log(
    `  → riskThreshold: ${frontendProfile.products?.review?.riskThreshold} (унаследован от base)`
  );
  console.log(`Scopes:`, frontendProfile.scopes.map((s) => s.id).join(', '));
  console.log('\n' + '='.repeat(80) + '\n');

  // 4. Выбор scope
  console.log('4️⃣ Выбор scope для профиля "frontend":\n');
  
  // Выбор default scope
  const defaultScope = selectProfileScope({
    bundleProfile: frontendProfile,
    cwd: tmpDir,
    executionPath: tmpDir,
  });
  console.log(`Strategy: ${defaultScope.strategy}`);
  console.log(`Selected scope: ${defaultScope.scope?.id || 'none'}`);
  if (defaultScope.scope) {
    console.log(
      `Scope products:`,
      JSON.stringify(defaultScope.scope.products, null, 2)
    );
  }
  console.log('\n');

  // Выбор scope по пути
  const frontendPath = path.join(tmpDir, 'src', 'frontend', 'component.ts');
  await fs.mkdir(path.dirname(frontendPath), { recursive: true });
  await fs.writeFile(frontendPath, '// frontend code');
  
  const frontendScope = selectProfileScope({
    bundleProfile: frontendProfile,
    cwd: tmpDir,
    executionPath: frontendPath,
  });
  console.log(`Execution path: ${frontendPath}`);
  console.log(`Strategy: ${frontendScope.strategy}`);
  console.log(`Selected scope: ${frontendScope.scope?.id || 'none'}`);
  if (frontendScope.scope) {
    console.log(
      `Scope products:`,
      JSON.stringify(frontendScope.scope.products, null, 2)
    );
  }
  console.log('\n');

  // Выбор scope по explicit scopeId
  const backendScope = selectProfileScope({
    bundleProfile: frontendProfile,
    cwd: tmpDir,
    executionPath: tmpDir,
    scopeId: 'backend',
  });
  console.log(`Explicit scopeId: backend`);
  console.log(`Strategy: ${backendScope.strategy}`);
  console.log(`Selected scope: ${backendScope.scope?.id || 'none'}`);
  if (backendScope.scope) {
    console.log(
      `Scope products:`,
      JSON.stringify(backendScope.scope.products, null, 2)
    );
  }
  console.log('\n' + '='.repeat(80) + '\n');

  // 5. Products by scope
  console.log('5️⃣ Products by scope (мердж profile + scope):\n');
  console.log(
    `Products for scope "frontend":`,
    JSON.stringify(frontendProfile.productsByScope?.frontend, null, 2)
  );
  console.log(
    `Products for scope "backend":`,
    JSON.stringify(frontendProfile.productsByScope?.backend, null, 2)
  );
  console.log('\n' + '='.repeat(80) + '\n');

  // Очистка
  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log('✅ Демонстрация завершена!');
}

demo().catch(console.error);

