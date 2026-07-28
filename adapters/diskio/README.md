# @kb-labs/data-store

Local directory storage for KB Labs. The adapter exposes the platform's
`IStorage` contract and keeps every operation below one configured root.

## What it provides

- byte-oriented reads and writes;
- recursive prefix listing;
- existence checks, deletion, copy and move;
- metadata with size, modification time and a small MIME map;
- read/write streams for large objects;
- an optional permission wrapper with allow and deny prefixes.

## Example

```ts
import { createAdapter } from "@kb-labs/data-store";

const storage = createAdapter({ baseDir: "/var/lib/my-service" });

await storage.write("reports/today.txt", Buffer.from("ready"));
const report = await storage.read("reports/today.txt");
const files = await storage.list("reports/");
```

The root is resolved once at construction time. Absolute names and names that
resolve above the root are rejected before the filesystem is touched.

## Permission wrapper

```ts
import { createSecureStorage } from "@kb-labs/data-store/secure-storage";

const restricted = createSecureStorage(storage, {
  allowlist: ["reports/"],
  denylist: ["reports/private/"],
  delete: false,
});
```

Denials are reported as `StoragePermissionError`. `exists()` returns `false`
for a denied path so callers cannot use it to probe protected names.

## Configuration

`baseDir` defaults to the current working directory. The package has no
runtime dependency beyond Node.js and the KB Labs adapter types.
