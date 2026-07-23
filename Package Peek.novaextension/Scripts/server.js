#!/usr/bin/env node

"use strict";

const https = require("https");

const documents = new Map();
const packageCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies"
];

function dependencyAtPosition(text, position) {
  const lines = text.split(/\r?\n/);
  const line = lines[position.line];

  if (line === undefined) {
    return null;
  }

  const match = /^\s*"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$/.exec(line);

  if (!match) {
    return null;
  }

  const name = match[1];
  const spec = match[2];
  let packageJson;

  try {
    packageJson = JSON.parse(text);
  } catch (error) {
    return null;
  }

  const section = DEPENDENCY_SECTIONS.find((sectionName) => {
    const dependencies = packageJson[sectionName];
    return dependencies &&
      typeof dependencies === "object" &&
      Object.prototype.hasOwnProperty.call(dependencies, name) &&
      dependencies[name] === spec;
  });

  if (!section) {
    return null;
  }

  const colonIndex = line.indexOf(":");
  const quotedSpec = `"${spec}"`;
  const quotedSpecStart = line.indexOf(quotedSpec, colonIndex + 1);
  const nameStart = line.indexOf(`"${name}"`) + 1;

  if (quotedSpecStart < 0 || nameStart < 1) {
    return null;
  }

  const versionStart = quotedSpecStart + 1;
  const dependencyStart = nameStart;
  const dependencyEnd = versionStart + spec.length;

  if (position.character < dependencyStart || position.character > dependencyEnd) {
    return null;
  }

  return {
    name,
    spec,
    section,
    range: {
      start: {
        line: position.line,
        character: dependencyStart
      },
      end: {
        line: position.line,
        character: dependencyEnd
      }
    },
    versionRange: {
      start: {
        line: position.line,
        character: versionStart
      },
      end: {
        line: position.line,
        character: versionStart + spec.length
      }
    }
  };
}

function updatedSpec(currentSpec, latestVersion) {
  if (currentSpec.startsWith("^")) {
    return `^${latestVersion}`;
  }

  if (currentSpec.startsWith("~")) {
    return `~${latestVersion}`;
  }

  return latestVersion;
}

function isRegistryVersionSpec(spec) {
  return !/^(?:workspace:|file:|link:|git(?:\+|:)|https?:|ssh:|github:|bitbucket:|gitlab:|npm:)/i.test(spec);
}

function requestJSON(url, timeout) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Package-Peek-Nova/1.0.0"
      },
      timeout
    }, (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error("Invalid JSON response"));
        }
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error("Request timed out"));
    });
    request.on("error", reject);
  });
}

async function fetchPackageInfo(packageName) {
  const cached = packageCache.get(packageName);

  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return cached.value;
  }

  const encodedName = encodeURIComponent(packageName);
  const metadataURL = `https://registry.npmjs.org/${encodedName}/latest`;
  const downloadsURL = `https://api.npmjs.org/downloads/point/last-week/${encodedName}`;
  const [metadataResult, downloadsResult] = await Promise.allSettled([
    requestJSON(metadataURL, 7000),
    requestJSON(downloadsURL, 2500)
  ]);

  if (metadataResult.status === "rejected") {
    throw metadataResult.reason;
  }

  const metadata = metadataResult.value;
  const value = {
    name: metadata.name || packageName,
    version: metadata.version,
    description: metadata.description,
    deprecated: metadata.deprecated,
    license: typeof metadata.license === "string" ? metadata.license : null,
    homepage: metadata.homepage,
    repository: repositoryURL(metadata.repository),
    node: metadata.engines && metadata.engines.node,
    maintainer: firstMaintainer(metadata.maintainers),
    downloads: downloadsResult.status === "fulfilled"
      ? downloadsResult.value.downloads
      : null
  };

  if (typeof value.version !== "string") {
    throw new Error("npm registry response did not include a version");
  }

  packageCache.set(packageName, {
    time: Date.now(),
    value
  });

  return value;
}

function repositoryURL(repository) {
  if (!repository) {
    return null;
  }

  let value = typeof repository === "string" ? repository : repository.url;

  if (!value) {
    return null;
  }

  value = value.replace(/^git\+/, "").replace(/\.git$/, "");

  if (/^git@github\.com:/.test(value)) {
    value = value.replace(/^git@github\.com:/, "https://github.com/");
  }

  return /^https?:\/\//.test(value) ? value : null;
}

function firstMaintainer(maintainers) {
  if (!Array.isArray(maintainers) || maintainers.length === 0) {
    return null;
  }

  const maintainer = maintainers[0];

  if (typeof maintainer === "string") {
    return maintainer;
  }

  return maintainer && (maintainer.name || maintainer.email) || null;
}

