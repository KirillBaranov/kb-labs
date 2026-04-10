# SDK Exports Glossary

Auto-generated from SDK entrypoint surfaces. Do not edit manually.

Regenerate:

```bash
pnpm --filter @kb-labs/sdk docs:exports
```

## `@kb-labs/sdk`

Source: `src/index.ts`

Total exports: **200**

| Export | Kind | From |
|---|---|---|
| `ActionDefinition` | `type` | `./command/index.js` |
| `ActionHandler` | `type` | `./command/index.js` |
| `AlertData` | `type` | `@kb-labs/studio-contracts` |
| `ArrayFlagSchema` | `type` | `@kb-labs/shared-command-kit` |
| `ArtifactInfo` | `type` | `@kb-labs/shared-cli-ui` |
| `BooleanFlagSchema` | `type` | `@kb-labs/shared-command-kit` |
| `BreadcrumbData` | `type` | `@kb-labs/studio-contracts` |
| `BreadcrumbItemDef` | `type` | `@kb-labs/studio-contracts` |
| `CardData` | `type` | `@kb-labs/studio-contracts` |
| `CardListData` | `type` | `@kb-labs/studio-contracts` |
| `ChartAreaData` | `type` | `@kb-labs/studio-contracts` |
| `ChartBarData` | `type` | `@kb-labs/studio-contracts` |
| `ChartDataPoint` | `type` | `@kb-labs/studio-contracts` |
| `ChartLineData` | `type` | `@kb-labs/studio-contracts` |
| `ChartPieData` | `type` | `@kb-labs/studio-contracts` |
| `ChartSeries` | `type` | `@kb-labs/studio-contracts` |
| `CheckboxGroupData` | `type` | `@kb-labs/studio-contracts` |
| `CheckboxItem` | `type` | `@kb-labs/studio-contracts` |
| `ciEnvironmentPreset` | `value` | `@kb-labs/perm-presets` |
| `CleanupFn` | `type` | `./contracts/index.js` |
| `CLIInput` | `type` | `./command/index.js` |
| `ColorFunction` | `type` | `./contracts/index.js` |
| `Colors` | `type` | `./contracts/index.js` |
| `combinePermissions` | `value` | `@kb-labs/perm-presets` |
| `combinePresets` | `value` | `@kb-labs/perm-presets` |
| `CommandDefinition` | `type` | `./command/index.js` |
| `CommandHandler` | `type` | `./command/index.js` |
| `CommandResult` | `type` | `./contracts/index.js` |
| `commonErrors` | `value` | `@kb-labs/shared-command-kit` |
| `ConfirmData` | `type` | `@kb-labs/studio-contracts` |
| `ContextForHost` | `type` | `./utils/index.js` |
| `createTestContext` | `value` | `./test/index.js` |
| `CreateTestContextOptions` | `type` | `./test/index.js` |
| `createTool` | `value` | `@kb-labs/shared-tool-kit` |
| `DatePickerData` | `type` | `@kb-labs/studio-contracts` |
| `defineAction` | `value` | `./command/index.js` |
| `defineCommand` | `value` | `./command/index.js` |
| `defineCommandFlags` | `value` | `./manifest/index.js` |
| `defineEnv` | `value` | `@kb-labs/shared-cli-ui` |
| `defineError` | `value` | `@kb-labs/shared-command-kit` |
| `defineFlags` | `value` | `@kb-labs/shared-command-kit` |
| `defineHandler` | `value` | `@kb-labs/shared-command-kit` |
| `defineManifest` | `value` | `./manifest/index.js` |
| `defineMessage` | `value` | `./command/index.js` |
| `defineRoute` | `value` | `./command/index.js` |
| `defineWebhook` | `value` | `./command/index.js` |
| `defineWebSocket` | `value` | `./command/index.js` |
| `DegradedLevel` | `type` | `@kb-labs/core-runtime` |
| `DegradedOptions` | `type` | `@kb-labs/core-runtime` |
| `DegradedStatus` | `type` | `@kb-labs/core-runtime` |
| `DiffData` | `type` | `@kb-labs/studio-contracts` |
| `displayArtifacts` | `value` | `@kb-labs/shared-cli-ui` |
| `displayArtifactsCompact` | `value` | `@kb-labs/shared-cli-ui` |
| `displaySingleArtifact` | `value` | `@kb-labs/shared-cli-ui` |
| `EnvDefinition` | `type` | `@kb-labs/shared-cli-ui` |
| `EnvSchema` | `type` | `@kb-labs/shared-cli-ui` |
| `ErrorDefinition` | `type` | `@kb-labs/shared-command-kit` |
| `ErrorDefinitions` | `type` | `@kb-labs/shared-command-kit` |
| `ExampleCase` | `type` | `./manifest/index.js` |
| `ExecOptions` | `type` | `./contracts/index.js` |
| `ExecResult` | `type` | `./contracts/index.js` |
| `ExecutionTarget` | `type` | `./contracts/index.js` |
| `ExtractHostContext` | `type` | `./utils/index.js` |
| `FeedbackRecord` | `type` | `@kb-labs/core-platform` |
| `FeedbackType` | `type` | `@kb-labs/core-platform` |
| `FileFeedbackStore` | `value` | `@kb-labs/core-platform` |
| `FileFeedbackStoreOptions` | `type` | `@kb-labs/core-platform` |
| `FileHistoryStore` | `value` | `@kb-labs/core-platform` |
| `FileHistoryStoreOptions` | `type` | `@kb-labs/core-platform` |
| `findRepoRoot` | `value` | `@kb-labs/core-sys` |
| `FlagSchema` | `type` | `@kb-labs/shared-command-kit` |
| `FlagSchemaDefinition` | `type` | `@kb-labs/shared-command-kit` |
| `FlagSchemaWithInfer` | `type` | `@kb-labs/shared-command-kit` |
| `FlagType` | `type` | `@kb-labs/shared-command-kit` |
| `FlagValidationError` | `type` | `@kb-labs/shared-command-kit` |
| `FormData` | `type` | `@kb-labs/studio-contracts` |
| `FormFieldError` | `type` | `@kb-labs/studio-contracts` |
| `fullEnvPreset` | `value` | `@kb-labs/perm-presets` |
| `generateExamples` | `value` | `./manifest/index.js` |
| `getDegradedStatus` | `value` | `@kb-labs/core-runtime` |
| `getLLMTier` | `value` | `./hooks/index.js` |
| `getMonitoringSnapshot` | `value` | `@kb-labs/core-runtime` |
| `gitWorkflowPreset` | `value` | `@kb-labs/perm-presets` |
| `Handler` | `type` | `@kb-labs/shared-command-kit` |
| `HandlerDefinition` | `type` | `@kb-labs/shared-command-kit` |
| `HistoryFindOptions` | `type` | `@kb-labs/core-platform` |
| `HistoryRecord` | `type` | `@kb-labs/core-platform` |
| `HostContext` | `type` | `./contracts/index.js` |
| `HostType` | `type` | `./contracts/index.js` |
| `IAnalytics` | `type` | `@kb-labs/core-platform` |
| `ICache` | `type` | `@kb-labs/core-platform` |
| `IEmbeddings` | `type` | `@kb-labs/core-platform` |
| `IFeedbackStore` | `type` | `@kb-labs/core-platform` |
| `IHistoryStore` | `type` | `@kb-labs/core-platform` |
| `ILLM` | `type` | `@kb-labs/core-platform` |
| `ILogger` | `type` | `@kb-labs/core-platform` |
| `InferFlags` | `type` | `@kb-labs/shared-command-kit` |
| `InputData` | `type` | `@kb-labs/studio-contracts` |
| `isCacheAvailable` | `value` | `./hooks/index.js` |
| `isCLIHost` | `value` | `./command/index.js` |
| `isEmbeddingsAvailable` | `value` | `./hooks/index.js` |
| `isLLMAvailable` | `value` | `./hooks/index.js` |
| `isPlatformConfigured` | `value` | `./hooks/index.js` |
| `isRESTHost` | `value` | `./command/index.js` |
| `IStorage` | `type` | `@kb-labs/core-platform` |
| `isVectorStoreAvailable` | `value` | `./hooks/index.js` |
| `isWebhookHost` | `value` | `./command/index.js` |
| `isWorkflowHost` | `value` | `./command/index.js` |
| `isWSHost` | `value` | `./command/index.js` |
| `IVectorStore` | `type` | `@kb-labs/core-platform` |
| `JsonData` | `type` | `@kb-labs/studio-contracts` |
| `kbPlatformPreset` | `value` | `@kb-labs/perm-presets` |
| `llmAccessPreset` | `value` | `@kb-labs/perm-presets` |
| `LLMMessage` | `type` | `@kb-labs/core-platform` |
| `LLMOptions` | `type` | `@kb-labs/core-platform` |
| `LLMResponse` | `type` | `@kb-labs/core-platform` |
| `LLMTier` | `type` | `./hooks/index.js` |
| `LLMTool` | `type` | `@kb-labs/core-platform` |
| `LLMToolCall` | `type` | `@kb-labs/core-platform` |
| `LLMToolCallOptions` | `type` | `@kb-labs/core-platform` |
| `LLMToolCallResponse` | `type` | `@kb-labs/core-platform` |
| `Loader` | `type` | `@kb-labs/shared-cli-ui` |
| `LogEntry` | `type` | `@kb-labs/studio-contracts` |
| `LogsData` | `type` | `@kb-labs/studio-contracts` |
| `ManifestV3` | `type` | `./contracts/index.js` |
| `MemoryFeedbackStore` | `value` | `@kb-labs/core-platform` |
| `MemoryHistoryStore` | `value` | `@kb-labs/core-platform` |
| `MenuData` | `type` | `@kb-labs/studio-contracts` |
| `MenuItemDef` | `type` | `@kb-labs/studio-contracts` |
| `MessageBuilder` | `value` | `./command/index.js` |
| `MessageRouter` | `value` | `./command/index.js` |
| `MetricData` | `type` | `@kb-labs/studio-contracts` |
| `MetricGroupData` | `type` | `@kb-labs/studio-contracts` |
| `minimalPreset` | `value` | `@kb-labs/perm-presets` |
| `ModalData` | `type` | `@kb-labs/studio-contracts` |
| `MonitoringOptions` | `type` | `@kb-labs/core-runtime` |
| `MonitoringSnapshot` | `type` | `@kb-labs/core-runtime` |
| `npmPublishPreset` | `value` | `@kb-labs/perm-presets` |
| `NumberFlagSchema` | `type` | `@kb-labs/shared-command-kit` |
| `OutputSection` | `type` | `./contracts/index.js` |
| `parseEnvFromRuntime` | `value` | `@kb-labs/shared-cli-ui` |
| `PermissionPreset` | `type` | `@kb-labs/perm-presets` |
| `PermissionSpec` | `type` | `./contracts/index.js` |
| `PieSlice` | `type` | `@kb-labs/studio-contracts` |
| `PlatformServices` | `type` | `./contracts/index.js` |
| `PluginAPI` | `type` | `./contracts/index.js` |
| `PluginContextDescriptor` | `type` | `./contracts/index.js` |
| `PluginContextV3` | `type` | `./contracts/index.js` |
| `PluginError` | `value` | `@kb-labs/shared-command-kit` |
| `PresetBuilder` | `type` | `@kb-labs/perm-presets` |
| `presets` | `value` | `@kb-labs/perm-presets` |
| `RestInput` | `type` | `@kb-labs/shared-command-kit` |
| `RouteDefinition` | `type` | `./command/index.js` |
| `RouteHandler` | `type` | `./command/index.js` |
| `RuntimeAPI` | `type` | `./contracts/index.js` |
| `SafeValidationResult` | `type` | `@kb-labs/shared-command-kit` |
| `SelectData` | `type` | `@kb-labs/studio-contracts` |
| `SelectOptionItem` | `type` | `@kb-labs/studio-contracts` |
| `ShellAPI` | `type` | `./contracts/index.js` |
| `SideBoxOptions` | `type` | `./contracts/index.js` |
| `StepDef` | `type` | `@kb-labs/studio-contracts` |
| `StepperData` | `type` | `@kb-labs/studio-contracts` |
| `StringFlagSchema` | `type` | `@kb-labs/shared-command-kit` |
| `SwitchData` | `type` | `@kb-labs/studio-contracts` |
| `TableData` | `type` | `@kb-labs/studio-contracts` |
| `TableRow` | `type` | `@kb-labs/studio-contracts` |
| `TimelineData` | `type` | `@kb-labs/studio-contracts` |
| `TimelineItem` | `type` | `@kb-labs/studio-contracts` |
| `TimingTracker` | `value` | `@kb-labs/shared-cli-ui` |
| `ToolDefinitionShape` | `type` | `@kb-labs/shared-tool-kit` |
| `ToolShape` | `type` | `@kb-labs/shared-tool-kit` |
| `ToolSpec` | `type` | `@kb-labs/shared-tool-kit` |
| `trackAnalyticsEvent` | `value` | `./hooks/index.js` |
| `TreeData` | `type` | `@kb-labs/studio-contracts` |
| `TreeNode` | `type` | `@kb-labs/studio-contracts` |
| `TypedSender` | `type` | `./command/index.js` |
| `UIFacade` | `type` | `./contracts/index.js` |
| `useAnalytics` | `value` | `./hooks/index.js` |
| `useCache` | `value` | `./hooks/index.js` |
| `useConfig` | `value` | `./hooks/index.js` |
| `useEmbeddings` | `value` | `./hooks/index.js` |
| `useLLM` | `value` | `./hooks/index.js` |
| `UseLLMOptions` | `type` | `./hooks/index.js` |
| `useLoader` | `value` | `@kb-labs/shared-cli-ui` |
| `useLogger` | `value` | `./hooks/index.js` |
| `useLoggerWithContext` | `value` | `./hooks/index.js` |
| `usePlatform` | `value` | `./hooks/index.js` |
| `useStorage` | `value` | `./hooks/index.js` |
| `useVectorStore` | `value` | `./hooks/index.js` |
| `ValidationResult` | `type` | `@kb-labs/shared-command-kit` |
| `vectorStorePreset` | `value` | `@kb-labs/perm-presets` |
| `WebhookDefinition` | `type` | `./command/index.js` |
| `WebhookHandler` | `type` | `./command/index.js` |
| `WebSocketDefinition` | `type` | `./command/index.js` |
| `WebSocketHandler` | `type` | `./command/index.js` |
| `WebSocketHostContext` | `type` | `./contracts/index.js` |
| `WSInput` | `type` | `./contracts/index.js` |
| `WSLifecycleEvent` | `type` | `./contracts/index.js` |
| `WSMessage` | `type` | `./contracts/index.js` |
| `WSSender` | `type` | `./contracts/index.js` |

