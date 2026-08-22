// Package wizard is a deliberately thin human frontend. It gathers a V2
// InstallRequest and delegates compatibility decisions to the shared resolver;
// it never carries installer state or recreates an interactive-only plan.
package wizard

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
	"github.com/kb-labs/create/v2/flow"
	"github.com/kb-labs/create/v2/scenario"
)

type IO struct {
	In  io.Reader
	Out io.Writer
}

func Request(source catalog.Catalog, platformRoot string, terminal IO) (contracts.InstallRequest, error) {
	if err := catalog.Verify(source); err != nil {
		return contracts.InstallRequest{}, err
	}
	if strings.TrimSpace(platformRoot) == "" {
		return contracts.InstallRequest{}, fmt.Errorf("platform root is required")
	}
	if terminal.In == nil || terminal.Out == nil {
		return contracts.InstallRequest{}, fmt.Errorf("wizard input and output are required")
	}
	reader := bufio.NewReader(terminal.In)
	channels := availableChannels(source)
	channel, err := choose(reader, terminal.Out, "Platform channel", channels, string(contracts.ChannelStable))
	if err != nil {
		return contracts.InstallRequest{}, err
	}
	version := source.Channels[contracts.Channel(channel)]
	platform, ok := findPlatform(source.Platforms, version)
	if !ok {
		return contracts.InstallRequest{}, fmt.Errorf("channel %q does not resolve to a platform bundle", channel)
	}
	profiles := make([]string, 0, len(platform.Profiles))
	for profile := range platform.Profiles {
		profiles = append(profiles, profile)
	}
	sort.Strings(profiles)
	profile, err := choose(reader, terminal.Out, "Service profile", profiles, "default")
	if err != nil {
		return contracts.InstallRequest{}, err
	}
	plugins, err := chooseMany(reader, terminal.Out, "Plugins (comma-separated IDs; blank for none)", componentIDs(source.Plugins))
	if err != nil {
		return contracts.InstallRequest{}, err
	}
	adapters, err := chooseMany(reader, terminal.Out, "Adapters (comma-separated IDs; blank for automatic providers)", adapterIDs(source.Adapters))
	if err != nil {
		return contracts.InstallRequest{}, err
	}
	request := contracts.InstallRequest{Schema: contracts.RequestSchema, Platform: contracts.VersionSelector{Channel: contracts.Channel(channel)}, ServiceProfile: profile, Plugins: components(plugins), Adapters: components(adapters), Policy: contracts.PolicyCompatible, Source: contracts.SourceRegistry, PlatformRoot: platformRoot}
	return request.Normalize()
}

