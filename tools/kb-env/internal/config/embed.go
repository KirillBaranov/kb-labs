package config

import _ "embed"

// embeddedTestbed is the built-in default profile matrix, used when the repo
// does not ship its own e2e/testbed/testbed.yaml.
//
//go:embed profiles/testbed.yaml
var embeddedTestbed []byte