## `@kb-labs/sdk/command`

Source: `src/command/index.ts`

Total exports: **25**

| Export | Kind | From |
|---|---|---|
| `ActionDefinition` | `type` | `@kb-labs/shared-command-kit` |
| `ActionHandler` | `type` | `@kb-labs/shared-command-kit` |
| `CLIInput` | `type` | `@kb-labs/shared-command-kit` |
| `CommandDefinition` | `type` | `@kb-labs/shared-command-kit` |
| `CommandHandler` | `type` | `@kb-labs/shared-command-kit` |
| `defineAction` | `value` | `@kb-labs/shared-command-kit` |
| `defineCommand` | `value` | `@kb-labs/shared-command-kit` |
| `defineMessage` | `value` | `@kb-labs/shared-command-kit` |
| `defineRoute` | `value` | `@kb-labs/shared-command-kit` |
| `defineWebhook` | `value` | `@kb-labs/shared-command-kit` |
| `defineWebSocket` | `value` | `@kb-labs/shared-command-kit` |
| `isCLIHost` | `value` | `@kb-labs/shared-command-kit` |
| `isRESTHost` | `value` | `@kb-labs/shared-command-kit` |
| `isWebhookHost` | `value` | `@kb-labs/shared-command-kit` |
| `isWorkflowHost` | `value` | `@kb-labs/shared-command-kit` |
| `isWSHost` | `value` | `@kb-labs/shared-command-kit` |
| `MessageBuilder` | `value` | `@kb-labs/shared-command-kit` |
| `MessageRouter` | `value` | `@kb-labs/shared-command-kit` |
| `RouteDefinition` | `type` | `@kb-labs/shared-command-kit` |
| `RouteHandler` | `type` | `@kb-labs/shared-command-kit` |
| `TypedSender` | `type` | `@kb-labs/shared-command-kit` |
| `WebhookDefinition` | `type` | `@kb-labs/shared-command-kit` |
| `WebhookHandler` | `type` | `@kb-labs/shared-command-kit` |
| `WebSocketDefinition` | `type` | `@kb-labs/shared-command-kit` |
| `WebSocketHandler` | `type` | `@kb-labs/shared-command-kit` |

## `@kb-labs/sdk/manifest`

Source: `src/manifest/index.ts`

Total exports: **5**

| Export | Kind | From |
|---|---|---|
| `defineCommandFlags` | `value` | `@kb-labs/shared-command-kit` |
| `defineManifest` | `value` | `@kb-labs/shared-command-kit` |
| `ExampleCase` | `type` | `(local)` |
| `generateExamples` | `value` | `(local)` |
| `permissions` | `value` | `@kb-labs/shared-command-kit` |

## `@kb-labs/sdk/hooks`

Source: `src/hooks/index.ts`

Total exports: **19**

| Export | Kind | From |
|---|---|---|
| `getLLMTier` | `value` | `@kb-labs/shared-command-kit` |
| `isCacheAvailable` | `value` | `@kb-labs/shared-command-kit` |
| `isEmbeddingsAvailable` | `value` | `@kb-labs/shared-command-kit` |
| `isLLMAvailable` | `value` | `@kb-labs/shared-command-kit` |
| `isPlatformConfigured` | `value` | `@kb-labs/shared-command-kit` |
| `isVectorStoreAvailable` | `value` | `@kb-labs/shared-command-kit` |
| `LLMTier` | `type` | `@kb-labs/shared-command-kit` |
| `trackAnalyticsEvent` | `value` | `@kb-labs/shared-command-kit` |
| `useAnalytics` | `value` | `@kb-labs/shared-command-kit` |
| `useCache` | `value` | `@kb-labs/shared-command-kit` |
| `useConfig` | `value` | `@kb-labs/shared-command-kit` |
| `useEmbeddings` | `value` | `@kb-labs/shared-command-kit` |
| `useLLM` | `value` | `@kb-labs/shared-command-kit` |
| `UseLLMOptions` | `type` | `@kb-labs/shared-command-kit` |
| `useLogger` | `value` | `@kb-labs/shared-command-kit` |
| `useLoggerWithContext` | `value` | `@kb-labs/shared-command-kit` |
| `usePlatform` | `value` | `@kb-labs/shared-command-kit` |
| `useStorage` | `value` | `@kb-labs/shared-command-kit` |
| `useVectorStore` | `value` | `@kb-labs/shared-command-kit` |

