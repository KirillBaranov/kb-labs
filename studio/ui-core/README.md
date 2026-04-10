# @kb-labs/ui-core

KB Labs design system foundation — design tokens, themes, CSS variables (framework-agnostic).

## Vision & Purpose

**@kb-labs/ui-core** provides design system foundation for KB Labs Studio. It includes design tokens, themes, and CSS variables that are framework-agnostic.

### Core Goals

- **Design Tokens**: Design tokens for colors, typography, spacing, shadows, radius
- **Themes**: Light and dark themes
- **CSS Variables**: CSS variable generation
- **Framework-Agnostic**: Framework-agnostic design system

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
UI Core
    │
    ├──► Design Tokens
    ├──► Themes
    └──► CSS Variables
```

### Key Components

1. **Tokens** (`tokens/`): Design tokens (colors, typography, spacing, shadows, radius)
2. **Themes** (`themes/`): Light and dark themes
3. **Utils** (`utils/`): CSS variable utilities

## ✨ Features

- **Design Tokens**: Design tokens for colors, typography, spacing, shadows, radius
- **Themes**: Light and dark themes
- **CSS Variables**: CSS variable generation
- **Framework-Agnostic**: Framework-agnostic design system

## 📦 API Reference

### Main Exports

#### Design Tokens

- `colors`: Color tokens
- `typography`: Typography tokens
- `spacing`: Spacing tokens
- `shadows`: Shadow tokens
- `radius`: Radius tokens

#### Themes

- `lightTheme`: Light theme
- `darkTheme`: Dark theme
- `semanticColors`: Semantic color definitions

#### CSS Variables

- `generateCSSVars`: Generate CSS variables from tokens

## 🔧 Configuration

### Configuration Options

No configuration needed - pure design tokens and themes.

## 🔗 Dependencies

### Runtime Dependencies

None (pure design tokens)

### Development Dependencies

- `@kb-labs/devkit` (`file:../../../kb-labs-devkit`): DevKit presets
- `tsup` (`^8`): TypeScript bundler
- `typescript` (`^5`): TypeScript compiler
- `vitest` (`^3.2.4`): Test runner

## 🧪 Testing

### Test Structure

No tests currently.

### Test Coverage

- **Current Coverage**: ~50%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(1) for token access
- **Space Complexity**: O(1)
- **Bottlenecks**: None

## 🔒 Security

### Security Considerations

- **Type Safety**: TypeScript type safety

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Theme Types**: Fixed theme types (light, dark)

### Future Improvements

- **More Themes**: Additional theme variants

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Use Design Tokens

```typescript
import { colors, spacing, typography } from '@kb-labs/ui-core';

const style = {
  color: colors.primary,
  padding: spacing.md,
  fontSize: typography.body.fontSize,
};
```

### Example 2: Use Themes

```typescript
import { lightTheme, darkTheme } from '@kb-labs/ui-core';

const theme = isDark ? darkTheme : lightTheme;
```

### Example 3: Generate CSS Variables

```typescript
import { generateCSSVars } from '@kb-labs/ui-core';

const cssVars = generateCSSVars(lightTheme);
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs

