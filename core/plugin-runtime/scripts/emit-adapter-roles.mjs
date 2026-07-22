// Snapshots ADAPTER_REGISTRY_KEYS (the canonical capability/role-name list)
// to a plain JSON array so consumers that can't execute JS (e.g. kb-create,
// a Go binary) can validate role names without a Node dependency.
//
// Runs as its own fresh `node` process after tsup finishes building — no
// module-cache staleness concerns to work around here (unlike the devkit
// tsup preset's manifest-emission fallback), since this is a plain data
// export with no build-in-progress timing sensitivity.
import { writeFileSync } from 'node:fs';
import { ADAPTER_REGISTRY_KEYS } from '../dist/index.js';

writeFileSync('dist/adapter-roles.json', JSON.stringify(ADAPTER_REGISTRY_KEYS, null, 2) + '\n');