## `@kb-labs/sdk/contracts`

Source: `src/contracts/index.ts`

Total exports: **36**

| Export | Kind | From |
|---|---|---|
| `CleanupFn` | `type` | `@kb-labs/plugin-contracts` |
| `ColorFunction` | `type` | `@kb-labs/plugin-contracts` |
| `Colors` | `type` | `@kb-labs/plugin-contracts` |
| `CommandResult` | `type` | `@kb-labs/plugin-contracts` |
| `createExecutionMeta` | `value` | `@kb-labs/plugin-contracts` |
| `DEFAULT_PERMISSIONS` | `value` | `@kb-labs/plugin-contracts` |
| `ExecOptions` | `type` | `@kb-labs/plugin-contracts` |
| `ExecResult` | `type` | `@kb-labs/plugin-contracts` |
| `ExecutionTarget` | `type` | `@kb-labs/plugin-contracts` |
| `getHandlerPath` | `value` | `@kb-labs/plugin-contracts` |
| `getHandlerPermissions` | `value` | `@kb-labs/plugin-contracts` |
| `getLoggerMetadataFromHost` | `value` | `@kb-labs/plugin-contracts` |
| `HostContext` | `type` | `@kb-labs/plugin-contracts` |
| `HostType` | `type` | `@kb-labs/plugin-contracts` |
| `isManifestV3` | `value` | `@kb-labs/plugin-contracts` |
| `ManifestV3` | `type` | `@kb-labs/plugin-contracts` |
| `noopTraceContext` | `value` | `@kb-labs/plugin-contracts` |
| `noopUI` | `value` | `@kb-labs/plugin-contracts` |
| `OutputSection` | `type` | `@kb-labs/plugin-contracts` |
| `parseManifest` | `value` | `@kb-labs/plugin-contracts` |
| `PermissionSpec` | `type` | `@kb-labs/plugin-contracts` |
| `PlatformServices` | `type` | `@kb-labs/plugin-contracts` |
| `PluginAPI` | `type` | `@kb-labs/plugin-contracts` |
| `PluginContextDescriptor` | `type` | `@kb-labs/plugin-contracts` |
| `PluginContextV3` | `type` | `@kb-labs/plugin-contracts` |
| `resolveHeaderPolicy` | `value` | `@kb-labs/plugin-contracts` |
| `RuntimeAPI` | `type` | `@kb-labs/plugin-contracts` |
| `ShellAPI` | `type` | `@kb-labs/plugin-contracts` |
| `SideBoxOptions` | `type` | `@kb-labs/plugin-contracts` |
| `UIFacade` | `type` | `@kb-labs/plugin-contracts` |
| `validateManifest` | `value` | `@kb-labs/plugin-contracts` |
| `WebSocketHostContext` | `type` | `@kb-labs/plugin-contracts` |
| `WSInput` | `type` | `@kb-labs/plugin-contracts` |
| `WSLifecycleEvent` | `type` | `@kb-labs/plugin-contracts` |
| `WSMessage` | `type` | `@kb-labs/plugin-contracts` |
| `WSSender` | `type` | `@kb-labs/plugin-contracts` |

