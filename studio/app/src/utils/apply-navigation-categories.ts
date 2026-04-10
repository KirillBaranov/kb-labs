/**
 * @module @kb-labs/studio-app/utils/apply-navigation-categories
 * Pure transform: flat NavigationItem[] + user categories → grouped NavigationItem[]
 */

import type { NavigationCategory } from '../providers/settings-provider';
import type { NavigationItem } from '@/components/ui';

const PROTECTED_KEYS = new Set(['settings']);

/**
 * Apply user's category configuration to the flat navigation items list.
 *
 * - Items assigned to a category are grouped under that category's header
 * - Items not assigned to any category remain as top-level items (original order)
 * - Categories sorted by `order` field
 * - "settings" is protected — always last, never categorized
 * - Missing keys (removed plugin/module) are silently skipped
 * - Empty categories (all items removed) are omitted
 */
export function applyNavigationCategories(
  items: NavigationItem[],
  categories: NavigationCategory[],
): NavigationItem[] {
  if (categories.length === 0) {
    return items;
  }

  // Collect all keys assigned to any category
  const assignedKeys = new Set<string>();
  for (const cat of categories) {
    for (const key of cat.itemKeys) {
      assignedKeys.add(key);
    }
  }

  // Map key → item for quick lookup
  const itemsByKey = new Map<string, NavigationItem>();
  for (const item of items) {
    itemsByKey.set(item.key, item);
  }

  const result: NavigationItem[] = [];

  // 1. Uncategorized items in original order (except protected)
  for (const item of items) {
    if (!assignedKeys.has(item.key) && !PROTECTED_KEYS.has(item.key)) {
      result.push(item);
    }
  }

  // 2. Categories sorted by order
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  for (const cat of sortedCategories) {
    const groupChildren: NavigationItem[] = [];
    for (const key of cat.itemKeys) {
      const item = itemsByKey.get(key);
      if (item && !PROTECTED_KEYS.has(key)) {
        groupChildren.push(item);
      }
    }

    if (groupChildren.length > 0) {
      result.push({
        key: `category-${cat.id}`,
        label: cat.label,
        type: 'group',
        children: groupChildren,
      });
    }
  }

  // 3. Divider + protected items last (settings)
  const protectedItems = items.filter(item => PROTECTED_KEYS.has(item.key));
  if (protectedItems.length > 0) {
    result.push({ key: '__settings-divider', label: '', type: 'divider' });
    for (const item of protectedItems) {
      result.push(item);
    }
  }

  return result;
}
