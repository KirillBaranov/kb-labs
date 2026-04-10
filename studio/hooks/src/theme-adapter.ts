import type { ThemeConfig } from 'antd';
import { theme as antdTheme } from 'antd';

type MappingAlgorithm = typeof antdTheme.defaultAlgorithm;

/**
 * Maps CSS variables from ui-core to Ant Design tokens
 * Uses CSS variables directly via var() for automatic theme switching
 * This adapter maintains framework-agnostic nature of ui-core
 * All Ant Design tokens are mapped to our CSS variables for consistency
 */
export function getAntDesignTokens(): ThemeConfig['token'] {
  // CSS variables automatically change based on .light/.dark classes
  // We use var() references so they update reactively
  // Map all Ant Design tokens to our CSS variables for complete theme consistency
  
  return {
    // ============ Primary Colors ============
    colorPrimary: 'var(--link, #0c66ff)',
    colorPrimaryHover: 'var(--link-hover, #0050cc)',
    colorPrimaryActive: 'var(--link-hover, #0050cc)',
    colorPrimaryBg: 'var(--accent-subtle, #dbeafe)', // Light primary background
    colorPrimaryBgHover: 'var(--accent-subtle, #dbeafe)',
    colorPrimaryBorder: 'var(--link, #0c66ff)',
    colorPrimaryBorderHover: 'var(--link-hover, #0050cc)',
    colorPrimaryText: 'var(--link, #0c66ff)',
    colorPrimaryTextHover: 'var(--link-hover, #0050cc)',
    colorPrimaryTextActive: 'var(--link-hover, #0050cc)',

    // ============ Success Colors ============
    colorSuccess: 'var(--success, #16A34A)',
    colorSuccessHover: 'var(--success, #16A34A)', // Use same color
    colorSuccessActive: 'var(--success, #16A34A)',
    colorSuccessBg: 'var(--bg-tertiary, #F3F4F6)', // Light background, could be success-specific
    colorSuccessBgHover: 'var(--bg-tertiary, #F3F4F6)',
    colorSuccessBorder: 'var(--success, #16A34A)',
    colorSuccessBorderHover: 'var(--success, #16A34A)',
    colorSuccessText: 'var(--success, #16A34A)',
    colorSuccessTextHover: 'var(--success, #16A34A)',
    colorSuccessTextActive: 'var(--success, #16A34A)',

    // ============ Warning Colors ============
    colorWarning: 'var(--warning, #F59E0B)',
    colorWarningHover: 'var(--warning, #F59E0B)',
    colorWarningActive: 'var(--warning, #F59E0B)',
    colorWarningBg: 'var(--bg-tertiary, #F3F4F6)',
    colorWarningBgHover: 'var(--bg-tertiary, #F3F4F6)',
    colorWarningBorder: 'var(--warning, #F59E0B)',
    colorWarningBorderHover: 'var(--warning, #F59E0B)',
    colorWarningText: 'var(--warning, #F59E0B)',
    colorWarningTextHover: 'var(--warning, #F59E0B)',
    colorWarningTextActive: 'var(--warning, #F59E0B)',
    colorWarningOutline: 'rgba(245, 158, 11, 0.2)', // NEW: Warning outline

    // ============ Error Colors ============
    colorError: 'var(--error, #DC2626)',
    colorErrorHover: 'var(--error, #DC2626)',
    colorErrorActive: 'var(--error, #DC2626)',
    colorErrorBg: 'var(--bg-tertiary, #F3F4F6)',
    colorErrorBgHover: 'var(--bg-tertiary, #F3F4F6)',
    colorErrorBorder: 'var(--error, #DC2626)',
    colorErrorBorderHover: 'var(--error, #DC2626)',
    colorErrorText: 'var(--error, #DC2626)',
    colorErrorTextHover: 'var(--error, #DC2626)',
    colorErrorTextActive: 'var(--error, #DC2626)',
    colorErrorOutline: 'rgba(220, 38, 38, 0.2)', // NEW: Error outline

    // ============ Info Colors ============
    colorInfo: 'var(--info, #0EA5E9)',
    colorInfoHover: 'var(--info, #0EA5E9)',
    colorInfoActive: 'var(--info, #0EA5E9)',
    colorInfoBg: 'var(--bg-tertiary, #F3F4F6)',
    colorInfoBgHover: 'var(--bg-tertiary, #F3F4F6)',
    colorInfoBorder: 'var(--info, #0EA5E9)',
    colorInfoBorderHover: 'var(--info, #0EA5E9)',
    colorInfoText: 'var(--info, #0EA5E9)',
    colorInfoTextHover: 'var(--info, #0EA5E9)',
    colorInfoTextActive: 'var(--info, #0EA5E9)',

    // ============ Background Colors ============
    colorBgContainer: 'var(--bg-secondary, #FFFFFF)',
    colorBgBase: 'var(--bg-primary, #F9FAFB)',
    colorBgElevated: 'var(--bg-secondary, #FFFFFF)',
    colorBgLayout: 'var(--bg-primary, #F9FAFB)',
    colorBgSpotlight: 'var(--bg-tertiary, #F3F4F6)',
    colorBgMask: 'rgba(0, 0, 0, 0.45)', // Overlay/modal backdrop - use standard dark overlay
    colorBgTextHover: 'var(--bg-hover, #F3F4F6)', // NEW: Text hover background
    colorBgTextActive: 'var(--bg-hover, #F3F4F6)', // NEW: Text active background
    colorBgContainerDisabled: 'var(--bg-tertiary, #F3F4F6)', // NEW: Disabled container bg

    // ============ Text Colors ============
    colorText: 'var(--text-primary, #111827)',
    colorTextBase: 'var(--text-primary, #111827)', // NEW: Base text color
    colorTextSecondary: 'var(--text-secondary, #6B7280)',
    colorTextTertiary: 'var(--text-tertiary, #6B7280)',
    colorTextQuaternary: 'var(--text-tertiary, #6B7280)', // Use tertiary as fallback
    colorTextDisabled: 'var(--disabled, #9CA3AF)',
    colorTextHeading: 'var(--text-primary, #111827)', // Headings use primary text
    colorTextLabel: 'var(--text-secondary, #6B7280)', // Labels use secondary
    colorTextDescription: 'var(--text-secondary, #6B7280)', // Descriptions use secondary
    colorTextPlaceholder: 'var(--text-tertiary, #6B7280)', // Placeholders use tertiary
    colorTextLightSolid: 'var(--text-inverse, #FFFFFF)', // NEW: Text on colored backgrounds

    // ============ Border Colors ============
    colorBorder: 'var(--border-primary, #E5E7EB)',
    colorBorderSecondary: 'var(--border-secondary, #D4D4D4)',
    colorBorderBg: 'var(--bg-secondary, #FFFFFF)', // NEW: Background border color
    colorSplit: 'var(--border-primary, #E5E7EB)', // Splitter/divider uses primary border

    // ============ Fill Colors (for input backgrounds, etc.) ============
    colorFill: 'var(--bg-tertiary, #F3F4F6)', // Fill uses tertiary background
    colorFillSecondary: 'var(--bg-tertiary, #F3F4F6)', // Used for table row hover
    colorFillTertiary: 'var(--bg-primary, #F9FAFB)', // Used for table header backgrounds
    colorFillQuaternary: 'var(--bg-primary, #F9FAFB)',
    colorFillContent: 'var(--bg-hover, #F3F4F6)', // NEW: Content area fill
    colorFillContentHover: 'var(--bg-hover, #F3F4F6)', // NEW: Content hover fill
    colorFillAlter: 'var(--bg-tertiary, #F3F4F6)', // NEW: Alternative fill

    // ============ Neutral Colors ============
    colorWhite: '#FFFFFF', // Always white

    // ============ Shadow ============
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
    boxShadowSecondary: '0 4px 12px rgba(0,0,0,0.08)',
    boxShadowTertiary: '0 8px 24px rgba(0,0,0,0.08)',

    // ============ Border Radius ============
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    borderRadiusXS: 4,
    borderRadiusOuter: 6,

    // ============ Control Heights ============
    controlHeight: 36,
    controlHeightLG: 40,
    controlHeightSM: 28,
    controlHeightXS: 22,

    // ============ Font Family ============
    fontFamily: "var(--font-body, 'Inter', 'Segoe UI', sans-serif)",

    // ============ Font Sizes ============
    fontSize: 14,
    fontSizeLG: 16,
    fontSizeSM: 12,
    fontSizeXL: 20,
    fontSizeHeading1: 38,
    fontSizeHeading2: 30,
    fontSizeHeading3: 24,
    fontSizeHeading4: 20,
    fontSizeHeading5: 16,
    fontSizeIcon: 12,

    // ============ Font Weights ============
    fontWeightStrong: 600,
    lineHeight: 1.5714285714285714,
    lineHeightLG: 1.5,
    lineHeightSM: 1.6666666666666667,

    // ============ Padding ============
    padding: 16,
    paddingLG: 24,
    paddingSM: 12,
    paddingXS: 8,
    paddingXXS: 4,

    // ============ Margin ============
    margin: 16,
    marginLG: 24,
    marginSM: 12,
    marginXS: 8,
    marginXXS: 4,

    // ============ Motion ============
    motionDurationFast: '0.1s',
    motionDurationMid: '0.2s',
    motionDurationSlow: '0.3s',
    motionEaseInOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
    motionEaseOut: 'cubic-bezier(0.215, 0.61, 0.355, 1)',

    // ============ Link ============
    colorLink: 'var(--link, #0c66ff)',
    colorLinkHover: 'var(--link-hover, #0050cc)',
    colorLinkActive: 'var(--link-hover, #0050cc)',

    // ============ Icons & Highlights ============
    colorIcon: 'var(--text-secondary, #6B7280)', // NEW: Icon color
    colorIconHover: 'var(--text-primary, #111827)', // NEW: Icon hover
    colorHighlight: 'var(--link, #0c66ff)', // NEW: Highlight color

    // ============ Control States (Inputs, Buttons, etc.) ============
    controlOutline: 'rgba(12, 102, 255, 0.15)', // NEW: Input outline on focus
    controlOutlineWidth: 2, // NEW: Outline width
    controlInteractiveSize: 16, // NEW: Interactive hit area size
    controlItemBgHover: 'var(--bg-hover, #F3F4F6)', // NEW: Item hover bg
    controlItemBgActive: 'var(--accent-subtle, #dbeafe)', // NEW: Item active bg
    controlItemBgActiveHover: 'var(--accent-subtle, #dbeafe)', // NEW: Item active hover
    controlItemBgActiveDisabled: 'var(--bg-tertiary, #F3F4F6)', // NEW: Disabled active bg
    controlTmpOutline: 'rgba(12, 102, 255, 0.08)', // NEW: Temporary outline

    // ============ Screen Sizes (for responsive) ============
    screenXS: 480,
    screenSM: 576,
    screenMD: 768,
    screenLG: 992,
    screenXL: 1200,
    screenXXL: 1600,
  };
}

