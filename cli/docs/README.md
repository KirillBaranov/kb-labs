# KB Labs CLI Documentation

This directory contains comprehensive documentation for the KB Labs CLI project.

## 📚 Documentation Structure

### 🎯 Quick Start Guides

- **[COMMAND_QUICK_REFERENCE.md](./COMMAND_QUICK_REFERENCE.md)** - Quick reference for command development
- **[COMMAND_REGISTRATION.md](./COMMAND_REGISTRATION.md)** - Complete guide for registering new commands

### 📖 Comprehensive Guides

- **[guides/cli-style.md](./guides/cli-style.md)** - CLI design principles and conventions
- **[guides/command-output.md](./guides/command-output.md)** - Detailed command output formatting guide

### 🏗️ Architecture Decisions

- **[ADR 0001: Architecture and Repository Layout](./adr/0001-architecture-and-repository-layout.md)** - Project structure
- **[ADR 0002: Plugins and Extensibility](./adr/0002-plugins-and-extensibility.md)** - Plugin system design
- **[ADR 0003: Package and Module Boundaries](./adr/0003-package-and-module-boundaries.md)** - Package organization
- **[ADR 0004: Versioning and Release Policy](./adr/0004-versioning-and-release-policy.md)** - Versioning strategy
- **[ADR 0005: Unified CLI Output Formatting](./adr/0005-unified-cli-output-formatting.md)** - Output formatting standards

### 🔧 Product-Specific Documentation

- **[DEVLINK_COMMANDS.md](./DEVLINK_COMMANDS.md)** - DevLink command reference
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Overall system architecture

## 🚀 Quick Start

### For Developers

**New to CLI development?**
1. Start with [CLI Style Guide](./guides/cli-style.md) for design principles
2. Follow [Command Quick Reference](./COMMAND_QUICK_REFERENCE.md) for basic patterns
3. Use [Command Registration Guide](./COMMAND_REGISTRATION.md) for detailed implementation

**Adding a new command?**
1. **Design**: Follow [CLI Style Guide](./guides/cli-style.md) principles
2. **Implement**: Use [Command Registration Guide](./COMMAND_REGISTRATION.md) patterns
3. **Format**: Apply [Command Output Guide](./guides/command-output.md) standards
4. **Test**: Verify both text and JSON output modes

### For AI Assistants

When working with the KB Labs CLI codebase:

1. **Follow unified output standards** from [ADR-0005](./adr/0005-unified-cli-output-formatting.md)
2. **Use box formatting** as described in [Command Output Guide](./guides/command-output.md)
3. **Apply CLI style conventions** from [CLI Style Guide](./guides/cli-style.md)
4. **Maintain backward compatibility** with legacy formats
5. **Test both text and JSON output modes**

## 🎨 Unified Output Standards

All CLI commands follow consistent formatting patterns:

### Box Formatting
```typescript
const summary = keyValue({
  'Status': 'Success',
  'Files': 15,
  'Errors': 0,
});

const output = box('Operation Complete', [...summary, '', `Time: ${formatTiming(totalTime)}`]);
```

### Timing Display
```typescript
const tracker = new TimingTracker();
tracker.checkpoint('scan');
// ... operation ...
const totalTime = tracker.total();
```

### JSON Support
```typescript
if (jsonMode) {
  ctx.presenter.json({ ok: true, ...result, timing: totalTime });
}
```

## 📋 Command Structure

The CLI uses a git-style command structure:

```
kb <group> <command> [flags]
```

**Examples:**
- `kb devlink plan` - Plan DevLink operations
- `kb mind feed --source ./data` - Feed mind workspace
- `kb version` - Show CLI version

**Backward Compatibility:**
- `kb devlink:plan` works the same as `kb devlink plan`
- All existing JSON outputs remain unchanged
- Exit codes and behavior are preserved

## 🔍 Finding Information

**Need help with...**

- **Command output formatting** → [Command Output Guide](./guides/command-output.md)
- **CLI design principles** → [CLI Style Guide](./guides/cli-style.md)
- **Adding new commands** → [Command Registration Guide](./COMMAND_REGISTRATION.md)
- **Quick command reference** → [Command Quick Reference](./COMMAND_QUICK_REFERENCE.md)
- **Architecture decisions** → [ADR documents](./adr/)
- **DevLink commands** → [DevLink Commands](./DEVLINK_COMMANDS.md)

## 🧪 Testing Standards

Always test your commands with:

```bash
# Text output
pnpm kb myproduct mysubcommand

# JSON output
pnpm kb myproduct mysubcommand --json

# Help
pnpm kb myproduct --help
pnpm kb myproduct mysubcommand --help

# Legacy format
pnpm kb myproduct:mysubcommand
```

## 🤝 Contributing

When contributing to the CLI:

1. **Follow design principles** from [CLI Style Guide](./guides/cli-style.md)
2. **Apply output standards** from [Command Output Guide](./guides/command-output.md)
3. **Use registration patterns** from [Command Registration Guide](./COMMAND_REGISTRATION.md)
4. **Maintain backward compatibility**
5. **Test both output formats**
6. **Update documentation** as needed

## 📝 Documentation Updates

When updating documentation:

- **Guides** (`guides/`) - Comprehensive how-to information
- **ADR** (`adr/`) - Architectural decisions and rationale
- **Root docs** - Quick references and overviews
- **Product docs** - Specific product documentation

For detailed information, refer to the specific documentation files listed above.
