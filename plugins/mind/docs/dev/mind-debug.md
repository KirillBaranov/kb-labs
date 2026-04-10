# Mind Debug Guide

## Quick Troubleshooting

### Common Issues

#### 1. "Mind structure not initialized"
**Error**: `MIND_NO_INDEX` or "Mind structure not initialized"

**Solution**:
```bash
kb mind init
```

**Check**: Verify `.kb/mind/index.json` exists

#### 2. "Index hash mismatch"
**Error**: `MIND_INDEX_INCONSISTENT` or hash mismatch warnings

**Solution**:
```bash
kb mind update
kb mind verify
```

**Check**: Run `kb mind verify --json` to see specific inconsistencies

#### 3. "Query not found"
**Error**: `MIND_QUERY_NOT_FOUND` or "Invalid query name"

**Solution**: Use valid query names:
- `impact`, `scope`, `exports`, `externals`, `chain`, `meta`, `docs`

**Check**: Run `kb mind query --help` for available queries

#### 4. "File not found"
**Error**: `MIND_FILE_NOT_FOUND` or "File not found"

**Solution**:
- Use absolute paths or paths relative to project root
- Ensure file exists and is accessible
- Check file permissions

#### 6. Cache Issues
**Error**: Slow query performance or stale results

**Solution**:
```bash
# Clear cache
kb mind query meta --no-cache

# Use CI mode for deterministic results
kb mind query meta --cache-mode=ci

# Check cache TTL
kb mind query meta --cache-ttl 0
```

**Check**: Run `kb mind query meta --cache-mode=ci` for fresh results

## Debugging Commands

### Inspect Index Files
```bash
# Check main index
cat .kb/mind/index.json | jq .

# Check API index
cat .kb/mind/api-index.json | jq .

# Check dependencies
cat .kb/mind/deps.json | jq .

# Check recent changes
cat .kb/mind/recent-diff.json | jq .
```

### Verify Index Consistency
```bash
# Basic verification
kb mind verify

# Detailed verification with JSON output
kb mind verify --json

# Check specific inconsistencies
kb mind verify --json | jq '.inconsistencies'
```

### Test Query Execution
```bash
# Test basic query
kb mind query meta --json

# Test with AI mode
kb mind query exports --file src/index.ts --ai-mode --json

# Test with verbose output
kb mind query impact --file src/index.ts --verbose
```

### Check Workspace State
```bash
# List all index files
ls -la .kb/mind/

# Check file sizes
du -h .kb/mind/*.json

# Check last modified times
stat .kb/mind/index.json
```

## Error Code Reference

### Index Errors
- `MIND_NO_INDEX`: Main index file missing
- `MIND_INDEX_INCONSISTENT`: Hash mismatches detected
- `MIND_INDEX_CORRUPTED`: Index file is malformed

### Query Errors
- `MIND_QUERY_NOT_FOUND`: Invalid query name
- `MIND_INVALID_FLAG`: Missing required parameters
- `MIND_FILE_NOT_FOUND`: Specified file doesn't exist
- `MIND_QUERY_ERROR`: General query execution error

### System Errors
- `MIND_PERMISSION_DENIED`: File access denied
- `MIND_FS_TIMEOUT`: File system operation timeout
- `MIND_TIME_BUDGET`: Operation exceeded time limit
- `MIND_CACHE_ERROR`: Cache operation failed

### Gateway Errors
- `MIND_BAD_REQUEST`: Invalid HTTP request
- `MIND_GATEWAY_ERROR`: Gateway handler error
- `MIND_VERIFY_ERROR`: Verification process error

## Performance Debugging

### Check Query Performance
```bash
# Time a query execution
time kb mind query meta --json

# Check cache behavior
kb mind query exports --file src/index.ts --no-cache
kb mind query exports --file src/index.ts  # Should be faster
```

### Monitor Index Updates
```bash
# Time index update
time kb mind update

# Check update with time budget
kb mind update --time-budget 1000
```

### Memory Usage
```bash
# Check memory usage during operations
ps aux | grep node
```

## Log Analysis

### Enable Verbose Logging
```bash
# Enable verbose output
kb mind update --verbose
kb mind query meta --verbose
```

### Check Log Files
```bash
# Look for error logs
grep -i error .kb/mind/*.log 2>/dev/null || echo "No log files found"

# Check for warnings
grep -i warn .kb/mind/*.log 2>/dev/null || echo "No log files found"
```

## Index File Inspection

### Main Index Structure
```json
{
  "schemaVersion": "1.0",
  "generator": "kb-labs-mind@0.1.0",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "root": "/path/to/project",
  "filesIndexed": 150,
  "apiIndexHash": "sha256_abc123",
  "depsHash": "sha256_def456",
  "recentDiffHash": "sha256_ghi789",
  "indexChecksum": "sha256_combined"
}
```

### Verify Hash Consistency
```bash
# Check if hashes match file contents
sha256sum .kb/mind/api-index.json
# Compare with apiIndexHash in index.json

sha256sum .kb/mind/deps.json
# Compare with depsHash in index.json
```

### Check File Integrity
```bash
# Validate JSON syntax
jq . .kb/mind/index.json > /dev/null && echo "Valid JSON" || echo "Invalid JSON"

# Check for required fields
jq '.schemaVersion, .generator, .updatedAt' .kb/mind/index.json
```

## Common Fixes

### Reset Mind Workspace
```bash
# Remove all indexes
rm -rf .kb/mind/

# Reinitialize
kb mind init

# Update indexes
kb mind update
```

### Fix Permission Issues
```bash
# Fix ownership
sudo chown -R $USER:$USER .kb/

# Fix permissions
chmod -R 755 .kb/
```

### Clear Cache
```bash
# Remove cache directory
rm -rf .kb/mind/cache/

# Or use no-cache flag
kb mind query meta --no-cache
```

### Fix Corrupted Indexes
```bash
# Backup current indexes
cp -r .kb/mind .kb/mind.backup

# Remove corrupted files
rm .kb/mind/api-index.json  # Example

# Regenerate
kb mind update
```

## Advanced Debugging

### Debug Query Execution
```bash
# Test individual query components
kb mind query meta --json | jq '.meta.timingMs'
kb mind query meta --json | jq '.meta.filesScanned'
```

### Debug Index Generation
```bash
# Check what files are being indexed
kb mind update --verbose 2>&1 | grep "Processing"

# Check time budget usage
kb mind update --time-budget 100 --verbose
```

### Debug Cache Behavior
```bash
# Check cache directory
ls -la .kb/mind/cache/ 2>/dev/null || echo "No cache directory"

# Clear specific cache entry
rm .kb/mind/cache/query_*.json
```

## Getting Help

### Check Version Information
```bash
kb mind --version
kb mind query --version
```

### Enable Debug Mode
```bash
# Set debug environment variable
export DEBUG=mind:*
kb mind query meta
```

### Report Issues
When reporting issues, include:
1. Error message and code
2. Command that caused the error
3. Project structure (`ls -la`)
4. Index file contents (`kb mind verify --json`)
5. System information (`node --version`, `pnpm --version`)
