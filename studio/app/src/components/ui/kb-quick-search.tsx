import * as React from 'react';
import { Modal, Input, List, Empty, Badge } from 'antd';
import { Search, FileText, Box, Settings, BarChart, Activity, Navigation, Zap } from 'lucide-react';
import styles from './kb-quick-search.module.css';

export interface SearchableItem {
  id: string;
  title: string;
  description?: string;
  category: 'page' | 'plugin' | 'widget' | 'workflow' | 'setting' | 'navigation' | 'action';
  path: string;
  icon?: React.ReactNode;
  badge?: string;
}

export interface KBQuickSearchProps {
  open: boolean;
  onClose: () => void;
  items: SearchableItem[];
  onNavigate: (path: string) => void;
  placeholder?: string;
}

const CATEGORY_CONFIG = {
  page:       { icon: FileText,   color: 'var(--info)',         label: 'Page' },
  navigation: { icon: Navigation, color: 'var(--link)',         label: 'Navigation' },
  action:     { icon: Zap,        color: 'var(--warning)',      label: 'Action' },
  plugin:     { icon: Box,        color: 'var(--success)',      label: 'Plugin' },
  widget:     { icon: Activity,   color: 'var(--info)',         label: 'Widget' },
  workflow:   { icon: BarChart,   color: 'var(--warning)',      label: 'Workflow' },
  setting:    { icon: Settings,   color: 'var(--text-tertiary)', label: 'Setting' },
} as const;

// Section order when grouping results by category
const CATEGORY_ORDER: (keyof typeof CATEGORY_CONFIG)[] = [
  'navigation', 'plugin', 'page', 'widget', 'workflow', 'action', 'setting',
];

export function KBQuickSearch({
  open,
  onClose,
  items,
  onNavigate,
  placeholder = 'Search pages, plugins, widgets...',
}: KBQuickSearchProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<any>(null);

  const filteredItems = React.useMemo(() => {
    if (!searchQuery.trim()) { return items.slice(0, 10); }
    const query = searchQuery.toLowerCase();
    return items
      .filter((item) => {
        return (item.title?.toLowerCase().includes(query) ?? false)
          || (item.description?.toLowerCase().includes(query) ?? false)
          || (item.path?.toLowerCase().includes(query) ?? false);
      })
      .slice(0, 10);
  }, [items, searchQuery]);

  const groupedItems = React.useMemo(() => {
    const groups = new Map<string, { item: SearchableItem; index: number }[]>();
    filteredItems.forEach((item, index) => {
      const entries = groups.get(item.category) ?? [];
      entries.push({ item, index });
      groups.set(item.category, entries);
    });
    return CATEGORY_ORDER
      .filter((category) => groups.has(category))
      .map((category) => ({ category, entries: groups.get(category)! }));
  }, [filteredItems]);

  React.useEffect(() => { setSelectedIndex(0); }, [filteredItems]);

  React.useEffect(() => {
    if (open) {
      setTimeout(() => { inputRef.current?.focus(); }, 100);
    } else {
      setSearchQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filteredItems[selectedIndex];
        if (item) { onNavigate(item.path); onClose(); }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filteredItems, selectedIndex, onNavigate, onClose]
  );

  const handleItemClick = (item: SearchableItem) => {
    onNavigate(item.path);
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      centered
      closable={false}
      className={styles.modal}
      styles={{ body: { padding: 0 } }}
    >
      <div className={styles.searchWrap}>
        <Input
          ref={inputRef}
          size="large"
          placeholder={placeholder}
          prefix={<Search size={18} style={{ color: 'var(--text-tertiary)' }} />}
          suffix={<kbd className={styles.escHint}>ESC</kbd>}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.list}>
        {filteredItems.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={`No results for "${searchQuery}"`}
            className={styles.emptyState}
          />
        ) : (
          groupedItems.map(({ category, entries }) => (
            <div key={category} className={styles.section}>
              <div className={styles.sectionHeader}>{CATEGORY_CONFIG[category].label}</div>
              <List
                dataSource={entries}
                renderItem={({ item, index }) => {
                  const config = CATEGORY_CONFIG[item.category];
                  const Icon = config.icon;
                  const isSelected = index === selectedIndex;

                  return (
                    <List.Item
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className={`${styles.resultItem} ${isSelected ? styles.selected : ''}`}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <List.Item.Meta
                        avatar={
                          <div
                            className={styles.categoryIcon}
                            style={{ backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)` }}
                          >
                            {item.icon || <Icon size={16} color={config.color} />}
                          </div>
                        }
                        title={
                          <div className={styles.itemTitle}>
                            <span>{item.title}</span>
                            {item.badge && (
                              <Badge
                                count={item.badge}
                                className={styles.itemBadge}
                                style={{ backgroundColor: config.color }}
                              />
                            )}
                          </div>
                        }
                        description={
                          item.description && (
                            <div className={styles.itemDesc}>
                              <span className={styles.itemDescText}>{item.description}</span>
                            </div>
                          )
                        }
                      />
                      {isSelected && (
                        <div className={styles.enterHint}>
                          <kbd>↵</kbd>
                        </div>
                      )}
                    </List.Item>
                  );
                }}
              />
            </div>
          ))
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          <div className={styles.footerHint}><kbd>↑↓</kbd> Navigate</div>
          <div className={styles.footerHint}><kbd>↵</kbd> Select</div>
        </div>
        <div>{filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''}</div>
      </div>
    </Modal>
  );
}
