package wizard

// freeGatewayFeature keeps the product copy and availability switch together.
// The copy is sourced from web/apps/web's Privacy Policy: the gateway proxies
// diffs to OpenAI, does not store diffs, and provides 50 calls per device.
//
// Flip Enabled when the gateway infrastructure is healthy again. Until then it
// is intentionally absent from the selectable provider list, while the wizard
// states why and continues to offer BYOK.
var freeGatewayFeature = struct {
	Enabled        bool
	Label          string
	Description    string
	DisabledReason string
}{
	Enabled:     false,
	Label:       "KB Labs Gateway",
	Description: "50 free AI calls per device. Your diff is proxied to OpenAI and is not stored by KB Labs.",
	DisabledReason: "Temporarily unavailable while KB Labs Gateway infrastructure is being repaired. " +
		"Use your own provider for now.",
}

type llmProviderOption struct {
	id   string
	name string
	desc string
}

func llmProviderOptions() []llmProviderOption {
	options := []llmProviderOption{
		{id: "openai", name: "OpenAI", desc: "OPENAI_API_KEY — sent directly to OpenAI."},
		{id: "anthropic", name: "Anthropic", desc: "ANTHROPIC_API_KEY — sent directly to Anthropic."},
	}
	if freeGatewayFeature.Enabled {
		options = append(options, llmProviderOption{
			name: freeGatewayFeature.Label,
			desc: freeGatewayFeature.Description,
		})
	}
	return options
}
