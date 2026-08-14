// kb-create-v2-stage-manifests materializes release metadata from the exact
// tarballs produced by `kb release stage`; it is publish-time tooling only.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"github.com/kb-labs/create/v2/release"
)

func main() {
	stageManifest := flag.String("stage-manifest", "", "path to release stage manifest.json")
	output := flag.String("output", "", "directory for extracted V2 manifests")
	topology := flag.String("topology", "", "optional V2 topology JSON; only selected packages require launcher metadata")
	flag.Parse()
	if *stageManifest == "" || *output == "" {
		fmt.Fprintln(os.Stderr, "--stage-manifest and --output are required")
		os.Exit(2)
	}
	packages, err := topologyPackages(*topology)
	if err != nil {
		fmt.Fprintf(os.Stderr, "could not read V2 topology: %v\n", err)
		os.Exit(2)
	}
	if _, err := release.MaterializeManifests(*stageManifest, *output, packages...); err != nil {
		fmt.Fprintf(os.Stderr, "could not materialize V2 release manifests: %v\n", err)
		os.Exit(2)
	}
}

func topologyPackages(path string) ([]string, error) {
	if path == "" {
		return nil, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var source struct {
		Platforms []struct {
			Package string `json:"package"`
			Members []struct {
				Package string `json:"package"`
			} `json:"members"`
		} `json:"platforms"`
		SDKs []struct {
			Package string `json:"package"`
		} `json:"sdks"`
		Plugins []struct {
			Package string `json:"package"`
		} `json:"plugins"`
		Adapters []struct {
			Package string `json:"package"`
		} `json:"adapters"`
	}
	if err := json.Unmarshal(data, &source); err != nil {
		return nil, err
	}
	result := []string{}
	for _, platform := range source.Platforms {
		result = append(result, platform.Package)
		for _, member := range platform.Members {
			result = append(result, member.Package)
		}
	}
	for _, sdk := range source.SDKs {
		result = append(result, sdk.Package)
	}
	for _, plugin := range source.Plugins {
		result = append(result, plugin.Package)
	}
	for _, adapter := range source.Adapters {
		result = append(result, adapter.Package)
	}
	return result, nil
}
