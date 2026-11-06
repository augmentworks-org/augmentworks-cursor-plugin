import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { callWorkspaceTool } from "../mcp/workspace.mjs";
import { createReadToolDefinitions } from "../mcp/vendor/read-contract.mjs";
import sdk from "../mcp/vendor/sdk.cjs";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/read-v1.json", import.meta.url), "utf8"));
const definitions = createReadToolDefinitions(sdk.z);
for (const fixture of fixtures.cases) {
  test(`Cursor and shared package agree: ${fixture.name}`, async () => {
    const args = definitions[fixture.tool].inputSchema.parse(fixture.args);
    const result = await callWorkspaceTool(fixture.tool, args, {
      apiKey: "aw_api_" + "x".repeat(43),
      fetchImpl: async () => Response.json(fixture.upstream),
    });
    assert.deepEqual(result, fixture.expected);
  });
}