// RequestScenario is the human-facing compiler for a declarative V2 scenario.
// It owns prompts and navigation only; scenario.Compile and the shared V2
// resolver remain the authority for request meaning and compatibility.
func RequestScenario(source catalog.Catalog, platformRoot, scenarioID string, terminal IO) (contracts.InstallRequest, error) {
	if err := catalog.Verify(source); err != nil {
		return contracts.InstallRequest{}, err
	}
	if strings.TrimSpace(platformRoot) == "" {
		return contracts.InstallRequest{}, fmt.Errorf("platform root is required")
	}
	if terminal.In == nil || terminal.Out == nil {
		return contracts.InstallRequest{}, fmt.Errorf("wizard input and output are required")
	}
	reader := bufio.NewReader(terminal.In)
	if scenarioID == "" {
		ids, err := scenario.IDs()
		if err != nil {
			return contracts.InstallRequest{}, err
		}
		scenarioID, err = choose(reader, terminal.Out, "Scenario", ids, "explore")
		if err != nil {
			return contracts.InstallRequest{}, err
		}
	}
	definition, err := scenario.Load(scenarioID)
	if err != nil {
		return contracts.InstallRequest{}, err
	}
	channels := availableChannels(source)
	channel, err := choose(reader, terminal.Out, "Platform channel", channels, string(contracts.ChannelStable))
	if err != nil {
		return contracts.InstallRequest{}, err
	}
	version := source.Channels[contracts.Channel(channel)]
	platform, ok := findPlatform(source.Platforms, version)
	if !ok {
		return contracts.InstallRequest{}, fmt.Errorf("channel %q does not resolve to a platform bundle", channel)
	}
	profiles := make([]string, 0, len(platform.Profiles))
	for profile := range platform.Profiles {
		profiles = append(profiles, profile)
	}
	sort.Strings(profiles)
	profile, err := choose(reader, terminal.Out, "Service profile", profiles, "default")
	if err != nil {
		return contracts.InstallRequest{}, err
	}
	base := contracts.InstallRequest{PlatformRoot: platformRoot, Platform: contracts.VersionSelector{Channel: contracts.Channel(channel)}, ServiceProfile: profile, Policy: contracts.PolicyCompatible, Source: contracts.SourceRegistry}
	session, err := flow.New(definition, nil, nil)
	if err != nil {
		return contracts.InstallRequest{}, err
	}
	for !session.State.Done {
		requests := session.Inspect()
		for _, request := range requests {
			field := request.Field
			label := field.Label
			if label == "" {
				label = field.ID
			}
			if field.Description != "" {
				fmt.Fprintf(terminal.Out, "%s: %s\n", label, field.Description)
			}
			var raw string
			if len(field.Options) > 0 {
				options := make([]string, 0, len(field.Options))
				for _, option := range field.Options {
					options = append(options, option.Value)
				}
				value, chooseErr := choose(reader, terminal.Out, label, options, defaultString(field.Default))
				if chooseErr != nil {
					return contracts.InstallRequest{}, chooseErr
				}
				raw = fmt.Sprintf("%q", value)
			} else {
				fmt.Fprintf(terminal.Out, "%s: ", label)
				value, readErr := reader.ReadString('\n')
				if readErr != nil && readErr != io.EOF {
					return contracts.InstallRequest{}, readErr
				}
				raw = fmt.Sprintf("%q", strings.TrimSpace(value))
			}
			if err := session.Apply(field.ID, []byte(raw), flow.SourceHuman); err != nil {
				return contracts.InstallRequest{}, err
			}
		}
		if err := session.Next(); err != nil {
			return contracts.InstallRequest{}, err
		}
	}
	return scenario.Compile(definition, session.State, base)
}

func defaultString(raw []byte) string {
	var value string
	if len(raw) > 0 && json.Unmarshal(raw, &value) == nil {
		return value
	}
	return ""
}

func choose(reader *bufio.Reader, output io.Writer, label string, options []string, fallback string) (string, error) {
	fmt.Fprintf(output, "%s [%s] (default %s): ", label, strings.Join(options, ", "), fallback)
	value, err := reader.ReadString('\n')
	if err != nil && err != io.EOF {
		return "", err
	}
	value = strings.TrimSpace(value)
	if value == "" {
		value = fallback
	}
	for _, option := range options {
		if value == option {
			return value, nil
		}
	}
	return "", fmt.Errorf("%s %q is not available", strings.ToLower(label), value)
}

func chooseMany(reader *bufio.Reader, output io.Writer, label string, options []string) ([]string, error) {
	fmt.Fprintf(output, "%s [%s]: ", label, strings.Join(options, ", "))
	value, err := reader.ReadString('\n')
	if err != nil && err != io.EOF {
		return nil, err
	}
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	available := map[string]bool{}
	for _, option := range options {
		available[option] = true
	}
	seen, result := map[string]bool{}, []string{}
	for _, item := range strings.Split(value, ",") {
		item = strings.TrimSpace(item)
		if !available[item] {
			return nil, fmt.Errorf("component %q is not available", item)
		}
		if !seen[item] {
			seen[item] = true
			result = append(result, item)
		}
	}
	sort.Strings(result)
	return result, nil
}

func availableChannels(source catalog.Catalog) []string {
	result := make([]string, 0, len(source.Channels))
	for channel := range source.Channels {
		result = append(result, string(channel))
	}
	sort.Strings(result)
	return result
}
func componentIDs(values []catalog.Component) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, value.ID)
	}
	sort.Strings(result)
	return result
}
func adapterIDs(values []catalog.Adapter) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, value.ID)
	}
	sort.Strings(result)
	return result
}
func components(ids []string) []contracts.ComponentRequest {
	result := make([]contracts.ComponentRequest, 0, len(ids))
	for _, id := range ids {
		result = append(result, contracts.ComponentRequest{ID: id})
	}
	return result
}
func findPlatform(values []catalog.PlatformBundle, version string) (catalog.PlatformBundle, bool) {
	for _, value := range values {
		if value.Version == version {
			return value, true
		}
	}
	return catalog.PlatformBundle{}, false
}
