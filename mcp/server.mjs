import sdk from "./vendor/sdk.cjs";
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

const id = z.string().regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, "Expected a UUID");
const tools = {
  list_applications: {
    title: "List applications and pinned baselines",
    description: "Discover application environments and pinned baselines in this workspace. A pin includes its baseline ID and source run ID. Unpinned run history is available in the AugmentWorks dashboard.",
    inputSchema: z.strictObject({}),
  },
  get_run_report: {
    title: "Read a hosted run report",
    description: "Get the saved run's execution status, evaluation outcome, coverage, and failed requirement IDs. Pending evaluations can have a null outcome.",
    inputSchema: z.strictObject({ run_id: id.describe("Hosted run UUID") }),
  },
  compare_runs: {
    title: "Compare hosted runs",
    description: "Compare a saved candidate to a pinned baseline or earlier run. Supply exactly one baseline selector. Inspect comparability and coverage before interpreting changed checks.",
    inputSchema: z.strictObject({
      candidate_run_id: id.describe("Hosted candidate run UUID"),
      baseline_id: id.optional().describe("Pinned baseline UUID"),
      baseline_run_id: id.optional().describe("Earlier hosted run UUID"),
    }).refine(
      input => Boolean(input.baseline_id) !== Boolean(input.baseline_run_id),
      "Supply exactly one of baseline_id or baseline_run_id",
    ),
  },
};

for (const [name, tool] of Object.entries(tools)) {
  server.registerTool(name, {
    ...tool,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (args, { signal }) => {
    const result = await callWorkspaceTool(name, args, { signal });
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  });
}

await server.connect(new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 256 * 1024 }));