/**
 * Gets component-specific theme configurations
 * Uses Ant Design's components API for proper theming without CSS overrides
 */
export function getAntDesignComponents(): ThemeConfig['components'] {
  return {
    Table: {
      // Colors
      headerBg: 'var(--bg-tertiary)',
      headerColor: 'var(--text-primary)',
      borderColor: 'var(--border-primary)',
      colorText: 'var(--text-primary)',
      colorTextHeading: 'var(--text-primary)',

      // Row states (IMPORTANT for UX)
      rowHoverBg: 'var(--bg-hover)',
      rowSelectedBg: 'var(--accent-subtle)', // NEW: Selected row background
      rowSelectedHoverBg: 'var(--accent-subtle)', // NEW: Selected row hover
      rowExpandedBg: 'var(--bg-secondary)', // NEW: Expanded row background
      bodySortBg: 'var(--bg-tertiary)', // NEW: Sorted column background

      // Header states
      headerSortActiveBg: 'var(--bg-tertiary)',
      headerSortHoverBg: 'var(--bg-tertiary)',
      headerFilterHoverBg: 'var(--bg-tertiary)',
      fixedHeaderSortActiveBg: 'var(--bg-tertiary)',

      // Icons (IMPORTANT for visibility)
      colorIcon: 'var(--text-secondary)',
      colorIconHover: 'var(--text-primary)',
      expandIconBg: 'var(--bg-secondary)',

      // Footer
      footerBg: 'var(--bg-tertiary)', // NEW: Table footer background
      footerColor: 'var(--text-primary)', // NEW: Footer text color

      // Sizing
      selectionColumnWidth: 60,
      stickyScrollBarBg: 'var(--bg-tertiary)',
      stickyScrollBarBorderRadius: 4,
    },
    Tag: {
      defaultBg: 'var(--bg-tertiary)',
      defaultColor: 'var(--text-primary)',
      colorBorder: 'var(--border-primary)',
      colorSuccess: 'var(--success)',
      colorError: 'var(--error)',
      colorWarning: 'var(--warning)',
      colorInfo: 'var(--info)',
    },
    Badge: {
      colorError: 'var(--error)',
      colorSuccess: 'var(--success)',
      colorWarning: 'var(--warning)',
      colorInfo: 'var(--info)',
      colorText: 'var(--text-primary)',
    },
    Alert: {
      // ============ Status colors ============
      colorSuccess: 'var(--success)',
      colorError: 'var(--error)',
      colorWarning: 'var(--warning)',
      colorInfo: 'var(--info)',

      // ============ Text & background ============
      colorText: 'var(--text-primary)',
      colorTextHeading: 'var(--text-primary)',
      colorBgContainer: 'var(--bg-secondary)',
      colorBorder: 'var(--border-primary)',

      // ============ Icons (IMPORTANT for close button visibility) ============
      colorIcon: 'var(--text-secondary)', // NEW: Icon color (close button)
      colorIconHover: 'var(--text-primary)', // NEW: Icon hover (close button hover)

      // ============ Status-specific backgrounds ============
      colorSuccessBg: 'var(--bg-tertiary)', // NEW: Success alert background
      colorErrorBg: 'var(--bg-tertiary)', // NEW: Error alert background
      colorWarningBg: 'var(--bg-tertiary)', // NEW: Warning alert background
      colorInfoBg: 'var(--bg-tertiary)', // NEW: Info alert background

      // ============ Status-specific borders ============
      colorSuccessBorder: 'var(--success)', // NEW: Success alert border
      colorErrorBorder: 'var(--error)', // NEW: Error alert border
      colorWarningBorder: 'var(--warning)', // NEW: Warning alert border
      colorInfoBorder: 'var(--info)', // NEW: Info alert border
    },
    Card: {
      // Colors
      colorText: 'var(--text-primary)',
      colorTextHeading: 'var(--text-primary)',
      colorBgContainer: 'var(--bg-secondary)',
      colorBorder: 'var(--border-primary)',
      colorBorderSecondary: 'var(--border-primary)',

      // Header & Actions (IMPORTANT for visual hierarchy)
      headerBg: 'var(--bg-secondary)', // NEW: Card header background
      actionsBg: 'var(--bg-tertiary)', // NEW: Card actions background
      extraColor: 'var(--text-secondary)', // NEW: Extra area text color
    },
    Descriptions: {
      colorText: 'var(--text-primary)',
      colorTextLabel: 'var(--text-secondary)',
      colorBorder: 'var(--border-primary)',
    },
    Button: {
      // ============ Base colors ============
      colorText: 'var(--text-primary)',
      colorBgContainer: 'var(--bg-secondary)',
      colorBorder: 'var(--border-primary)',

      // ============ Primary button ============
      colorPrimary: 'var(--link)',
      colorPrimaryHover: 'var(--link-hover)',
      colorPrimaryActive: 'var(--link-hover)',
      primaryColor: 'var(--text-inverse)',
      primaryShadow: '0 2px 0 rgba(12, 102, 255, 0.15)',

      // ============ Default button (filled style) ============
      defaultBg: 'var(--bg-secondary)',
      defaultColor: 'var(--text-primary)',
      defaultBorderColor: 'var(--border-primary)',
      defaultShadow: '0 2px 0 rgba(0, 0, 0, 0.015)',

      // Default button - hover states (IMPORTANT for dark theme)
      defaultHoverBg: 'var(--bg-hover)',
      defaultHoverColor: 'var(--text-primary)',
      defaultHoverBorderColor: 'var(--border-secondary)',

      // Default button - active states
      defaultActiveBg: 'var(--bg-hover)',
      defaultActiveColor: 'var(--text-primary)',
      defaultActiveBorderColor: 'var(--border-secondary)',

      // ============ Ghost button (transparent with border) ============
      ghostBg: 'transparent',
      defaultGhostColor: 'var(--text-primary)', // Text color
      defaultGhostBorderColor: 'var(--border-primary)', // Border color

      // Ghost button - active states

      // ============ Dashed button (dashed border) ============
      borderColorDisabled: 'var(--border-primary)', // Dashed border uses this
      colorBgContainerDisabled: 'var(--bg-tertiary)', // Disabled background

      // ============ Text button (no background, no border) ============
      // CRITICAL: These control icon-only buttons like notification close button!
      textTextColor: 'var(--text-secondary)', // Base text color for text buttons (icons!)
      textTextHoverColor: 'var(--text-primary)', // Text button hover (icon hover!)
      textTextActiveColor: 'var(--text-primary)', // Text button active (icon active!)
      textHoverBg: 'var(--accent-subtle)', // Text button hover background

      // ============ Link button (looks like a link) ============
      linkHoverBg: 'transparent',
      colorLink: 'var(--link)',
      colorLinkHover: 'var(--link-hover)',
      colorLinkActive: 'var(--link-hover)',

      // ============ Solid button (filled buttons) ============
      solidTextColor: 'var(--text-primary)', // Text color for solid buttons

      // ============ Danger button ============
      dangerColor: 'var(--error)', // Danger button text & border color
      dangerShadow: '0 2px 0 rgba(220, 38, 38, 0.1)',

      // Danger ghost button
      colorErrorBg: 'transparent', // Ghost danger background
      colorErrorBgHover: 'var(--bg-hover)', // Ghost danger hover
      colorErrorBorder: 'var(--error)', // Ghost danger border
      colorErrorBorderHover: 'var(--error)', // Ghost danger border hover
      colorErrorHover: 'var(--error)', // Ghost danger text hover
      colorErrorActive: 'var(--error)', // Ghost danger text active
    },
    Input: {
      // Base colors
      colorText: 'var(--text-primary)',
      colorBgContainer: 'var(--bg-secondary)',
      colorBorder: 'var(--border-primary)',
      colorTextPlaceholder: 'var(--text-tertiary)',

      // Interactive states (IMPORTANT for focus feedback)
      hoverBorderColor: 'var(--border-secondary)',
      activeBorderColor: 'var(--link)',
      activeShadow: '0 0 0 3px rgba(12, 102, 255, 0.12)', // NEW: Focus shadow
      errorActiveShadow: '0 0 0 2px rgba(220, 38, 38, 0.1)', // NEW: Error focus shadow
      warningActiveShadow: '0 0 0 2px rgba(245, 158, 11, 0.1)', // NEW: Warning focus shadow

      // Clear icon (IMPORTANT for visibility)
      colorIcon: 'var(--text-secondary)', // NEW: Clear icon color
      colorIconHover: 'var(--text-primary)', // NEW: Clear icon hover
    },
    Select: {
      // ============ Base colors ============
      colorText: 'var(--text-primary)',
      colorBgContainer: 'var(--bg-secondary)', // Input background
      colorBorder: 'var(--border-primary)', // Input border
      colorBgElevated: 'var(--bg-secondary)', // Dropdown panel background
      colorTextPlaceholder: 'var(--text-tertiary)', // Placeholder text

      // ============ Primary & status colors ============
      colorPrimary: 'var(--link)', // Selected item marker color
      colorPrimaryHover: 'var(--link-hover)', // Selected item hover

      // ============ Options/items (IMPORTANT for selection feedback) ============
      optionSelectedBg: 'var(--accent-subtle)', // Selected option background
      optionSelectedColor: 'var(--link)', // Selected option text color
      optionActiveBg: 'var(--bg-hover)', // Option hover background
      optionSelectedFontWeight: 600, // Bold for selected items

      // ============ Multiple select (tags mode) ============
      multipleItemBg: 'var(--bg-tertiary)', // Tag background
      multipleItemBorderColor: 'var(--border-primary)', // Tag border
      multipleItemColorDisabled: 'var(--disabled)', // Disabled tag color

      // ============ Icons (IMPORTANT for visibility) ============
      colorIcon: 'var(--text-secondary)', // Dropdown arrow, clear icon
      colorIconHover: 'var(--text-primary)', // Icon hover

      // ============ Selector (input area) ============
      selectorBg: 'var(--bg-secondary)', // Selector background
    },
    Dropdown: {
      // ============ Base colors ============
      colorText: 'var(--text-primary)',
      colorBgElevated: 'var(--bg-secondary)', // Dropdown panel background
      colorBorder: 'var(--border-primary)',
      colorTextDisabled: 'var(--disabled)',

      // ============ Item states (IMPORTANT for visual feedback) ============
      controlItemBgHover: 'var(--bg-hover)', // Item hover background
      controlItemBgActive: 'var(--accent-subtle)', // Selected item background
      controlItemBgActiveHover: 'var(--accent-subtle)', // Selected item hover

      // ============ Colors for items ============
      colorPrimary: 'var(--link)', // Primary color for selected items
      colorPrimaryHover: 'var(--link-hover)', // Primary hover

      // ============ Dropdown.Button specific ============
      colorBgContainer: 'var(--bg-secondary)', // Button background
      colorSplit: 'var(--border-primary)', // Split line between button parts

      // ============ Padding & sizing ============
      paddingBlock: 8, // Vertical padding for items
      controlPaddingHorizontal: 12, // Horizontal padding for items
    },
    Menu: {
      // ============ Base colors ============
      colorText: 'var(--text-primary)',
      colorTextSecondary: 'var(--text-secondary)', // NEW: Secondary text in menu items
      colorBgContainer: 'var(--bg-sidebar)', // Menu background
      colorBorder: 'var(--border-primary)', // NEW: Border color
      colorSplit: 'var(--border-primary)', // NEW: Divider color

      // ============ Item colors (IMPORTANT for visibility) ============
      itemColor: 'var(--text-primary)', // NEW: Default item text color
      itemBg: 'var(--bg-secondary)', // NEW: Item background

      // ============ Hover states (IMPORTANT for feedback) ============
      itemHoverBg: 'var(--bg-hover)', // Item hover background
      itemHoverColor: 'var(--link)', // Item hover text color

      // ============ Selected states ============
      itemSelectedBg: 'var(--accent-subtle)', // Selected item background
      itemSelectedColor: 'var(--link)', // Selected item text color

      // ============ Active states ============
      itemActiveBg: 'var(--accent-subtle)', // Active item background
      colorActiveBarBorderSize: 0, // No active bar (using background instead)

      // ============ Dark theme specific ============
      darkItemBg: 'var(--bg-secondary)', // NEW: Dark mode item background
      darkItemColor: 'var(--text-primary)', // NEW: Dark mode item text
      darkItemHoverBg: 'var(--bg-hover)', // NEW: Dark mode hover
      darkItemSelectedBg: 'var(--accent-subtle)', // Dark mode selected
      darkItemSelectedColor: 'var(--link)', // Dark mode selected text
      darkSubMenuItemBg: 'var(--bg-secondary)', // NEW: Dark mode submenu background

      // ============ SubMenu (dropdown menus) ============
      subMenuItemBg: 'var(--bg-secondary)', // Submenu background
      popupBg: 'var(--bg-secondary)', // NEW: Popup menu background

      // ============ Primary color ============
      colorPrimary: 'var(--link)', // Primary color for active elements

      // ============ Icons (IMPORTANT for visibility) ============
      colorIcon: 'var(--text-secondary)', // NEW: Icon color
      colorIconHover: 'var(--text-primary)', // NEW: Icon hover

      // ============ Group title ============
      groupTitleColor: 'var(--text-tertiary)',
      groupTitleFontSize: 11,

      // ============ Item border radius ============
      itemBorderRadius: 8,
      subMenuItemBorderRadius: 6,

      // ============ Padding ============
      itemPaddingInline: 12,
    },
    Tabs: {
      // Base colors
      colorText: 'var(--text-secondary)',
      colorTextHeading: 'var(--text-primary)',
      colorBorder: 'var(--border-primary)',
      colorBorderSecondary: 'var(--border-primary)',

      // Interactive states (IMPORTANT for tab navigation feedback)
      colorPrimary: 'var(--link)',
      itemHoverColor: 'var(--link)', // Tab hover color
      itemSelectedColor: 'var(--link)', // Selected tab color
      itemActiveColor: 'var(--link)', // Active tab color
      inkBarColor: 'var(--link)', // Active tab underline

    },
    Modal: {
      // Content colors
      colorText: 'var(--text-primary)',
      colorTextHeading: 'var(--text-primary)',
      colorBgElevated: 'var(--bg-secondary)',
      colorBorder: 'var(--border-primary)',

      // Header & Footer
      headerBg: 'var(--bg-secondary)', // NEW: Modal header background
      footerBg: 'var(--bg-tertiary)', // NEW: Modal footer background
      contentBg: 'var(--bg-secondary)', // NEW: Modal content background

      // Close icon (IMPORTANT for visibility)
      colorIcon: 'var(--text-secondary)', // NEW: Close icon color
      colorIconHover: 'var(--text-primary)', // NEW: Close icon hover
    },
    Drawer: {
      // Content colors
      colorText: 'var(--text-primary)',
      colorBgElevated: 'var(--bg-secondary)',
      colorBorder: 'var(--border-primary)',

      // Close icon (IMPORTANT for visibility)
      colorIcon: 'var(--text-secondary)', // NEW: Close icon color
      colorIconHover: 'var(--text-primary)', // NEW: Close icon hover
    },
    Popover: {
      colorText: 'var(--text-primary)',
      colorBgElevated: 'var(--bg-secondary)',
      colorBorder: 'var(--border-primary)',
    },
    Tooltip: {
      colorText: 'var(--text-primary)',
      colorBgSpotlight: 'var(--bg-secondary)',
      colorTextLightSolid: 'var(--text-primary)',
    },
    List: {
      // Base colors
      colorText: 'var(--text-primary)',
      colorTextHeading: 'var(--text-primary)',
      colorBorder: 'var(--border-primary)',
      colorSplit: 'var(--border-primary)',

      metaMarginBottom: 8, // Meta info spacing
      avatarMarginRight: 16, // NEW: Avatar spacing
    },
    Switch: {
      colorPrimary: 'var(--link)',
      colorPrimaryHover: 'var(--link-hover)',
    },
    Radio: {
      colorPrimary: 'var(--link)',
      colorText: 'var(--text-primary)',
      buttonCheckedBg: 'var(--link)',
      buttonCheckedBgDisabled: 'var(--disabled)',
      buttonColor: 'var(--text-primary)',
      buttonSolidCheckedColor: 'var(--text-inverse)',
      buttonSolidCheckedBg: 'var(--link)',
      buttonSolidCheckedHoverBg: 'var(--link-hover)',
      buttonSolidCheckedActiveBg: 'var(--link-hover)',
    },
    Checkbox: {
      colorPrimary: 'var(--link)',
      colorText: 'var(--text-primary)',
    },
    DatePicker: {
      // Base colors
      colorText: 'var(--text-primary)',
      colorBgContainer: 'var(--bg-secondary)',
      colorBorder: 'var(--border-primary)',
      colorBgElevated: 'var(--bg-secondary)',
      colorTextPlaceholder: 'var(--text-tertiary)',
      colorTextDisabled: 'var(--disabled)',

      // Interactive states (IMPORTANT for date selection feedback)
      colorLink: 'var(--link)', // Selected date color
      colorLinkHover: 'var(--link-hover)', // Date hover color
      cellHoverBg: 'var(--bg-hover)', // NEW: Date cell hover background
      cellActiveWithRangeBg: 'var(--accent-subtle)', // NEW: Range selection background
      cellBgDisabled: 'var(--bg-tertiary)', // NEW: Disabled date background

      // Icons (IMPORTANT for visibility)
      colorIcon: 'var(--text-secondary)', // NEW: Calendar icon color
      colorIconHover: 'var(--text-primary)', // NEW: Calendar icon hover
    },
    Form: {
      colorText: 'var(--text-primary)',
      colorTextLabel: 'var(--text-secondary)',
      colorError: 'var(--error)',
      colorWarning: 'var(--warning)',
    },
    Pagination: {
      // Base colors
      colorText: 'var(--text-primary)',
      colorTextDisabled: 'var(--disabled)',
      colorBgContainer: 'var(--bg-secondary)',

      // Interactive states (IMPORTANT for navigation feedback)
      colorPrimary: 'var(--link)', // Active page background
      colorPrimaryHover: 'var(--link-hover)', // Active page hover
      itemBg: 'var(--bg-secondary)', // NEW: Page item background
      itemActiveBg: 'var(--link)', // NEW: Active page background
      itemActiveBgDisabled: 'var(--bg-tertiary)', // NEW: Disabled active page
      itemInputBg: 'var(--bg-secondary)', // NEW: Quick jumper input background
      itemLinkBg: 'var(--bg-secondary)', // NEW: Page link background

      // Hover states (IMPORTANT for visual feedback)
      colorBgTextHover: 'var(--bg-hover)', // NEW: Page item hover background
    },
    Steps: {
      colorText: 'var(--text-primary)',
      colorTextDescription: 'var(--text-secondary)',
      colorPrimary: 'var(--link)',
      colorBorder: 'var(--border-primary)',
    },
    Breadcrumb: {
      colorText: 'var(--text-secondary)',
      colorTextDescription: 'var(--text-tertiary)',
      linkColor: 'var(--link)',
      linkHoverColor: 'var(--link-hover)',
      separatorColor: 'var(--text-tertiary)',
    },
    Progress: {
      colorText: 'var(--text-primary)',
      colorSuccess: 'var(--success)',
      colorError: 'var(--error)',
      remainingColor: 'var(--bg-tertiary)',
    },
    Skeleton: {
      colorFill: 'var(--bg-tertiary)',
      colorFillContent: 'var(--bg-hover)',
    },
    Spin: {
      colorPrimary: 'var(--link)',
      colorBgContainer: 'var(--bg-secondary)',
    },
    Divider: {
      colorSplit: 'var(--border-primary)',
      colorText: 'var(--text-secondary)',
    },
    Layout: {
      headerBg: 'var(--bg-secondary)',
      bodyBg: 'var(--bg-primary)',
      triggerBg: 'var(--bg-tertiary)',
      colorText: 'var(--text-primary)',
    },
    Collapse: {
      colorText: 'var(--text-primary)',
      colorTextHeading: 'var(--text-primary)',
      colorBorder: 'var(--border-primary)',
      colorBgContainer: 'var(--bg-secondary)',
      headerBg: 'var(--bg-tertiary)',
    },
    Carousel: {
      colorBgContainer: 'var(--bg-secondary)',
      dotActiveWidth: 24,
    },
    Anchor: {
      colorPrimary: 'var(--link)',
      colorText: 'var(--text-secondary)',
      linkPaddingBlock: 4,
    },
    Timeline: {
      colorText: 'var(--text-primary)',
      colorTextDescription: 'var(--text-secondary)',
      tailColor: 'var(--border-primary)',
      dotBg: 'var(--bg-secondary)',
    },
    Transfer: {
      colorText: 'var(--text-primary)',
      colorBgContainer: 'var(--bg-secondary)',
      colorBorder: 'var(--border-primary)',
      controlItemBgActive: 'var(--bg-hover)',
    },
    Tree: {
      colorText: 'var(--text-primary)',
      colorBgContainer: 'var(--bg-secondary)',
      colorPrimary: 'var(--link)',
      nodeHoverBg: 'var(--bg-hover)',
      nodeSelectedBg: 'var(--accent-subtle)',
    },
    TreeSelect: {
      colorText: 'var(--text-primary)',
      colorBgContainer: 'var(--bg-secondary)',
      colorBorder: 'var(--border-primary)',
      colorBgElevated: 'var(--bg-secondary)',
      nodeHoverBg: 'var(--bg-hover)',
      nodeSelectedBg: 'var(--accent-subtle)',
    },
    Cascader: {
      colorText: 'var(--text-primary)',
      colorBgContainer: 'var(--bg-secondary)',
      colorBorder: 'var(--border-primary)',
      colorBgElevated: 'var(--bg-secondary)',
      optionSelectedBg: 'var(--bg-hover)',
    },
    Segmented: {
      colorText: 'var(--text-primary)',
      colorTextLabel: 'var(--text-secondary)',
      colorBgLayout: 'var(--bg-tertiary)',
      itemSelectedBg: 'var(--bg-secondary)',
      itemSelectedColor: 'var(--link)',
      itemHoverBg: 'var(--bg-hover)',
    },
    Rate: {
      colorText: 'var(--warning)',
    },
    Slider: {
      colorPrimary: 'var(--link)',
      colorPrimaryBorder: 'var(--link)',
      trackBg: 'var(--bg-tertiary)',
      trackHoverBg: 'var(--bg-hover)',
    },
    Upload: {
      colorText: 'var(--text-primary)',
      colorTextDescription: 'var(--text-secondary)',
      colorBorder: 'var(--border-primary)',
      colorFillAlter: 'var(--bg-tertiary)',
      colorPrimary: 'var(--link)',
    },
    Calendar: {
      colorText: 'var(--text-primary)',
      colorTextHeading: 'var(--text-primary)',
      colorBgContainer: 'var(--bg-secondary)',
      colorBorder: 'var(--border-primary)',
      itemActiveBg: 'var(--accent-subtle)',
    },
    Image: {
      colorTextLightSolid: 'var(--text-primary)',
      colorBgMask: 'rgba(0, 0, 0, 0.45)',
    },
    Statistic: {
      colorText: 'var(--text-primary)',
      colorTextDescription: 'var(--text-secondary)',
    },
    Result: {
      colorText: 'var(--text-primary)',
      colorTextHeading: 'var(--text-primary)',
      colorTextDescription: 'var(--text-secondary)',
    },
    Empty: {
      colorText: 'var(--text-secondary)',
      colorTextDescription: 'var(--text-tertiary)',
    },
    Message: {
      // ============ Base colors ============
      colorText: 'var(--text-primary)',
      colorBgElevated: 'var(--bg-secondary)', // Message background
      contentBg: 'var(--bg-secondary)', // NEW: Content background
      contentPadding: '10px 16px', // NEW: Message padding

      // ============ Status colors ============
      colorSuccess: 'var(--success)',
      colorError: 'var(--error)',
      colorWarning: 'var(--warning)',
      colorInfo: 'var(--info)',
    },
    Notification: {
      // ============ Base colors ============
      colorText: 'var(--text-primary)',
      colorTextHeading: 'var(--text-primary)',
      colorBgElevated: 'var(--bg-secondary)', // Notification background
      colorBorder: 'var(--border-primary)',

      // ============ Close icon (IMPORTANT for visibility in dark theme!) ============
      colorIcon: 'var(--text-secondary)', // NEW: Close button icon color
      colorIconHover: 'var(--text-primary)', // NEW: Close button hover color

      // ============ Status colors ============
      colorSuccess: 'var(--success)',
      colorError: 'var(--error)',
      colorWarning: 'var(--warning)',
      colorInfo: 'var(--info)',
    },
  };
}

/**
 * Gets algorithm for Ant Design theme (for dark/light mode)
 */
export function getThemeAlgorithm(theme: 'light' | 'dark' | 'auto' = 'light'): MappingAlgorithm {
  const actualTheme = theme === 'auto' 
    ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  return actualTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;
}

