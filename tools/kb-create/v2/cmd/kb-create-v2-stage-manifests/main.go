// kb-create-v2-stage-manifests materializes release metadata from the exact
// tarballs produced by `kb release stage`; it is publish-time tooling only.
package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/kb-labs/create/v2/release"
)

func main() {
	stageManifest := flag.String("stage-manifest", "", "path to release stage manifest.json")
	output := flag.String("output", "", "directory for extracted V2 manifests")
	flag.Parse()
	if *stageManifest == "" || *output == "" {
		fmt.Fprintln(os.Stderr, "--stage-manifest and --output are required")
		os.Exit(2)
	}
	if _, err := release.MaterializeManifests(*stageManifest, *output); err != nil {
		fmt.Fprintf(os.Stderr, "could not materialize V2 release manifests: %v\n", err)
		os.Exit(2)
	}
}
