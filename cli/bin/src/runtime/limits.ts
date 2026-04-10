import type { CliCommandDecl, ManifestV3, PermissionSpec } from "@kb-labs/plugin-contracts";
import type { RegisteredCommand } from "@kb-labs/cli-commands";
import { box, keyValue } from "@kb-labs/shared-cli-ui";
import { colors } from "@kb-labs/cli-runtime";

export interface LimitPresenter {
  write?: (msg: string) => void;
  error?: (msg: string) => void;
  json?: (payload: unknown) => void;
}

export type LimitRegistry = {
  getCommandsByGroup(group: string): RegisteredCommand[];
  getManifestCommand(idOrAlias: string): RegisteredCommand | undefined;
};

export interface LimitHandleOptions {
  cmdPath: string[];
  presenter: LimitPresenter;
  registry: LimitRegistry;
  asJson: boolean;
}

interface LimitJsonPayload {
  ok: boolean;
  scope: "product" | "command";
  product: string;
  command?: string;
  manifestId?: string;
  version?: string;
  packageName?: string;
  source?: string;
  limits?: {
    permissions?: PermissionSpec;
    setupPermissions?: PermissionSpec;
    command?: {
      id: string;
      describe?: string;
      handler?: string;
      flags?: CliCommandDecl["flags"];
    };
  };
  commands?: Array<{ id: string; describe?: string; available: boolean }>;
  warning?: string;
}

export function handleLimitFlag({
  cmdPath,
  presenter,
  registry,
  asJson,
}: LimitHandleOptions): number {
  if (cmdPath.length === 0) {
    const message =
      "Specify a product or command before --limit (e.g. 'kb mind --limit' or 'kb mind verify --limit').";
    renderError(message, presenter, asJson);
    return 1;
  }

  const isCommandRequest = isCommandPath(cmdPath);

  if (isCommandRequest) {
    return renderCommandLimits(cmdPath, presenter, registry, asJson);
  }

  return renderProductLimits(cmdPath[0]!, presenter, registry, asJson);
}

function renderProductLimits(
  group: string,
  presenter: LimitPresenter,
  registry: LimitRegistry,
  asJson: boolean,
): number {
  const commands = registry.getCommandsByGroup(group);
  if (commands.length === 0) {
    renderError(
      `Unknown product '${group}'. Use 'kb marketplace' to list available namespaces.`,
      presenter,
      asJson,
    );
    return 1;
  }

  const manifest = findManifest(commands);
  if (!manifest) {
    renderError(
      `Product '${group}' has no manifest metadata. Rebuild the plugin to expose permissions info.`,
      presenter,
      asJson,
    );
    return 1;
  }

  const limitsPayload: LimitJsonPayload = {
    ok: true,
    scope: "product",
    product: group,
    manifestId: manifest.id,
    version: manifest.version,
    packageName: commands[0]!.packageName,
    source: commands[0]!.source,
    limits: {
      permissions: manifest.permissions,
      setupPermissions: manifest.setup?.permissions,
    },
    commands: commands.map((cmd) => ({
      id: cmd.manifest.id,
      describe: cmd.manifest.describe,
      available: cmd.available,
    })),
  };

  if (asJson) {
    presenter.json?.(limitsPayload);
    return 0;
  }

  const lines: string[] = [];
  const meta = keyValue({
    "Plugin ID": manifest.id,
    Version: manifest.version ?? "n/a",
    Package: commands[0]!.packageName ?? "n/a",
    Source: commands[0]!.source ?? "n/a",
    Commands: String(commands.length),
  });
  pushSection(lines, `${manifest.display?.name ?? group}`, meta);
  pushPermissionSection(lines, "Default Permissions", manifest.permissions);
  pushSetupSection(lines, manifest.setup?.permissions);

  presenter.write?.(box(`${group} · Limits`, lines));
  return 0;
}

function renderCommandLimits(
  cmdPath: string[],
  presenter: LimitPresenter,
  registry: LimitRegistry,
  asJson: boolean,
): number {
  const commandId = toCommandId(cmdPath);
  if (!commandId) {
    renderError("Unable to resolve command for --limit flag.", presenter, asJson);
    return 1;
  }

  const registered = registry.getManifestCommand(commandId);
  if (!registered) {
    renderError(
      `Unknown command '${commandId}'. Use 'kb ${cmdPath[0]} --help' to list commands.`,
      presenter,
      asJson,
    );
    return 1;
  }

  const manifest = registered.manifest.manifestV2;
  if (!manifest) {
    renderError(
      `Command '${registered.manifest.id}' is missing manifest metadata.`,
      presenter,
      asJson,
    );
    return 1;
  }

  const cliCommand = findCliCommandDecl(manifest, registered.manifest.id);
  const product = registered.manifest.group;

  const payload: LimitJsonPayload = {
    ok: true,
    scope: "command",
    product,
    command: registered.manifest.id,
    manifestId: manifest.id,
    version: manifest.version,
    packageName: registered.packageName,
    source: registered.source,
    limits: {
      permissions: manifest.permissions,
      setupPermissions: manifest.setup?.permissions,
      command: cliCommand
        ? {
            id: cliCommand.id,
            describe: cliCommand.describe,
            handler: cliCommand.handler,
            flags: cliCommand.flags,
          }
        : undefined,
    },
  };

  if (asJson) {
    presenter.json?.(payload);
    return 0;
  }

  const lines: string[] = [];
  const meta = keyValue({
    "Command ID": registered.manifest.id,
    Description: registered.manifest.describe ?? "n/a",
    Handler: cliCommand?.handler ?? "n/a",
    Package: registered.packageName ?? "n/a",
    Source: registered.source ?? "n/a",
  });
  pushSection(lines, `${registered.manifest.id}`, meta);

  if (cliCommand?.flags?.length) {
    const flagLines = cliCommand.flags.map((flag) => formatFlag(flag));
    pushSection(lines, "Flags", flagLines);
  }

  pushPermissionSection(lines, "Inherited Permissions", manifest.permissions);
  pushSetupSection(lines, manifest.setup?.permissions);

  presenter.write?.(
    box(`${registered.manifest.id} · Limits`, lines),
  );
  return 0;
}

