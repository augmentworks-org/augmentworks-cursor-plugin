import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { startAuthorization, UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function readConfig(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

async function defaultProfile() {
  const config = await readConfig("../mcp.json");
  return config.mcpServers.workspace;
}

test("the default connection preserves its identity and requires only browser OAuth", async () => {
  const config = await readConfig("../mcp.json");
  assert.deepEqual(config, {
    mcpServers: {
      workspace: {
        url: "https://augmentworks.ai/mcp",
        auth: { CLIENT_ID: "augmentworks-cursor", scopes: ["mcp:read"] },
      },
    },
  });
  assert.doesNotMatch(JSON.stringify(config), /API_KEY|CLIENT_SECRET|Authorization|\$\{env:|command|stdio/);
});

test("the staging profile remains an explicit public read-only OAuth alternative", async () => {
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

test("the API-key adapter is a separate opt-in profile with an explicit installed root", async () => {
  const config = await readConfig("../examples/api-key-mcp.json");
  assert.deepEqual(config, {
    mcpServers: {
      "augmentworks-api-key": {
        type: "stdio",
        command: "node",
        args: ["${env:AUGMENTWORKS_PLUGIN_ROOT}/mcp/server.mjs"],
        env: { AUGMENTWORKS_API_KEY: "${env:AUGMENTWORKS_API_KEY}" },
      },
    },
  });
});

for (const redirectUrl of [
  "http://localhost:8787/callback",
  "https://www.cursor.com/agents/mcp/oauth/callback",
]) {
  test(`the default profile carries its resource, read scope and PKCE to ${redirectUrl}`, async () => {
    const profile = await defaultProfile();
    const issuer = new URL(profile.url).origin;
    const { authorizationUrl, codeVerifier } = await startAuthorization(issuer, {
      metadata: {
        authorization_endpoint: issuer + "/oauth/mcp/authorize",
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
      },
      clientInformation: { client_id: profile.auth.CLIENT_ID },
      resource: new URL(profile.url),
      scope: profile.auth.scopes.join(" "),
      redirectUrl,
      state: "fixture-state",
    });
    const params = authorizationUrl.searchParams;
    assert.equal(params.get("client_id"), "augmentworks-cursor");
    assert.equal(params.get("resource"), profile.url);
    assert.equal(params.get("scope"), "mcp:read");
    assert.equal(params.get("redirect_uri"), redirectUrl);
    assert.equal(params.get("state"), "fixture-state");
    assert.equal(params.get("response_type"), "code");
    assert.equal(params.get("code_challenge_method"), "S256");
    assert.equal(params.get("code_challenge"), createHash("sha256").update(codeVerifier).digest("base64url"));
  });
}

// This exercises the SDK with the actual shipped profile and deterministic
// discovery/token/MCP fixtures. It does not claim a live Cursor or provider run.
async function oauthFixture({ disabled = false } = {}) {
  const profile = await defaultProfile();
  const issuer = new URL(profile.url).origin;
  const resourceMetadata = issuer + "/.well-known/oauth-protected-resource/mcp";
  const authorizationEndpoint = issuer + "/oauth/mcp/authorize";
  const tokenEndpoint = issuer + "/oauth/mcp/token";
  const redirects = [];
  const requests = [];
  let verifier;
  let tokens;
  let rejectToken = false;
  const provider = {
    redirectUrl: "http://localhost:8787/callback",
    clientMetadata: {
      redirect_uris: ["http://localhost:8787/callback"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: profile.auth.scopes.join(" "),
    },
    clientInformation: () => ({ client_id: profile.auth.CLIENT_ID, issuer }),
    tokens: () => tokens,
    saveTokens: (value) => { tokens = value; },
    redirectToAuthorization: (url) => { redirects.push(url); },
    saveCodeVerifier: (value) => { verifier = value; },
    codeVerifier: () => verifier,
    state: () => "fixture-state",
  };
  const fetch = async (input, init) => {
    const req = new Request(input, init);
    const body = await req.text();
    requests.push({ url: req.url, method: req.method, authorization: req.headers.get("authorization"), body });
    assert.ok(req.url.startsWith(issuer + "/"), "all requests stay on the selected platform");
    assert.equal(req.headers.get("api_key"), null);
    if (disabled) return new Response(null, { status: 404 });
    if (req.url === resourceMetadata) {
      return Response.json({ resource: profile.url, authorization_servers: [issuer], scopes_supported: ["mcp:read"], bearer_methods_supported: ["header"] });
    }
    if (req.url === issuer + "/.well-known/oauth-authorization-server") {
      return Response.json({
        issuer, authorization_endpoint: authorizationEndpoint, token_endpoint: tokenEndpoint,
        response_types_supported: ["code"], grant_types_supported: ["authorization_code"],
        token_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"], scopes_supported: ["mcp:read"],
      });
    }
    if (req.url === tokenEndpoint) {
      const params = new URLSearchParams(body);
      assert.equal(req.method, "POST");
      assert.equal(params.get("code"), "fixture-code");
      assert.equal(params.get("client_id"), profile.auth.CLIENT_ID);
      assert.equal(params.get("redirect_uri"), provider.redirectUrl);
      assert.equal(params.get("resource"), profile.url);
      assert.equal(params.get("code_verifier"), verifier);
      assert.equal(params.get("client_secret"), null);
      assert.equal(req.headers.get("authorization"), null);
      return Response.json({ access_token: "fixture-oauth-token", token_type: "Bearer", expires_in: 3600, scope: "mcp:read" });
    }
    assert.equal(req.url, profile.url, "no unknown endpoints or CLI-auth fallbacks");
    if (req.headers.get("authorization") !== "Bearer fixture-oauth-token" || rejectToken) {
      return new Response(null, { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}", scope="mcp:read"` } });
    }
    if (req.method === "GET") return new Response(null, { status: 405 });
    const message = JSON.parse(body);
    if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
    let result;
    if (message.method === "initialize") {
      result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "augmentworks-fixture", version: "1.0.0" } };
    } else {
      assert.equal(message.method, "tools/call");
      assert.equal(message.params.name, "list_applications");
      result = { content: [{ type: "text", text: JSON.stringify({ applications: [], baselines: [] }) }] };
    }
    return Response.json({ jsonrpc: "2.0", id: message.id, result });
  };
  return {
    profile, provider, fetch, redirects, requests,
    transport: () => new StreamableHTTPClientTransport(new URL(profile.url), { authProvider: provider, fetch }),
    revoke: () => { rejectToken = true; },
  };
}

test("one browser authorization resumes MCP reads without an API key or CLI login", async (t) => {
  const fixture = await oauthFixture();
  const initial = new Client({ name: "cursor-profile-fixture", version: "1.0.0" });
  const initialTransport = fixture.transport();
  t.after(() => initial.close());
  await assert.rejects(initial.connect(initialTransport), UnauthorizedError);
  assert.equal(fixture.redirects.length, 1);
  assert.equal(fixture.redirects[0].searchParams.get("scope"), "mcp:read");
  assert.equal(fixture.redirects[0].searchParams.get("resource"), fixture.profile.url);
  await initialTransport.finishAuth("fixture-code");

  const resumed = new Client({ name: "cursor-profile-fixture", version: "1.0.0" });
  t.after(() => resumed.close());
  await resumed.connect(fixture.transport());
  const result = await resumed.callTool({ name: "list_applications", arguments: {} });
  assert.deepEqual(JSON.parse(result.content[0].text), { applications: [], baselines: [] });
  assert.equal(fixture.redirects.length, 1);
  assert.equal(fixture.requests.filter((request) => request.url.endsWith("/oauth/mcp/token")).length, 1);
  assert.doesNotMatch(JSON.stringify(fixture.requests), /aw_api_|\/cli\/|API_KEY|client_secret/);

  fixture.revoke();
  await assert.rejects(resumed.callTool({ name: "list_applications", arguments: {} }), UnauthorizedError);
  assert.equal(fixture.redirects.length, 2, "revoked access returns to browser authorization");
});

test("a disabled remote endpoint fails without pretending CLI or API-key login succeeded", async (t) => {
  const fixture = await oauthFixture({ disabled: true });
  const client = new Client({ name: "cursor-profile-fixture", version: "1.0.0" });
  t.after(() => client.close());
  await assert.rejects(client.connect(fixture.transport()), (error) => error.code === 404);
  assert.equal(fixture.redirects.length, 0);
  assert.deepEqual(fixture.requests.map(({ url, authorization }) => ({ url, authorization })), [{ url: fixture.profile.url, authorization: null }]);
});
