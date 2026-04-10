# @kb-labs/adapters-openai

> Part of [KB Labs](https://github.com/KirillBaranov/kb-labs) ecosystem. Works exclusively within KB Labs platform.

OpenAI language model adapter supporting GPT-4, GPT-3.5, and other OpenAI models with streaming and function calling.

## Overview

| Property | Value |
|----------|-------|
| **Implements** | `ILLM` |
| **Type** | `core` |
| **Requires** | None |
| **Category** | AI |

## Features

- **Multiple Models** - GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
- **Streaming Support** - Real-time token streaming
- **Function Calling** - Native tool/function support
- **Configurable** - Temperature, max tokens, and more

## Installation

```bash
pnpm add @kb-labs/adapters-openai
```

## Configuration

Add to your `kb.config.json`:

```json
{
  "platform": {
    "adapters": {
      "llm": "@kb-labs/adapters-openai"
    },
    "adapterOptions": {
      "llm": {
        "apiKey": "${OPENAI_API_KEY}",
        "model": "gpt-4-turbo",
        "temperature": 0.7
      }
    }
  }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | - | OpenAI API key |
| `model` | `string` | `"gpt-4-turbo"` | Model to use |
| `temperature` | `number` | `0.7` | Sampling temperature (0.0 to 2.0) |
| `maxTokens` | `number` | - | Maximum tokens to generate |

## Usage

### Via Platform (Recommended)

```typescript
import { usePlatform } from '@kb-labs/sdk';

const platform = usePlatform();

// Simple chat
const response = await platform.llm.chat([
  { role: 'user', content: 'Hello!' }
]);

// Streaming
for await (const chunk of platform.llm.stream([
  { role: 'user', content: 'Tell me a story' }
])) {
  process.stdout.write(chunk.content);
}

// With function calling
const result = await platform.llm.chatWithTools(
  [{ role: 'user', content: 'What is the weather?' }],
  [{ name: 'getWeather', parameters: { ... } }]
);
```

### Standalone (Testing/Development)

```typescript
import { createAdapter } from '@kb-labs/adapters-openai';

const llm = createAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-turbo'
});

const response = await llm.chat([
  { role: 'user', content: 'Hello!' }
]);
```

## Adapter Manifest

```typescript
{
  id: 'openai-llm',
  name: 'OpenAI LLM',
  version: '1.0.0',
  implements: 'ILLM',
  capabilities: {
    streaming: true,
    custom: {
      functionCalling: true,
    },
  },
}
```

## FAQ

<details>
<summary><strong>Q: How do I switch models?</strong></summary>

Change the `model` option:

```json
{
  "adapterOptions": {
    "llm": {
      "model": "gpt-3.5-turbo"
    }
  }
}
```
</details>

<details>
<summary><strong>Q: How do I handle rate limits?</strong></summary>

The adapter includes automatic retry with exponential backoff. For high-volume usage, consider using OpenAI's usage tiers or implement request queuing.
</details>

## Related Adapters

| Adapter | Use Case |
|---------|----------|
| `@kb-labs/adapters-vibeproxy` | Local multi-provider proxy (Claude, GPT, etc.) |

## License

[KB Public License v1.1](../../LICENSE) - KB Labs Team
