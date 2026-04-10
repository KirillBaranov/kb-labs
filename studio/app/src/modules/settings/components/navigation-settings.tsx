/**
 * @module @kb-labs/studio-app/modules/settings/components/navigation-settings
 * UI for managing sidebar navigation categories.
 */

import * as React from 'react';
import {
  UISpace,
  UITypographyText,
  UITypographyParagraph,
  UIButton,
  UIInput,
  UISelect,
  UICard,
  UIEmptyState,
  UIPopconfirm,
  UIIcon,
} from '@kb-labs/studio-ui-kit';
import { useSettings, type NavigationCategory } from '@/providers/settings-provider';
import { useNavigationItems } from '@/providers/navigation-items-provider';

export function NavigationSettings() {
  const { settings, updateSettings } = useSettings();
  const availableItems = useNavigationItems();
  const categories = settings.navigation.categories;

  // Set of valid item keys (for filtering stale references)
  const validKeys = React.useMemo(
    () => new Set(availableItems.map(i => i.key)),
    [availableItems],
  );

  // Items already assigned to any category (only valid keys)
  const assignedKeys = React.useMemo(() => {
    const set = new Set<string>();
    for (const cat of categories) {
      for (const key of cat.itemKeys) {
        if (validKeys.has(key)) {
          set.add(key);
        }
      }
    }
    return set;
  }, [categories, validKeys]);

  const updateCategories = React.useCallback(
    (newCategories: NavigationCategory[]) => {
      updateSettings({ navigation: { categories: newCategories } });
    },
    [updateSettings],
  );

  const addCategory = React.useCallback(() => {
    const id = `cat-${Date.now()}`;
    updateCategories([
      ...categories,
      { id, label: '', order: categories.length, itemKeys: [] },
    ]);
  }, [categories, updateCategories]);

  const removeCategory = React.useCallback(
    (id: string) => {
      updateCategories(categories.filter(c => c.id !== id));
    },
    [categories, updateCategories],
  );

  const updateCategory = React.useCallback(
    (id: string, updates: Partial<NavigationCategory>) => {
      updateCategories(
        categories.map(c => (c.id === id ? { ...c, ...updates } : c)),
      );
    },
    [categories, updateCategories],
  );

  const moveCategory = React.useCallback(
    (id: string, direction: -1 | 1) => {
      const idx = categories.findIndex(c => c.id === id);
      if (idx < 0) {return;}
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= categories.length) {return;}
      const newCats = [...categories];
      const temp = newCats[idx]!;
      newCats[idx] = newCats[newIdx]!;
      newCats[newIdx] = temp;
      updateCategories(newCats.map((c, i) => ({ ...c, order: i })));
    },
    [categories, updateCategories],
  );

  const resetNavigation = React.useCallback(() => {
    updateCategories([]);
  }, [updateCategories]);

  return (
    <UISpace direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <UITypographyText strong style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>
          Sidebar Categories
        </UITypographyText>
        <UITypographyParagraph type="secondary" style={{ marginBottom: 16 }}>
          Create categories to group sidebar items. Uncategorized items stay at the top.
          Settings is always pinned to the bottom.
        </UITypographyParagraph>
      </div>

      {categories.length === 0 ? (
        <UIEmptyState
          image={UIEmptyState.PRESENTED_IMAGE_SIMPLE}
          description="No categories. All sidebar items are shown as a flat list."
        />
      ) : (
        <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
          {categories.map((cat, idx) => {
            // Items selectable for this category: unassigned + already in this category
            const selectableOptions = availableItems.filter(
              item => !assignedKeys.has(item.key) || cat.itemKeys.includes(item.key),
            );

            // Filter stale keys from display
            const validItemKeys = cat.itemKeys.filter(k => validKeys.has(k));

            return (
              <UICard
                key={cat.id}
                size="small"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                <UISpace direction="vertical" size="small" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <UIInput
                      value={cat.label}
                      onChange={value =>
                        updateCategory(cat.id, { label: value })
                      }
                      placeholder="Category name"
                      style={{ flex: 1 }}
                    />
                    <UIButton
                      size="small"
                      icon={<UIIcon name="ArrowUpOutlined" />}
                      disabled={idx === 0}
                      onClick={() => moveCategory(cat.id, -1)}
                    />
                    <UIButton
                      size="small"
                      icon={<UIIcon name="ArrowDownOutlined" />}
                      disabled={idx === categories.length - 1}
                      onClick={() => moveCategory(cat.id, 1)}
                    />
                    <UIPopconfirm
                      title="Delete this category?"
                      description="Items will return to the uncategorized area."
                      onConfirm={() => removeCategory(cat.id)}
                    >
                      <UIButton size="small" danger icon={<UIIcon name="DeleteOutlined" />} />
                    </UIPopconfirm>
                  </div>

                  <UISelect
                    mode="multiple"
                    value={validItemKeys}
                    onChange={keys =>
                      updateCategory(cat.id, { itemKeys: (keys as string[]) })
                    }
                    options={selectableOptions.map(i => ({
                      value: i.key,
                      label: i.label,
                    }))}
                    placeholder="Select sidebar items for this category"
                    style={{ width: '100%' }}
                    optionFilterProp="label"
                  />
                </UISpace>
              </UICard>
            );
          })}
        </UISpace>
      )}

      <UISpace>
        <UIButton variant="dashed" icon={<UIIcon name="PlusOutlined" />} onClick={addCategory}>
          Add Category
        </UIButton>
        {categories.length > 0 && (
          <UIPopconfirm
            title="Reset all navigation customizations?"
            description="All categories will be removed."
            onConfirm={resetNavigation}
          >
            <UIButton danger>Reset Navigation</UIButton>
          </UIPopconfirm>
        )}
      </UISpace>
    </UISpace>
  );
}
