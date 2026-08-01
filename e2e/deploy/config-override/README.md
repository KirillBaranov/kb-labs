# Fail-fast composition fixture

This Docker e2e test reuses the gateway entrypoint and proves three cases:

1. a release image without composition exits before starting;
2. a config without a lock also exits; and
3. explicitly supplied config and lock allow startup.

Run from the repository root:

```sh
sh e2e/deploy/config-override/test.sh
```