## `@kb-labs/sdk/types`

Source: `src/types/index.ts`

Total exports: **52**

| Export | Kind | From |
|---|---|---|
| `*` | `type` | `../contracts/index.js` |
| `ArrayFlagSchema` | `type` | `@kb-labs/shared-command-kit` |
| `ArtifactInfo` | `type` | `@kb-labs/shared-cli-ui` |
| `BooleanFlagSchema` | `type` | `@kb-labs/shared-command-kit` |
| `DegradedLevel` | `type` | `@kb-labs/core-runtime` |
| `DegradedOptions` | `type` | `@kb-labs/core-runtime` |
| `DegradedStatus` | `type` | `@kb-labs/core-runtime` |
| `EnvDefinition` | `type` | `@kb-labs/shared-cli-ui` |
| `EnvSchema` | `type` | `@kb-labs/shared-cli-ui` |
| `ErrorDefinition` | `type` | `@kb-labs/shared-command-kit` |
| `ErrorDefinitions` | `type` | `@kb-labs/shared-command-kit` |
| `FeedbackRecord` | `type` | `@kb-labs/core-platform` |
| `FeedbackType` | `type` | `@kb-labs/core-platform` |
| `FlagSchema` | `type` | `@kb-labs/shared-command-kit` |
| `FlagSchemaDefinition` | `type` | `@kb-labs/shared-command-kit` |
| `FlagSchemaWithInfer` | `type` | `@kb-labs/shared-command-kit` |
| `FlagType` | `type` | `@kb-labs/shared-command-kit` |
| `FlagValidationError` | `type` | `@kb-labs/shared-command-kit` |
| `Handler` | `type` | `@kb-labs/shared-command-kit` |
| `HandlerDefinition` | `type` | `@kb-labs/shared-command-kit` |
| `HistoryFindOptions` | `type` | `@kb-labs/core-platform` |
| `HistoryRecord` | `type` | `@kb-labs/core-platform` |
| `IAnalytics` | `type` | `@kb-labs/core-platform` |
| `ICache` | `type` | `@kb-labs/core-platform` |
| `IEmbeddings` | `type` | `@kb-labs/core-platform` |
| `IFeedbackStore` | `type` | `@kb-labs/core-platform` |
| `IHistoryStore` | `type` | `@kb-labs/core-platform` |
| `ILLM` | `type` | `@kb-labs/core-platform` |
| `ILogger` | `type` | `@kb-labs/core-platform` |
| `InferFlags` | `type` | `@kb-labs/shared-command-kit` |
| `IStorage` | `type` | `@kb-labs/core-platform` |
| `IVectorStore` | `type` | `@kb-labs/core-platform` |
| `LLMMessage` | `type` | `@kb-labs/core-platform` |
| `LLMOptions` | `type` | `@kb-labs/core-platform` |
| `LLMResponse` | `type` | `@kb-labs/core-platform` |
| `LLMTool` | `type` | `@kb-labs/core-platform` |
| `LLMToolCall` | `type` | `@kb-labs/core-platform` |
| `LLMToolCallOptions` | `type` | `@kb-labs/core-platform` |
| `LLMToolCallResponse` | `type` | `@kb-labs/core-platform` |
| `Loader` | `type` | `@kb-labs/shared-cli-ui` |
| `MonitoringOptions` | `type` | `@kb-labs/core-runtime` |
| `MonitoringSnapshot` | `type` | `@kb-labs/core-runtime` |
| `NumberFlagSchema` | `type` | `@kb-labs/shared-command-kit` |
| `PermissionPreset` | `type` | `@kb-labs/perm-presets` |
| `PresetBuilder` | `type` | `@kb-labs/perm-presets` |
| `RestInput` | `type` | `@kb-labs/shared-command-kit` |
| `SafeValidationResult` | `type` | `@kb-labs/shared-command-kit` |
| `StringFlagSchema` | `type` | `@kb-labs/shared-command-kit` |
| `ToolDefinitionShape` | `type` | `@kb-labs/shared-tool-kit` |
| `ToolShape` | `type` | `@kb-labs/shared-tool-kit` |
| `ToolSpec` | `type` | `@kb-labs/shared-tool-kit` |
| `ValidationResult` | `type` | `@kb-labs/shared-command-kit` |

