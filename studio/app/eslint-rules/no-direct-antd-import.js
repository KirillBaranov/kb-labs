/**
 * ESLint rule: no-direct-antd-import
 *
 * Prevents direct imports from 'antd' or 'antd/*' in the studio app.
 * Provides specific component-level suggestions to use @kb-labs/studio-ui-kit equivalents.
 */

/** @type {Map<string, string>} */
const COMPONENT_MAP = {
  // Core
  Card: 'UICard',
  Button: 'UIButton',
  Tag: 'UITag',
  Badge: 'UIBadge',
  Spin: 'UISpin',
  Divider: 'UIDivider',
  // Layout
  Row: 'UIRow',
  Col: 'UICol',
  Space: 'UISpace',
  Flex: 'UIFlex',
  Grid: 'UIGrid',
  // Data display
  Table: 'UITable',
  List: 'UIList',
  Descriptions: 'UIDescriptions',
  Statistic: 'UIStatistic',
  Timeline: 'UITimeline',
  Avatar: 'UIAvatar',
  Tooltip: 'UITooltip',
  Progress: 'UIProgress',
  // Feedback
  Alert: 'UIAlert',
  Modal: 'UIModal',
  Drawer: 'UIDrawer',
  Popconfirm: 'UIPopconfirm',
  Empty: 'UIEmptyState',
  Skeleton: 'UISkeleton',
  // Navigation
  Tabs: 'UITabs',
  Menu: 'UIMenu',
  Segmented: 'UISegmented',
  Breadcrumb: 'UIBreadcrumb',
  // Form
  Form: 'UIForm',
  Input: 'UIInput',
  InputNumber: 'UIInputNumber',
  Select: 'UISelect',
  Checkbox: 'UICheckbox',
  Radio: 'UIRadio',
  Switch: 'UISwitch',
  DatePicker: 'UIDatePicker',
  TimePicker: 'UITimePicker',
  Slider: 'UISlider',
  Upload: 'UIUpload',
  // Layout structural
  Collapse: 'UIAccordion',
  // Typography
  Typography: 'UIText / UITitle (use UITypographyText, UITypographyParagraph, UITitle)',
};

/** @type {Record<string, string>} */
const HOOK_MAP = {
  theme: 'useUITheme from @kb-labs/studio-ui-kit',
  message: 'UIMessage or useUIMessage from @kb-labs/studio-ui-kit',
};

/** @param {string[]} names */
function buildSuggestion(names) {
  const mapped = [];
  const unknown = [];

  for (const name of names) {
    if (COMPONENT_MAP[name]) {
      mapped.push(`${name} → ${COMPONENT_MAP[name]}`);
    } else if (HOOK_MAP[name]) {
      mapped.push(`${name} → ${HOOK_MAP[name]}`);
    } else {
      unknown.push(name);
    }
  }

  const parts = [];
  if (mapped.length > 0) {
    parts.push(`Use from @kb-labs/studio-ui-kit: ${mapped.join(', ')}.`);
  }
  if (unknown.length > 0) {
    parts.push(
      `No UI Kit equivalent found for: ${unknown.join(', ')}. ` +
      `Add a wrapper in packages/studio-ui-kit/src/ and export it from the index.`,
    );
  }
  return parts.join(' ');
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow direct imports from antd — use @kb-labs/studio-ui-kit instead.',
      url: 'https://github.com/kb-labs/kb-labs-studio/blob/main/ANTD-MIGRATION-GUIDE.md',
    },
    messages: {
      noDirectAntd:
        'Direct antd import is not allowed. {{ suggestion }}',
      noAntdSubpath:
        'Direct antd subpath import is not allowed. Use @kb-labs/studio-ui-kit instead.',
      noAntdIcons:
        'Import @ant-design/icons directly is not allowed. ' +
        'Use <UIIcon name="IconName" /> from @kb-labs/studio-ui-kit or ' +
        'renderIcon() from @kb-labs/studio-ui-react.',
    },
    schema: [],
  },

  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value;

        // antd/es/... or antd/lib/... subpath imports — allow type-only imports
        if (typeof source === 'string' && source.startsWith('antd/')) {
          if (node.importKind === 'type') return;
          context.report({ node, messageId: 'noAntdSubpath' });
          return;
        }

        // direct 'antd' import
        if (source !== 'antd') return;

        // Collect imported names (skip type-only imports of unknown types)
        const names = node.specifiers
          .filter((s) => s.type === 'ImportSpecifier')
          .map((s) => s.imported.name);

        const suggestion = names.length > 0
          ? buildSuggestion(names)
          : 'Use @kb-labs/studio-ui-kit instead.';

        context.report({
          node,
          messageId: 'noDirectAntd',
          data: { suggestion },
        });
      },
    };
  },
};

module.exports = rule;
