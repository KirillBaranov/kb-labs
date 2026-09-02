import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const flow = process.env.RELEASE_FLOW;
const planPath = process.env.RELEASE_PLAN_PATH;
const channel = process.env.RELEASE_CHANNEL || "stable";

if (!flow || !planPath) {
  throw new Error("RELEASE_FLOW and RELEASE_PLAN_PATH are required");
}

if (!existsSync(planPath)) {
  throw new Error(`Release plan was not written to ${planPath}`);
}

const plan = JSON.parse(readFileSync(planPath, "utf8"));
const changelogPath = ".kb/release/CHANGELOG.md";
const changelog = existsSync(changelogPath)
  ? readFileSync(changelogPath, "utf8").trim()
  : "Changelog was not generated.";

const packages = Array.isArray(plan.packages) ? plan.packages : [];
const nextVersion = packages[0]?.nextVersion || "unknown";
const isCanary = channel === "canary";
// Canary never creates a git tag — this is the npm version string it publishes under, not a ref.
const releaseTag = isCanary ? `${nextVersion} (canary, no git tag)` : `${flow}-v${nextVersion}`;

function command(args, fallback = "") {
  try {
    return execFileSync(args[0], args.slice(1), {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

// Best-effort — a status-check failure (network, gh not authed, etc.) must
// never block the review from rendering. Absence of this section is itself
// a visible signal ("status unavailable"), not a silent skip.
function releaseStatus(flowName) {
  try {
    const raw = execFileSync(
      "pnpm",
      ["-s", "kb", "release", "status", "--flow", flowName, "--json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30000 },
    );
    return JSON.parse(raw);
  } catch (err) {
    return { error: err?.message || String(err) };
  }
}

function repositoryUrl() {
  const remote = command(["git", "remote", "get-url", "origin"]);
  const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/);
  return match ? `https://github.com/${match[1]}` : "";
}

const repository = repositoryUrl();
const previousTag = command([
  "git",
  "describe",
  "--tags",
  "--match",
  `${flow}-v*`,
  "--abbrev=0",
]);
// Canary never creates a git ref, so there is nothing on GitHub to link to.
const compareUrl =
  isCanary
    ? ""
    : repository && previousTag
      ? `${repository}/compare/${previousTag}...${releaseTag}`
      : repository
        ? `${repository}/releases/tag/${releaseTag}`
        : "";
const tagUrl = !isCanary && repository ? `${repository}/releases/tag/${releaseTag}` : "";

const status = releaseStatus(flow);
const statusSection = (() => {
  if (status.error) {
    return `⚠️ Release status check unavailable: ${status.error}`;
  }
  const lines = [
    `- Last stable tag: \`${status.git?.tag ?? "none"}\` (${status.git?.version ?? "—"})`,
    `- npm \`${status.npm?.stableDistTag ?? "latest"}\`: ${status.npm?.stableVersion ?? (status.npm?.stableDrift ? "DRIFT — packages disagree" : "unresolved")}`,
    `- npm \`${status.npm?.canaryDistTag ?? "canary"}\`: ${status.npm?.canaryVersion ?? (status.npm?.canaryDrift ? "DRIFT — packages disagree" : "unresolved")}`,
  ];
  if (status.verdict?.warnings?.length) {
    lines.push(
      "",
      "**⚠️ Before approving, note the current release is not fully clean:**",
      ...status.verdict.warnings.map((w) => `- ⚠️ ${w}`),
    );
  } else {
    lines.push("", "✅ No drift between the last stable tag and npm — clean baseline for this candidate.");
  }
  return lines.join("\n");
})();

const summary = {
  flow,
  strategy: plan.strategy,
  registry: plan.registry,
  releaseTag,
  previousTag: previousTag || null,
  packages: packages.map((pkg) => ({
    name: pkg.name,
    currentVersion: pkg.currentVersion,
    nextVersion: pkg.nextVersion,
    bump: pkg.bump,
  })),
};

const packageTable =
  summary.packages.length > 0
    ? summary.packages
        .map(
          (pkg) =>
            `| [${pkg.name}](https://www.npmjs.com/package/${pkg.name}) | ${pkg.currentVersion || "—"} | ${pkg.nextVersion || "—"} | ${pkg.bump || "—"} |`,
        )
        .join("\n")
    : "| — | — | — | — |";

const links = [
  compareUrl
    ? `- Changes: [compare with ${previousTag || "the previous release"}](${compareUrl})`
    : isCanary
      ? "- Changes: canary publishes no git ref — nothing to compare/link"
      : "- Changes: repository URL unavailable",
  tagUrl
    ? `- Release tag: [${releaseTag}](${tagUrl})`
    : `- Release tag: \`${releaseTag}\``,
].join("\n");

const review = [
  `# ${flow} release review`,
  "",
  `- **Candidate tag:** \`${releaseTag}\``,
  `- **Packages:** ${summary.packages.length}`,
  `- **Strategy:** ${plan.strategy || "—"}`,
  `- **Registry:** ${plan.registry || "—"}`,
  "",
  links,
  "",
  "## Current release status (before this candidate)",
  "",
  statusSection,
  "",
  "## Packages",
  "",
  "| Package | Current | Next | Bump |",
  "| --- | --- | --- | --- |",
  packageTable,
  "",
  "## Changelog",
  "",
  changelog,
].join("\n");

const payload = Buffer.from(
  JSON.stringify({
    plan: summary,
    review,
    changelog,
    compareUrl,
    tagUrl,
    releaseStatus: status,
  }),
  "utf8",
).toString("base64");

console.log(`::kb-output:base64::${payload}`);