## `@kb-labs/sdk/testing`

Source: `src/testing/index.ts`

Total exports: **34**

| Export | Kind | From |
|---|---|---|
| `createInfraApiMocks` | `value` | `@kb-labs/shared-testing` |
| `createMockEnvironmentAPI` | `value` | `@kb-labs/shared-testing` |
| `createMockPlatformApi` | `value` | `@kb-labs/shared-testing` |
| `createMockPluginAPI` | `value` | `@kb-labs/shared-testing` |
| `createMockPluginContextV3` | `value` | `@kb-labs/shared-testing` |
| `createMockRuntime` | `value` | `@kb-labs/shared-testing` |
| `createMockSnapshotAPI` | `value` | `@kb-labs/shared-testing` |
| `createMockTrace` | `value` | `@kb-labs/shared-testing` |
| `createMockUI` | `value` | `@kb-labs/shared-testing` |
| `createMockWorkspaceAPI` | `value` | `@kb-labs/shared-testing` |
| `createTestContext` | `value` | `@kb-labs/shared-testing` |
| `CreateTestContextOptions` | `type` | `@kb-labs/shared-testing` |
| `LLMCall` | `type` | `@kb-labs/shared-testing` |
| `LLMToolCallRecord` | `type` | `@kb-labs/shared-testing` |
| `LogEntry` | `type` | `@kb-labs/shared-testing` |
| `mockCache` | `value` | `@kb-labs/shared-testing` |
| `MockCacheInstance` | `type` | `@kb-labs/shared-testing` |
| `mockLLM` | `value` | `@kb-labs/shared-testing` |
| `MockLLM` | `type` | `@kb-labs/shared-testing` |
| `MockLLMInstance` | `type` | `@kb-labs/shared-testing` |
| `mockLogger` | `value` | `@kb-labs/shared-testing` |
| `MockLoggerInstance` | `type` | `@kb-labs/shared-testing` |
| `mockStorage` | `value` | `@kb-labs/shared-testing` |
| `MockStorageInstance` | `type` | `@kb-labs/shared-testing` |
| `mockTool` | `value` | `@kb-labs/shared-tool-kit/testing` |
| `MockToolInstance` | `type` | `@kb-labs/shared-tool-kit/testing` |
| `setupTestPlatform` | `value` | `@kb-labs/shared-testing` |
| `TestableHandler` | `type` | `@kb-labs/shared-testing` |
| `testCommand` | `value` | `@kb-labs/shared-testing` |
| `TestCommandOptions` | `type` | `@kb-labs/shared-testing` |
| `TestCommandResult` | `type` | `@kb-labs/shared-testing` |
| `TestContextResult` | `type` | `@kb-labs/shared-testing` |
| `TestPlatformOptions` | `type` | `@kb-labs/shared-testing` |
| `TestPlatformResult` | `type` | `@kb-labs/shared-testing` |

