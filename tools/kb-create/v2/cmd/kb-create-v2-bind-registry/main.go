// kb-create-v2-bind-registry turns a staged draft index into an installable
// public index only after npm serves byte-identical candidate tarballs.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/release"
)

func main() {
	input := flag.String("input", "", "sealed staged V2 release index")
	stage := flag.String("stage-manifest", "", "exact release stage manifest.json")
	output := flag.String("output", "", "public sealed V2 release index")
	registry := flag.String("registry", "https://registry.npmjs.org", "npm registry base URL")
	flag.Parse()
	if err := run(*input, *stage, *output, *registry); err != nil {
		fmt.Fprintf(os.Stderr, "could not bind V2 release index to registry: %v\n", err)
		os.Exit(2)
	}
}

func run(input, stage, output, registry string) error {
	if input == "" || stage == "" || output == "" {
		return fmt.Errorf("--input, --stage-manifest and --output are required")
	}
	data, err := os.ReadFile(input)
	if err != nil {
		return err
	}
	var source catalog.Catalog
	if err := json.Unmarshal(data, &source); err != nil {
		return err
	}
	if err := catalog.Verify(source); err != nil {
		return err
	}
	bound, err := release.BindRegistryTarballs(source, stage, registry, nil)
	if err != nil {
		return err
	}
	data, err = json.MarshalIndent(bound, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(output), 0o750); err != nil {
		return err
	}
	return os.WriteFile(output, append(data, '\n'), 0o600)
}
