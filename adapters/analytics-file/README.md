# @kb-labs/adapters-analytics-file

> Part of [KB Labs](https://github.com/KirillBaranov/kb-labs) ecosystem. Works exclusively within KB Labs platform.

File-based analytics adapter for KB Labs platform. Writes events/metrics as JSONL into `.kb/analytics/buffer`.

## Usage

`kb.config.json`:
```json
"platform": {
  "adapters": {
    "analytics": "@kb-labs/adapters-analytics-file"
  },
  "adapterOptions": {
    "analytics": {
      "baseDir": ".kb/analytics/buffer",
      "filenamePattern": "events-YYYYMMDD"
    }
  }
}
```

Options (all optional):
- `baseDir`: target directory (default `.kb/analytics/buffer` relative to `process.cwd()`).
- `filenamePattern`: filename without extension (`YYYYMMDD` will be replaced by date), default `events-YYYYMMDD`.

Record format: one JSON object per line.

## License

[KB Public License v1.1](../../LICENSE) - KB Labs Team
