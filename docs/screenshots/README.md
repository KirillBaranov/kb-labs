# KB Labs Screenshots

This directory contains screenshots demonstrating KB Labs platform capabilities.

## Current Screenshots

### Dashboard
- `dashboard/dashboards.jpg` - Studio UI dashboard showing platform observability and analytics

### Commit Plugin (LLM-Powered)
- `commit-plugin/generated-commits.jpg` - AI-generated conventional commits overview
- `commit-plugin/generated-commit-details.jpg` - Detailed commit message with file changes
- `commit-plugin/generated-commit-files-summary.jpg` - File-by-file breakdown
- `commit-plugin/generated-commits-diff-files-preview.jpg` - Interactive diff preview

### Infrastructure
- `infrastructure/adapter-configuration-displaying.gif` - Live demonstration of adapter configuration

## Directory Structure

```
screenshots/
├── dashboard/
│   └── dashboards.jpg                    # Dashboard overview (39KB)
├── commit-plugin/
│   ├── generated-commits.jpg             # Commits list (49KB)
│   ├── generated-commit-details.jpg      # Commit details (63KB)
│   ├── generated-commit-files-summary.jpg # Files summary (61KB)
│   └── generated-commits-diff-files-preview.jpg # Diff preview (47KB)
├── infrastructure/
│   └── adapter-configuration-displaying.gif  # Infrastructure swap demo (936KB GIF)
├── mind-rag/          # (Future: AI code search examples)
└── devkit/            # (Future: DevKit monorepo tools)
```

## Screenshot Guidelines

### Dashboard Screenshots

**metrics-overview.png**
- **What to capture:** Studio UI Observability page showing Prometheus metrics overview
- **Key elements:** Total requests, error rate, success rate, response time charts
- **Resolution:** 1920x1080 or higher
- **Browser:** Chrome/Firefox at 100% zoom

**system-health.png**
- **What to capture:** System Health dashboard showing CPU, memory, instances
- **Key elements:** Active/stale/dead instances, average CPU/memory, health status
- **Resolution:** 1920x1080 or higher

**incident-timeline.png**
- **What to capture:** Incident Management page with incident timeline
- **Key elements:** Open/resolved incidents, severity levels, timeline visualization
- **Resolution:** 1920x1080 or higher

**prometheus-metrics.png**
- **What to capture:** Raw Prometheus metrics endpoint or metrics visualization
- **Key elements:** kb_http_request_total, kb_http_request_errors_total, kb_execution_duration
- **Resolution:** 1920x1080 or higher

### Commit Plugin Screenshots

**commit-generation.png**
- **What to capture:** Terminal output showing `pnpm kb commit commit --scope="package-name"`
- **Key elements:** "Analyzing changes...", "Generated N commits" list
- **Resolution:** Terminal at least 120 columns wide

**commit-output.png**
- **What to capture:** Terminal output showing applied commits and summary box
- **Key elements:** Commit hashes, summary table with tokens/cost
- **Resolution:** Terminal at least 120 columns wide

### Mind RAG Screenshots

**query-example.png**
- **What to capture:** Terminal showing `pnpm kb mind rag-query --text "..." --agent`
- **Key elements:** Query command with actual search question
- **Resolution:** Terminal at least 120 columns wide

**search-results.png**
- **What to capture:** JSON output from Mind RAG with answer, confidence, sources
- **Key elements:** High confidence score (≥0.7), file paths with line numbers, mode indicator
- **Resolution:** Terminal at least 120 columns wide

### DevKit Screenshots

**health-check.png**
- **What to capture:** Output from `npx kb-devkit-health`
- **Key elements:** Passed checks, warnings, errors, health score, recommendations
- **Resolution:** Terminal at least 120 columns wide

**types-audit.png**
- **What to capture:** Output from `npx kb-devkit-types-audit` (partial, first 30 lines)
- **Key elements:** Type coverage summary, packages with errors
- **Resolution:** Terminal at least 120 columns wide

**build-order.png**
- **What to capture:** Output from `npx kb-devkit-build-order --layers`
- **Key elements:** Parallel build layers, dependency order
- **Resolution:** Terminal at least 120 columns wide

### Infrastructure Screenshots

**kb-config-swap.png**
- **What to capture:** Side-by-side comparison in VS Code showing kb.config.json before/after adapter swap
- **Key elements:** Diff view showing Redis → InMemory cache change
- **Resolution:** 1920x1080 or higher
- **Editor:** VS Code with diff view enabled

## Screenshot Preparation

### Terminal Screenshots
1. Use a clean terminal with high contrast theme
2. Set terminal width to at least 120 columns
3. Clear screen before running command: `clear`
4. Run command and capture output
5. Crop unnecessary whitespace
6. Export as PNG with high quality

### Browser Screenshots
1. Open KB Labs Studio in incognito/private mode (clean state)
2. Set browser zoom to 100%
3. Use full screen mode (F11) to remove browser chrome
4. Wait for all data to load
5. Capture entire viewport
6. Export as PNG with high quality

### VS Code Screenshots
1. Use default theme or popular theme (One Dark Pro, GitHub Dark)
2. Hide minimap and activity bar for cleaner look
3. Set font size to 14px for readability
4. Use split view for before/after comparisons
5. Export as PNG with high quality

## Image Optimization

After capturing screenshots:
```bash
# Install optimization tools (macOS)
brew install optipng

# Optimize PNG files
optipng -o7 screenshots/**/*.png
```

## Usage in README

Screenshots are referenced in the main README Demo section:

```markdown
![Metrics Overview](./docs/screenshots/dashboard/metrics-overview.png)
```

## Notes

- **Keep screenshots up-to-date** - Update when UI changes significantly
- **Real data only** - Use actual platform data, not mock/placeholder data
- **Consistent theming** - Use same color scheme across all screenshots
- **High resolution** - Minimum 1920x1080 for browser, 120 columns for terminal
- **Clean state** - No debug output, error messages, or personal information
