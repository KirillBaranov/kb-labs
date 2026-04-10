/**
 * Загрузка переменных окружения из .env файла
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Загружает переменные окружения из .env файла в process.env
 * Не перезаписывает существующие переменные
 */
export function loadEnvFile(cwd: string): void {
  const envPath = join(cwd, '.env');
  
  if (!existsSync(envPath)) {
    return;
  }

  try {
    const content = readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Пропускаем комментарии и пустые строки
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Парсим KEY=VALUE
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex === -1) {
        continue;
      }

      const key = trimmed.substring(0, equalIndex).trim();
      const value = trimmed.substring(equalIndex + 1).trim();

      // Убираем кавычки если есть
      const unquotedValue = value
        .replace(/^["'](.*)["']$/, '$1')
        .replace(/^`(.*)`$/, '$1');

      // Устанавливаем только если переменная еще не установлена
      if (key && !(key in process.env)) {
        process.env[key] = unquotedValue;
      }
    }
  } catch (_error) {
    // Молча игнорируем ошибки загрузки .env
    // Это не критично для работы CLI
  }
}

