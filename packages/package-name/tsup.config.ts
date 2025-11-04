import config from "@kb-labs/devkit/tsup/node.js";

export default {
  ...config,
  entry: {
    index: "src/index.ts",
  },
  external: [/^@kb-labs\//, "ajv", "ajv-formats", "yaml", "picomatch"],
  skipNodeModulesBundle: true,
};
