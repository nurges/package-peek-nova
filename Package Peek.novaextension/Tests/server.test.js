"use strict";

const assert = require("assert");
const {
  buildHoverMarkdown,
  dependencyAtPosition,
  isRegistryVersionSpec,
  updatedSpec
} = require("../Scripts/server");

const packageJson = JSON.stringify({
  name: "example",
  dependencies: {
    react: "^18.2.0",
    "@scope/tool": "~1.0.0"
  },
  scripts: {
    react: "^999.0.0"
  }
}, null, 2);

const lines = packageJson.split("\n");
const reactLine = lines.findIndex((line) => line.includes("\"react\": \"^18.2.0\""));
const scriptLine = lines.findIndex((line) => line.includes("\"react\": \"^999.0.0\""));
const dependency = dependencyAtPosition(packageJson, {
  line: reactLine,
  character: 8
});

assert(dependency);
assert.strictEqual(dependency.name, "react");
assert.strictEqual(dependency.spec, "^18.2.0");
assert.strictEqual(dependency.section, "dependencies");
assert.strictEqual(
  dependencyAtPosition(packageJson, { line: scriptLine, character: 8 }),
  null
);

assert.strictEqual(updatedSpec("^1.0.0", "2.0.0"), "^2.0.0");
assert.strictEqual(updatedSpec("~1.0.0", "2.0.0"), "~2.0.0");
assert.strictEqual(updatedSpec("1.0.0", "2.0.0"), "2.0.0");
assert.strictEqual(isRegistryVersionSpec("workspace:^"), false);
assert.strictEqual(isRegistryVersionSpec("file:../local"), false);
assert.strictEqual(isRegistryVersionSpec("^1.0.0"), true);

const hover = buildHoverMarkdown(dependency, {
  name: "react",
  version: "19.1.0",
  description: "A UI library",
  deprecated: null,
  license: "MIT",
  homepage: "https://react.dev",
  repository: "https://github.com/facebook/react",
  node: ">=0.10.0",
  maintainer: "react-bot",
  downloads: 1234567
});

assert(hover.includes("**Latest:** `19.1.0`"));
assert(hover.includes("1,234,567"));
assert(hover.includes("[Homepage](https://react.dev)"));

console.log("Package Peek server tests passed.");
