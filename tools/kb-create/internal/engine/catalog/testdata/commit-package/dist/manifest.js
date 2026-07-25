export const manifest = {
  schema: "kb.plugin/3",
  id: "@fixture/commit",
  version: "1.2.3",
  platform: {
    requires: ["storage", "cache"],
    optional: ["llm", "analytics"]
  },
  cli: { commands: [{ path: "commit commit", describe: "Commit changes" }] }
};
