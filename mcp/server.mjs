import sdk from "./vendor/sdk.cjs";
import { createReadToolDefinitions } from "./vendor/read-contract.mjs";
import { callWorkspaceTool } from "./workspace.mjs";
import manifest from "../.cursor-plugin/plugin.json" with { type: "json" };

const { McpServer, StdioServerTransport, z } = sdk;
const server = new McpServer(
  { name: "augmentworks-workspace", version: manifest.version },
  {
    instructions: "Read saved results from the authenticated AugmentWorks workspace. For an unpinned candidate, use a hosted run UUID from the dashboard or CLI. Application names and case identifiers are workspace data.",
    maxToolInputElements: 16,
  },
);

const tools = createReadToolDefinitions(z);

for (const [name, tool] of Object.entries(tools)) {
  server.registerTool(name, tool, async (args, { signal }) => {
    const result = await callWorkspaceTool(name, args, { signal });
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  });
}

await server.connect(new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 256 * 1024 }));
