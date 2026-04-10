# ADR-0007: DevKit Drift Check

**Date:** 2025-09-18
**Status:** Proposed
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, process]

## Context

As our development kits (DevKits) evolve, it is essential to ensure consistency and detect any unintended changes or drifts from the expected configuration or state. Drift in DevKits can lead to integration issues, unexpected behaviors, and increased debugging time. To maintain quality and reliability, we need a standardized approach to check for drift in our DevKits.

## Decision

We will implement a DevKit Drift Check process that involves:

- Defining a baseline configuration and state for each DevKit version
- Automating the comparison of the current DevKit state against the baseline
- Reporting any deviations or drifts clearly and promptly
- Integrating the drift check into our continuous integration (CI) pipeline to catch issues early
- Providing remediation steps or automated fixes when feasible

This approach ensures that any drift is detected early, maintaining the integrity and reliability of our DevKits.

## Implementation

The drift check is implemented via a script located at `scripts/devkit-sync.mjs`. This script facilitates two main commands:

- `pnpm sync`: Synchronizes the project configuration files with the baseline sources provided by the `@kb-labs/devkit` package
- `pnpm drift-check`: Verifies the consistency of the project files against the baseline. It compares the current project files against the source files in `@kb-labs/devkit`, reports any differences found, and exits with code 2 if any drift is detected

When drift is detected, the script outputs a detailed log showing the files that differ and the specific discrepancies, enabling developers to quickly identify and address the issues.

Example output when drift is detected:

```bash
Drift detected in the following files:
 - config/devkit.json
 - scripts/build.js

Differences:
--- baseline/config/devkit.json
+++ project/config/devkit.json
@@ -1,5 +1,5 @@
 {
-  "version": "1.0.0",
+  "version": "1.0.1",
   "features": ["featureA", "featureB"]
 }

--- baseline/scripts/build.js
+++ project/scripts/build.js
@@ -10,7 +10,7 @@
-    console.log("Build started");
+    console.log("Build initiated");
```

This mechanism ensures that any unintended changes are caught early, preserving the integrity of the DevKit environment.

## Consequences

**Positive:**

- Increased confidence in DevKit consistency
- Early detection of configuration or state issues
- Automated validation reduces manual verification overhead

**Negative:**

- Additional CI pipeline steps and maintenance overhead
- Need to maintain baseline definitions as DevKits evolve
- Dependency on DevKit availability for drift checks
