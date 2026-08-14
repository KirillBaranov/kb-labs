package contracts

import "testing"

func TestInstallRequestNormalizeDefaultsToSafeCIContract(t *testing.T) {
	request, err := (InstallRequest{PlatformRoot: t.TempDir()}).Normalize()
	if err != nil {
		t.Fatalf("Normalize() error = %v", err)
	}
	if request.Schema != RequestSchema || request.Platform.Channel != ChannelStable || request.Policy != PolicyStrict || request.Source != SourceRegistry {
		t.Fatalf("unexpected defaults: %#v", request)
	}
}

func TestInstallRequestRejectsAmbiguousOrDuplicatePins(t *testing.T) {
	_, err := (InstallRequest{
		PlatformRoot: t.TempDir(),
		Platform:     VersionSelector{Version: "2.1.0", Channel: ChannelCanary},
	}).Normalize()
	if err == nil {
		t.Fatal("expected platform version/channel conflict")
	}

	_, err = (InstallRequest{
		PlatformRoot: t.TempDir(),
		Plugins:      []ComponentRequest{{ID: "review"}, {ID: "review"}},
	}).Normalize()
	if err == nil {
		t.Fatal("expected duplicate plugin error")
	}
}

func TestInstallRequestSortsComponentsAndRedactsSecretValues(t *testing.T) {
	request, err := (InstallRequest{
		PlatformRoot: t.TempDir(),
		Plugins:      []ComponentRequest{{ID: "workflow"}, {ID: "commit"}},
		SecretInputs: []string{"adapter.llm.apiKey", "adapter.llm.apiKey"},
		Values:       map[string]string{"adapter.llm.apiKey": "must-not-be-here"},
	}).Normalize()
	if err != nil {
		t.Fatalf("Normalize() error = %v", err)
	}
	if request.Plugins[0].ID != "commit" || len(request.SecretInputs) != 1 {
		t.Fatalf("request was not normalized: %#v", request)
	}
	if _, leaked := request.Values[request.SecretInputs[0]]; leaked {
		t.Fatal("secret input leaked into non-secret Values")
	}
}
