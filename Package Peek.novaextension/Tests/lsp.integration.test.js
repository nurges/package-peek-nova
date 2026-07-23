"use strict";

const assert = require("assert");
const path = require("path");
const { spawn } = require("child_process");

const server = spawn(process.execPath, [
  path.join(__dirname, "..", "Scripts", "server.js")
], {
  stdio: ["pipe", "pipe", "inherit"]
});

let input = Buffer.alloc(0);
const pending = new Map();

server.stdout.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);

  while (true) {
    const headerEnd = input.indexOf("\r\n\r\n");

    if (headerEnd < 0) {
      return;
    }

    const headers = input.slice(0, headerEnd).toString("ascii");
    const match = /Content-Length:\s*(\d+)/i.exec(headers);
    assert(match);

    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + Number(match[1]);

    if (input.length < bodyEnd) {
      return;
    }

    const message = JSON.parse(input.slice(bodyStart, bodyEnd).toString("utf8"));
    input = input.slice(bodyEnd);

    if (pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  }
});

function send(message) {
  const body = JSON.stringify(message);
  server.stdin.write(
    `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`
  );
}

function request(id, method, params) {
  return new Promise((resolve) => {
    pending.set(id, resolve);
    send({
      jsonrpc: "2.0",
      id,
      method,
      params
    });
  });
}

async function run() {
  const timeout = setTimeout(() => {
    server.kill();
    throw new Error("Language server integration test timed out");
  }, 15000);

  const initialized = await request(1, "initialize", {
    capabilities: {}
  });

  assert.strictEqual(initialized.result.capabilities.hoverProvider, true);
  assert.strictEqual(initialized.result.capabilities.codeActionProvider, true);

  const text = [
    "{",
    "  \"dependencies\": {",
    "    \"react\": \"^18.2.0\"",
    "  }",
    "}"
  ].join("\n");
  const uri = "file:///tmp/package.json";

  send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: "json",
        version: 1,
        text
      }
    }
  });

  const hover = await request(2, "textDocument/hover", {
    textDocument: { uri },
    position: {
      line: 2,
      character: 8
    }
  });

  assert(hover.result);
  assert(hover.result.contents.value.includes("**Latest:**"));
  assert(hover.result.contents.value.includes("**package.json:** `^18.2.0`"));

  const actions = await request(3, "textDocument/codeAction", {
    textDocument: { uri },
    range: {
      start: {
        line: 2,
        character: 8
      },
      end: {
        line: 2,
        character: 8
      }
    },
    context: {
      diagnostics: []
    }
  });

  assert.strictEqual(actions.result.length, 1);
  assert(actions.result[0].title.startsWith("Update react to ^"));

  await request(4, "shutdown", null);
  send({
    jsonrpc: "2.0",
    method: "exit"
  });

  clearTimeout(timeout);
  console.log("Package Peek LSP integration test passed.");
}

run().catch((error) => {
  server.kill();
  console.error(error);
  process.exitCode = 1;
});
