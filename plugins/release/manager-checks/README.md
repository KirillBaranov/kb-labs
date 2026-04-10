# @kb-labs/release-checks

KB Labs Release Manager - check adapters for audit, devlink, mind, tests, and build.

## Vision & Purpose

**@kb-labs/release-checks** provides check adapters for KB Labs Release Manager. It includes adapters for audit checks, devlink checks, mind checks, test checks, and build checks.

### Core Goals

- **Check Adapters**: Adapters for various release checks
- **Base Adapter**: Base class for implementing custom checks
- **Check Execution**: Execute checks with timeout handling

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Release Checks
    │
    ├──► Base Adapter
    ├──► Audit Check
    ├──► DevLink Check
    ├──► Mind Check
    ├──► Tests Check
    └──► Build Check
```

### Key Components

1. **BaseCheckAdapter** (`base.ts`): Base class for check adapters
2. **AuditCheck** (`audit.ts`): Audit check adapter
3. **DevLinkCheck** (`devlink.ts`): DevLink check adapter
4. **MindCheck** (`mind.ts`): Mind check adapter
5. **TestsCheck** (`tests.ts`): Test check adapter
6. **BuildCheck** (`build.ts`): Build check adapter

## ✨ Features

- **Base adapter** for custom checks
- **Audit checking** via audit system
- **DevLink checking** via devlink system
- **Mind checking** via mind system
- **Test checking** via test system
- **Build checking** via build system

## 📦 API Reference

### Main Exports

#### Check Adapters

- `BaseCheckAdapter`: Base class for check adapters
- `AuditCheck`: Audit check adapter
- `DevLinkCheck`: DevLink check adapter
- `MindCheck`: Mind check adapter
- `TestsCheck`: Test check adapter
- `BuildCheck`: Build check adapter

#### Utilities

- `createCheckRegistry`: Create check registry
- `runChecks`: Run all enabled checks sequentially

## 🔧 Configuration

### Configuration Options

All configuration via function parameters.

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/release-core` (`link:../release-core`): Release core
- `execa` (`^8.0.0`): Process execution
- `fs-extra` (`^11.0.0`): File system utilities

### Development Dependencies

- `@kb-labs/devkit` (`link:../../../kb-labs-devkit`): DevKit presets
- `@types/fs-extra` (`^11.0.0`): fs-extra types
- `@types/node` (`^24.7.0`): Node.js types
- `tsup` (`^8`): TypeScript bundler
- `typescript` (`^5`): TypeScript compiler
- `vitest` (`^3`): Test runner

## 🧪 Testing

### Test Structure

No tests currently.

### Test Coverage

- **Current Coverage**: ~50%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(1) for adapter setup, O(n) for check execution
- **Space Complexity**: O(1)
- **Bottlenecks**: Check execution time

## 🔒 Security

### Security Considerations

- **Process Execution**: Secure process execution
- **Timeout Handling**: Timeout limits for checks

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Check Types**: Fixed check types
- **Tool Dependencies**: Requires external tools

### Future Improvements

- **More Check Types**: Additional check types
- **Plugin System**: Plugin system for custom checks

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Use Built-in Checks

```typescript
import { AuditCheck, TestsCheck } from '@kb-labs/release-checks';

const auditCheck = new AuditCheck();
const result = await auditCheck.run(process.cwd(), 30000);
```

### Example 2: Create Check Registry

```typescript
import { createCheckRegistry } from '@kb-labs/release-checks';

const registry = createCheckRegistry();
```

### Example 3: Run Checks

```typescript
import { runChecks } from '@kb-labs/release-checks';

const results = await runChecks({
  checkIds: ['audit', 'tests', 'build'],
  cwd: process.cwd(),
});
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