function escapeMarkdown(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/([`*_[\]<>])/g, "\\$1")
    .replace(/\r?\n/g, " ");
}

function validHTTPURL(value) {
  return typeof value === "string" && /^https?:\/\//.test(value);
}

function markdownURL(value) {
  return encodeURI(value)
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function buildHoverMarkdown(dependency, info) {
  const lines = [
    `### ${escapeMarkdown(info.name)}`,
    "",
    `**Latest:** \`${escapeMarkdown(info.version)}\`  `,
    `**package.json:** \`${escapeMarkdown(dependency.spec)}\` in \`${dependency.section}\``
  ];

  if (info.deprecated) {
    lines.push("", `> **Deprecated:** ${escapeMarkdown(info.deprecated)}`);
  }

  if (info.description) {
    lines.push("", escapeMarkdown(info.description));
  }

  const details = [];

  if (Number.isFinite(info.downloads)) {
    details.push(`**Downloads last week:** ${info.downloads.toLocaleString("en-US")}`);
  }

  if (info.license) {
    details.push(`**License:** ${escapeMarkdown(info.license)}`);
  }

  if (info.node) {
    details.push(`**Node:** \`${escapeMarkdown(info.node)}\``);
  }

  if (info.maintainer) {
    details.push(`**Maintainer:** ${escapeMarkdown(info.maintainer)}`);
  }

  if (details.length > 0) {
    lines.push("", details.join(" · "));
  }

  const links = [];

  if (validHTTPURL(info.homepage)) {
    links.push(`[Homepage](${markdownURL(info.homepage)})`);
  }

  if (validHTTPURL(info.repository)) {
    links.push(`[Repository](${markdownURL(info.repository)})`);
  }

  links.push(`[npm](https://www.npmjs.com/package/${encodeURIComponent(info.name)})`);
  lines.push("", links.join(" · "));

  if (isRegistryVersionSpec(dependency.spec)) {
    lines.push(
      "",
      "_To update: use the code-action lightbulb or Editor → Update Package Under Cursor to Latest._"
    );
  }

  return lines.join("\n");
}

async function hoverForDocument(uri, position) {
  const text = documents.get(uri);

  if (typeof text !== "string" || !/\/package\.json(?:$|[?#])/.test(uri)) {
    return null;
  }

  const dependency = dependencyAtPosition(text, position);

  if (!dependency) {
    return null;
  }

  try {
    const info = await fetchPackageInfo(dependency.name);
    return {
      contents: {
        kind: "markdown",
        value: buildHoverMarkdown(dependency, info)
      },
      range: dependency.range
    };
  } catch (error) {
    return {
      contents: {
        kind: "markdown",
        value: `### ${escapeMarkdown(dependency.name)}\n\nCould not load npm information: ${escapeMarkdown(error.message)}`
      },
      range: dependency.range
    };
  }
}

async function codeActionsForDocument(uri, range) {
  const text = documents.get(uri);

  if (typeof text !== "string" || !/\/package\.json(?:$|[?#])/.test(uri)) {
    return [];
  }

  const dependency = dependencyAtPosition(text, range.start);

  if (!dependency || !isRegistryVersionSpec(dependency.spec)) {
    return [];
  }

  try {
    const info = await fetchPackageInfo(dependency.name);
    const replacement = updatedSpec(dependency.spec, info.version);

    if (replacement === dependency.spec) {
      return [];
    }

    return [
      {
        title: `Update ${dependency.name} to ${replacement}`,
        kind: "quickfix",
        edit: {
          changes: {
            [uri]: [
              {
                range: dependency.versionRange,
                newText: replacement
              }
            ]
          }
        }
      }
    ];
  } catch (error) {
    return [];
  }
}

function send(message) {
  const body = JSON.stringify(message);
  const length = Buffer.byteLength(body, "utf8");
  process.stdout.write(`Content-Length: ${length}\r\n\r\n${body}`);
}

async function handleMessage(message) {
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        capabilities: {
          textDocumentSync: {
            openClose: true,
            change: 1
          },
          hoverProvider: true,
          codeActionProvider: true
        },
        serverInfo: {
          name: "Package Peek",
          version: "1.0.0"
        }
      }
    });
    return;
  }

  if (message.method === "shutdown") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: null
    });
    return;
  }

  if (message.method === "exit") {
    process.exit(0);
  }

  if (message.method === "textDocument/didOpen") {
    documents.set(
      message.params.textDocument.uri,
      message.params.textDocument.text
    );
    return;
  }

  if (message.method === "textDocument/didChange") {
    const changes = message.params.contentChanges;

    if (changes.length > 0) {
      documents.set(
        message.params.textDocument.uri,
        changes[changes.length - 1].text
      );
    }
    return;
  }

  if (message.method === "textDocument/didClose") {
    documents.delete(message.params.textDocument.uri);
    return;
  }

  if (message.method === "textDocument/hover") {
    const result = await hoverForDocument(
      message.params.textDocument.uri,
      message.params.position
    );
    send({
      jsonrpc: "2.0",
      id: message.id,
      result
    });
    return;
  }

  if (message.method === "textDocument/codeAction") {
    const result = await codeActionsForDocument(
      message.params.textDocument.uri,
      message.params.range
    );
    send({
      jsonrpc: "2.0",
      id: message.id,
      result
    });
    return;
  }

  if (Object.prototype.hasOwnProperty.call(message, "id")) {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: null
    });
  }
}

function startServer() {
  let input = Buffer.alloc(0);

  process.stdin.on("data", (chunk) => {
    input = Buffer.concat([input, chunk]);

    while (true) {
      const headerEnd = input.indexOf("\r\n\r\n");

      if (headerEnd < 0) {
        break;
      }

      const headers = input.slice(0, headerEnd).toString("ascii");
      const lengthMatch = /Content-Length:\s*(\d+)/i.exec(headers);

      if (!lengthMatch) {
        input = Buffer.alloc(0);
        break;
      }

      const contentLength = Number(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;

      if (input.length < bodyEnd) {
        break;
      }

      const body = input.slice(bodyStart, bodyEnd).toString("utf8");
      input = input.slice(bodyEnd);

      try {
        const message = JSON.parse(body);
        Promise.resolve(handleMessage(message)).catch((error) => {
          if (Object.prototype.hasOwnProperty.call(message, "id")) {
            send({
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32603,
                message: error.message
              }
            });
          }
        });
      } catch (error) {
        process.stderr.write(`Package Peek protocol error: ${error.message}\n`);
      }
    }
  });
}

module.exports = {
  buildHoverMarkdown,
  dependencyAtPosition,
  isRegistryVersionSpec,
  updatedSpec
};

if (require.main === module) {
  startServer();
}
