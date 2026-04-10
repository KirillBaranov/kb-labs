# CLI Guide

The AI Review plugin exposes a single CLI command, `ai-review:run`. This guide covers usage patterns, flags, and integration tips.

## Command synopsis

```
kb ai-review run --diff <path> [options]
```

The command expects a unified diff file. It executes the provider pipeline, writes artifacts to `.ai-review/`, and returns an `AiReviewCommandOutput` payload.

## Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--diff` | `string` | – (required) | Path to the unified diff file. Relative paths resolve from the detected repo root. |
| `--profile`, `-p` | `string` | `frontend` | Review profile. Profiles define rule sets, boundaries, and context content. |
| `--provider` | `string` | `local` | Provider id. `local` runs deterministic heuristics, `mock` emits sample findings. |
| `--fail-on` | `string` | heuristic | Exit policy: `none`, `major`, or `critical`. Defaults to heuristic exit codes (critical → 20, major → 10). |
| `--max-comments` | `number` | unlimited | Clamp number of findings returned. Highest-severity findings are retained first. |
| `--profiles-dir` | `string` | auto | Override profile lookup directory. Useful when profiles live outside the repo. |
| `--render-human-markdown` | `boolean` | `true` | Generate `.human.md` artifact. Pass `--no-render-human-markdown` to skip. |
| `--render-html` | `boolean` | `false` | Generate HTML report from the human Markdown. |
| `--include-adr` | `boolean` | `true` | Include ADR documents in the context bundle. |
| `--include-boundaries` | `boolean` | `true` | Include `boundaries.json` in the context bundle. |
| `--context-max-bytes` | `number` | `1_500_000` | Hard limit for context document size. Sections beyond the limit are replaced with placeholders. |
| `--context-max-approx-tokens` | `number` | – | Soft token budget. When exceeded, ADR sections are replaced with placeholders. |
| `--json` | `boolean` | `false` | Print the full `AiReviewCommandOutput` JSON payload to stdout. |

## Exit codes

| Condition | Exit code |
|-----------|-----------|
| No findings or only minor/info severities | `0` |
| Top severity is `major` | `10` |
| Top severity is `critical` | `20` |
| `--fail-on major` and ≥ major severity | `1` |
| `--fail-on critical` and ≥ critical severity | `1` |

Configure CI pipelines to treat non-zero exit codes as build failures or soft warnings depending on your policy.

## JSON output structure

The JSON payload mirrors the `AiReviewCommandOutput` schema:

```json
{
  "run": {
    "version": 1,
    "runId": "run_12345",
    "provider": "local",
    "profile": "frontend",
    "startedAt": "2025-11-13T00:00:00.000Z",
    "finishedAt": "2025-11-13T00:00:02.500Z",
    "findings": [
      {
        "rule": "style.no-todo-comment",
        "area": "DX",
        "severity": "minor",
        "file": "src/app.ts",
        "locator": "L10",
        "finding": ["TODO comment found"],
        "why": "Inline TODOs get stale and hide tech debt.",
        "suggestion": "Replace with a tracked ticket URL.",
        "fingerprint": "abc123"
      }
    ],
    "summary": {
      "findingsTotal": 1,
      "findingsBySeverity": {
        "critical": 0,
        "major": 0,
        "minor": 1,
        "info": 0
      },
      "topSeverity": "minor",
      "risk": {
        "score": 10,
        "level": "low",
        "detail": {
          "weights": {
            "critical": 100,
            "major": 50,
            "minor": 10,
            "info": 0
          }
        }
      }
    },
    "context": {
      "profile": "frontend",
      "handbookSections": 1,
      "adrIncluded": true,
      "boundariesIncluded": true
    },
    "artifacts": {
      "reviewJson": ".ai-review/reviews/frontend/review.json",
      "reviewMd": ".ai-review/reviews/frontend/review.md",
      "reviewHumanMd": ".ai-review/reviews/frontend/review.human.md",
      "reviewHtml": ".ai-review/reviews/frontend/review.html",
      "context": ".ai-review/context/frontend.md"
    }
  },
  "exitCode": 10,
  "artifacts": {
    "reviewJson": ".ai-review/reviews/frontend/review.json",
    "reviewMd": ".ai-review/reviews/frontend/review.md",
    "reviewHumanMd": ".ai-review/reviews/frontend/review.human.md",
    "reviewHtml": ".ai-review/reviews/frontend/review.html",
    "context": ".ai-review/context/frontend.md"
  }
}
```

## Usage patterns

- **Local validation**: run `pnpm kb ai-review run --diff $(git diff --staged)` before committing to catch TODOs and boundary violations.
- **CI pipeline gate**: enforce `--fail-on major` to block merges when `major` or `critical` issues appear.
- **Artifact distribution**: publish `.ai-review/reviews/<profile>/review.md` as a comment or dashboard to share review context with teammates.
- **Mock provider**: use `--provider mock` in snapshots/tests to generate deterministic sample findings without inspecting real diffs.

## Troubleshooting

- **“diff path cannot be empty”** – pass a file containing unified diff syntax. When piping data, redirect to a temporary file first.
- **“rules.json not found”** – ensure the requested profile exists under `profiles/<profile>/docs/rules/` or pass `--profiles-dir` pointing to the profiles workspace.
- **Empty findings** – check whether the diff contains lines that match the heuristics. The local provider only emits findings for TODO comments, boundary violations, and internal import leaks.
- **Non-zero exit code with no output** – run with `--json` to inspect the payload; the CLI always returns the parsed summary even when stdout redirection hides the text summary.