function findManifest(commands: RegisteredCommand[]): ManifestV3 | undefined {
  for (const cmd of commands) {
    if (cmd.manifest.manifestV2) {
      return cmd.manifest.manifestV2;
    }
  }
  return undefined;
}

function findCliCommandDecl(
  manifest: ManifestV3,
  fullId: string,
): CliCommandDecl | undefined {
  const cliCommands = manifest.cli?.commands ?? [];
  const normalizedId = fullId.includes(":")
    ? fullId
    : `${manifest.id.replace(/^@kb-labs\//, "")}:${fullId}`;

  return cliCommands.find((cmd) => {
    if (!cmd.id) {
      return false;
    }
    if (cmd.id === fullId) {
      return true;
    }
    if (cmd.id === normalizedId) {
      return true;
    }
    if (!cmd.id.includes(":")) {
      const withNamespace = `${manifest.display?.name ?? manifest.id}:${cmd.id}`;
      return withNamespace === fullId;
    }
    return false;
  });
}

function formatFlag(flag: NonNullable<CliCommandDecl["flags"]>[number]): string {
  const alias = flag.alias ? `, -${flag.alias}` : "";
  const desc = flag.description ? ` – ${flag.description}` : "";
  return `${colors.cyan(`--${flag.name}${alias}`)}${colors.dim(desc)}`;
}

function pushSection(lines: string[], title: string, content: string[]) {
  lines.push(colors.bold(title));
  if (content.length === 0) {
    lines.push("  —");
  } else {
    for (const entry of content) {
      lines.push(`  ${entry}`);
    }
  }
  lines.push("");
}

function pushPermissionSection(
  lines: string[],
  title: string,
  permissions?: PermissionSpec,
) {
  if (!permissions) {
    pushSection(lines, title, ["Not declared"]);
    return;
  }

  const section: string[] = [];

  section.push(...keyValue({
    Timeout: formatMaybeMs(permissions.quotas?.timeoutMs),
    Memory: formatMaybeMb(permissions.quotas?.memoryMb),
    CPU: formatMaybeMs(permissions.quotas?.cpuMs),
  }));

  section.push("");
  section.push(colors.bold("File System"));
  section.push(...formatFsSection(permissions.fs));

  section.push("");
  section.push(colors.bold("Network"));
  section.push(...formatNetSection(permissions.network));

  section.push("");
  section.push(colors.bold("Environment"));
  section.push(...formatEnvSection(permissions.env));

  pushSection(lines, title, section);
}

function pushSetupSection(
  lines: string[],
  setupPermissions?: PermissionSpec,
) {
  if (!setupPermissions) {
    return;
  }
  pushPermissionSection(lines, "Setup Permissions", setupPermissions);
}

function formatFsSection(
  fsPerm?: PermissionSpec["fs"],
): string[] {
  if (!fsPerm) {
    return ["mode: none"];
  }
  return keyValue({
    Read: formatList(fsPerm.read),
    Write: formatList(fsPerm.write),
  });
}

function formatNetSection(
  netPerm?: PermissionSpec["network"],
): string[] {
  if (!netPerm) {
    return ["not declared"];
  }
  return keyValue({
    "Allow Fetch": formatList(netPerm.fetch),
  });
}

function formatEnvSection(
  envPerm?: PermissionSpec["env"],
): string[] {
  if (!envPerm) {
    return ["not declared"];
  }
  return keyValue({
    Read: formatList(envPerm.read),
  });
}

function formatList(items?: string[]): string {
  if (!items || items.length === 0) {
    return "—";
  }
  return items.join(", ");
}

function formatMaybeMs(value?: number): string {
  if (typeof value !== "number") {
    return "—";
  }
  return `${value.toLocaleString()} ms`;
}

function formatMaybeMb(value?: number): string {
  if (typeof value !== "number") {
    return "—";
  }
  return `${value.toLocaleString()} MB`;
}

function renderError(
  message: string,
  presenter: LimitPresenter,
  asJson: boolean,
) {
  if (asJson) {
    presenter.json?.({
      ok: false,
      error: { message },
    });
  } else {
    presenter.error?.(message);
  }
}

function isCommandPath(cmdPath: string[]): boolean {
  if (cmdPath.length === 0) {
    return false;
  }
  if (cmdPath.length === 1) {
    return cmdPath[0]!.includes(":");
  }
  return true;
}

function toCommandId(cmdPath: string[]): string | undefined {
  if (cmdPath.length === 0) {
    return undefined;
  }
  if (cmdPath.length === 1) {
    return cmdPath[0];
  }
  const [group, ...rest] = cmdPath;
  return `${group}:${rest.join(":")}`;
}
