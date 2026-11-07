import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { startAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";

async function readConfig(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

test("installing the plugin still registers only the bundled workspace server", async () => {
  const config = await readConfig("../mcp.json");
  assert.deepEqual(Object.keys(config.mcpServers), ["workspace"]);
  assert.equal(config.mcpServers.workspace.type, "stdio");
});

test("the opt-in profile contains one public read-only OAuth client", async () => {
  const config = await readConfig("../examples/hosted-mcp.json");
  assert.deepEqual(config, {
    mcpServers: {
      "augmentworks-staging": {
        url: "${env:AUGMENTWORKS_MCP_URL}",
        auth: { CLIENT_ID: "augmentworks-cursor", scopes: ["mcp:read"] },
      },
    },
  });
});

test("the SDK carries the selected resource and read scope into the desktop authorization request", async () => {
  const config = await readConfig("../examples/hosted-mcp.json");
  const profile = config.mcpServers["augmentworks-staging"];
  const stagingResource = "https://mcp.example.test/mcp";
  const issuer = "https://portal.example.test";
  const { authorizationUrl } = await startAuthorization(issuer, {
    metadata: {
      authorization_endpoint: issuer + "/oauth/mcp/authorize",
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
    },
    clientInformation: { client_id: profile.auth.CLIENT_ID },
    resource: new URL(profile.url.replace("${env:AUGMENTWORKS_MCP_URL}", stagingResource)),
    scope: profile.auth.scopes.join(" "),
    redirectUrl: "http://localhost:8787/callback",
    state: "fixture-state",
  });
  const params = authorizationUrl.searchParams;
  assert.equal(params.get("client_id"), "augmentworks-cursor");
  assert.equal(params.get("resource"), stagingResource);
  assert.equal(params.get("scope"), "mcp:read");
  assert.equal(params.get("redirect_uri"), "http://localhost:8787/callback");
  assert.equal(params.get("response_type"), "code");
  assert.equal(params.get("code_challenge_method"), "S256");
  assert.match(params.get("code_challenge") ?? "", /^[\w-]{43}$/);
});
