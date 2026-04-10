# Plugin Security Model

## Overview

KB CLI plugin system implements a **security-first** approach with multiple layers of protection.

## Security Layers

### 1. Discovery Control

**Default Deny**: 3rd-party plugins from `node_modules` are **disabled by default**.

**Enabling Plugins**:
- Workspace packages: Always enabled
- Linked packages: Always enabled  
- `@kb-labs/*` packages: Always enabled
- Other packages: Require allowlist or explicit enable

**Configuration** (`kb-labs.config.json`):
```json
{
  "plugins": {
    "allow": ["@vendor/plugin-cli"],
    "block": ["@malicious/plugin"],
    "linked": ["../local-plugin"]
  }
}
```

### 2. Permissions System

Plugins declare required permissions in manifest:

```typescript
{
  permissions: ["fs.read", "fs.write", "git.read", "net.fetch"]
}
```

**Default Permissions**:
- 3rd-party plugins: `fs.read` only
- Workspace plugins: All permissions granted

**Granting Permissions**:
```bash
kb plugins enable @vendor/plugin --perm fs.write,net.fetch
```

**Available Permissions**:
- `fs.read`: Read filesystem
- `fs.write`: Write filesystem
- `git.read`: Read git repository
- `git.write`: Modify git repository
- `net.fetch`: Make HTTP requests

### 3. Execution Guards

**Timeouts**:
- Command execution timeout: **5 minutes**
- Manifest loading timeout: **10 seconds**
- Auto-kill on timeout

**Memory Limits**:
- Soft limit: 512 MB
- Monitoring via process stats

**Crash Handling**:
- Automatic crash recording
- **Quarantine mode**: Auto-disable after 3 consecutive crashes
- Crash reports include: error code, plugin version, Node version

### 4. Integrity Verification

**SRI Hashes**:
- Package integrity stored in `.kb/plugins.json`
- Warns on hash mismatch
- Future: Signed manifests

**Package Verification**:
```json
{
  "plugins": {
    "integrity": {
      "@vendor/plugin": "sha256-..."
    }
  }
}
```

### 5. Environment Isolation

**Future**: Sandboxed execution
- Subprocess isolation
- Whitelisted environment variables
- Restricted file system access

**Current**: Permissions-based control

## Threat Model

### Threats Addressed

1. **Malicious Plugins**: Default deny + allowlist
2. **Resource Exhaustion**: Timeouts + memory limits
3. **Data Exfiltration**: Permissions control
4. **System Modification**: Permission checks (`fs.write`, `git.write`)
5. **Crashing Plugins**: Quarantine mode

### Not Yet Addressed

1. **Sandboxed Execution**: Planned for v2
2. **Signed Manifests**: Planned for v2
3. **Network Isolation**: Permissions-based only

## Security Best Practices

### For Plugin Authors

1. **Declare Minimal Permissions**: Only request what you need
2. **Handle Errors Gracefully**: Avoid crashes
3. **Validate Input**: Don't trust user input
4. **Don't Store Secrets**: Use environment variables

### For Plugin Users

1. **Review Permissions**: Check what plugins request
2. **Use Allowlist**: Explicitly allow trusted plugins
3. **Monitor Crashes**: Run `kb plugins doctor` regularly
4. **Update Regularly**: Keep plugins and CLI updated

## Incident Response

### Plugin Crashes

1. Auto-recorded in `.kb/plugins.json`
2. After 3 crashes: Auto-disabled
3. Run `kb plugins doctor` for details
4. Fix or disable plugin

### Suspicious Behavior

1. Check permissions: `kb plugins ls`
2. Review logs: `--verbose` flag
3. Disable plugin: `kb plugins disable <name>`
4. Report issue

## Configuration

### Security Settings

```json
{
  "plugins": {
    "allow": [],
    "block": [],
    "permissions": {
      "@vendor/plugin": ["fs.read"]
    },
    "integrity": {
      "@vendor/plugin": "sha256-..."
    }
  }
}
```

### Environment Variables

- `KB_CLI_PLUGINS_ALLOW`: Comma-separated allowlist (overrides config)
- `KB_CLI_PLUGINS_BLOCK`: Comma-separated blocklist (overrides config)
- `KB_CLI_DISABLE_PLUGINS=1`: Disable all plugins

## Future Enhancements

1. **Sandboxed Execution**: Subprocess isolation
2. **Signed Manifests**: Cryptographic verification
3. **Plugin Store**: Curated, verified plugins
4. **Audit Logging**: Track plugin actions
5. **Network Isolation**: Restrict network access per plugin

