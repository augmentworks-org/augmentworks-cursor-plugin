# AugmentWorks for Cursor

Test the HTTP agent you’re building, see which policy check failed, and run the same check after a fix. Start with `/augmentworks-demo` to watch a refund agent issue an $80 refund against a $50 limit. The test checks what happened to the order, so a reassuring chatbot reply can't hide the bug.

## Install and try it

You need Cursor, Git, and Node.js **22.12 or newer** with npm. Clone the plugin into Cursor’s local plugin directory. While the repository is private, use a GitHub account with access.

```sh
git clone https://github.com/augmentworks-org/augmentworks-cursor-plugin.git ~/.cursor/plugins/local/augmentworks
```

On Windows PowerShell, use `"$HOME/.cursor/plugins/local/augmentworks"` as the clone destination. In Cursor, run **Developer: Reload Window** from the Command Palette. Open **Customize** and look for **AugmentWorks**. Open a project, then type `/augmentworks-demo` in Agent chat. Choose the matching command from the slash menu.

Cursor runs the published `@augmentworks/cli@0.4.2` through `npx`. The first run needs access to npm. The demo then runs entirely on loopback, needs no account or model key, and writes its reports under the open project’s `.augmentworks/demo/` directory. A successful demo shows the original failure and the corrected result.

## Use it on your agent

| Cursor command | What it does |
| --- | --- |
| `/augmentworks-demo` | Tests both versions of the example refund agent and identifies the check that changed. |
| `/augmentworks-setup` | Configures a response-only chatbot or a stateful workflow and checks the configuration with the CLI’s network-free doctor. |
| `/augmentworks-test` | Runs a local packet against your authorized target. Shows the failing checks and where to open the HTML report. |
| `/augmentworks-compare` | Compares two saved local JSON reports by scenario, repetition, and check. Flags differences in coverage or configuration that affect interpretation. |
| `/augmentworks-hosted` | Quotes a hosted AugmentWorks assessment. Starting a hosted run requires an approved target and credit ceiling. |

For a first test, open the project that owns the HTTP endpoint, run `/augmentworks-setup`, and tell Cursor which endpoint receives messages and which JSON field contains the answer. Keep target credentials in your local environment. For a response-only bot, the bundled packet asks about a fictional store’s return window and checks for the literal phrase “30 days.” Change the question and expected phrase to match one of your own policies. For a workflow agent, configure the operations and observations required by its packet.

Run `/augmentworks-test` and keep the path to `report.json`. After you fix the agent, run the **same packet** again. Check that your environment variables still select the intended endpoint. The reports identify the declared config, so two different deployments can share a fingerprint. Give the two paths to `/augmentworks-compare`, baseline first. The local runner also writes `report.html` and `junit.xml`. Treat these files as private since they can contain conversations and observed application state. The plugin’s report helper returns check IDs and outcomes without printing those transcripts.

Local tests call the agent configured in your project, which may incur costs at your own providers. They use no AugmentWorks credits. If you want a shared dashboard and hosted grading, use `/augmentworks-hosted` from a signed-in workspace. [AugmentWorks agent setup](https://augmentworks.ai/docs/agent-setup) · [Local quickstart](https://augmentworks.ai/docs/local-quickstart) · [Hosted quickstart](https://augmentworks.ai/docs/quickstart)

## Connect your AugmentWorks workspace with MCP

The plugin includes a read-only MCP server for shared, hosted results. Cursor launches it as a local Node process and it calls the existing AugmentWorks HTTPS API. The server and its runtime ship in the checkout. Installing a separate service or running a build is unnecessary. Keep using the slash commands above for local JSON reports and for starting a hosted assessment.

1. If you already installed the plugin, update your checkout with `git -C ~/.cursor/plugins/local/augmentworks pull --ff-only`.
2. In [workspace API keys](https://augmentworks.ai/portal/settings/api-keys), create a key with the **Report inspection** preset for the workspace you want to read.
3. Make that key available to the **Cursor application process** as `AUGMENTWORKS_API_KEY`. On macOS or Linux, you can fully quit Cursor, open Bash, and run the following in your project. The first line prompts without echoing the key or recording it in shell history.

   ```bash
   read -rsp 'AugmentWorks workspace key: ' AUGMENTWORKS_API_KEY && echo
   export AUGMENTWORKS_API_KEY
   cursor .
   ```

   You can also inject the variable with your usual local secret manager. Keep the key out of agent chat, Git, and project config. If you set the variable in Cursor’s integrated terminal, restart Cursor from the environment that holds it so the MCP process receives it.
4. In Cursor’s MCP settings, enable the plugin’s **workspace** server if prompted. Open Agent chat and ask **“List my AugmentWorks applications and pinned baselines.”** An empty list is valid for a workspace without entries.

| MCP tool | What you can ask |
| --- | --- |
| `list_applications` | “Which applications, environments and baselines are saved in this workspace?” Each pin includes its source run ID. |
| `get_run_report` | “Show me the outcome, coverage and known failed checks for run `<run UUID>`.” Pending results stay pending. Older reports can omit failure IDs. |
| `compare_runs` | “Compare candidate `<run UUID>` with baseline `<baseline UUID>`. Which required checks regressed?” You can also supply an earlier run UUID as the baseline. |

Find an unpinned candidate’s UUID in the [runs dashboard](https://augmentworks.ai/portal/runs) or the CLI’s hosted-run output. The hosted API exposes pinned baselines through discovery. It has no endpoint for listing every recent run. The tools return summaries and identifiers, omit transcripts, and use no assessment credits. For report and comparison details beyond the summary, open the saved run in the dashboard.

Other stdio-capable MCP clients can launch `node` with the absolute path to `mcp/server.mjs` and supply the same environment variable. [Cursor MCP configuration](https://cursor.com/docs/mcp)

## Verify a checkout

```sh
npm ci --ignore-scripts
npm run check:mcp
npm test
```

The MCP tests use the official SDK client to launch the server and exercise its tools against hosted API fixtures without credentials. After updating a runtime dependency, run `npm run build:mcp` and commit the regenerated SDK bundle and third-party notices. CI verifies reproducibility. To run just the MCP tests, use `npm run test:mcp`.

The regression tests check plugin discovery files, inspect and compare local reports, and exercise the published CLI against two loopback agents. They cover a refund-policy violation and a response-only FAQ that changes from failing to passing. The tests use temporary project directories and require no AugmentWorks credentials. To run only those end-to-end cases, use `npm run test:e2e`.

If the commands do not appear, check that `.cursor-plugin/plugin.json` sits directly inside the cloned plugin directory, reload the window, and check **Customize** again. Use a real checkout in that directory. Enterprise workspaces also need **Allow Local Plugin Imports** enabled. [Cursor plugin installation](https://cursor.com/docs/plugins)

[Apache 2.0 license](LICENSE)
