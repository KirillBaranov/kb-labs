# @kb-labs/adapters-snapshot-localfs

Local filesystem implementation of `ISnapshotProvider`.

## Features

- Capture snapshot by copying source directory into snapshot store
- Restore snapshot to target directory
- Status/delete/garbage-collect lifecycle
- Can resolve workspace root from workspace registry
