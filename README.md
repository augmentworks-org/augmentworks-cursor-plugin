# AugmentWorks for Cursor

Connect your AugmentWorks workspace through browser sign-in, then inspect saved reports and compare runs in Cursor chat. The plugin also includes local HTTP-agent testing: `/augmentworks-demo` shows a refund agent issuing an $80 refund against a $50 limit, then verifies the correction.

## Install and try it

You need Cursor and Git to install the plugin. Local demo and test commands also require Node.js **22.12 or newer** with npm; the default remote MCP connection does not launch a local Node process. Clone the plugin into Cursor’s local plugin directory. While the repository is private, use a GitHub account with access.

```sh
git clone https://github.com/augmentworks-org/augmentworks-cursor-plugin.git ~/.cursor/plugins/local/augmentworks
```

On Windows PowerShell, use `"$HOME/.cursor/plugins/local/augmentworks"` as the clone destination. In Cursor, run **Developer: Reload Window** from the Command Palette. Open **Customize** and look for **AugmentWorks**. To connect your workspace, follow [browser sign-in](#connect-your-workspace-with-browser-sign-in) below or select `/augmentworks-connect` in Agent chat. To try local testing without an account, open a project and select `/augmentworks-demo` from the slash menu.

Cursor runs the published `@augmentworks/cli@0.4.2` through `npx`. The first run needs access to npm. The demo then runs entirely on loopback, needs no account or model key, and writes its reports under the open project’s `.augmentworks/demo/` directory. A successful demo shows the original failure and the corrected result.

## Use it on your agent

| Cursor command | What it does |
| --- | --- |
| `/augmentworks-connect` | Guides you through Cursor’s browser sign-in and verifies access to saved workspace results. |
| `/augmentworks-demo` | Tests both versions of the example refund agent and identifies the check that changed. |
| `/augmentworks-setup` | Connects your workspace by default, or configures local tests when you specify an HTTP target. |
| `/augmentworks-test` | Runs a local packet against your authorized target. Shows the failing checks and where to open the HTML report. |
| `/augmentworks-compare` | Compares two saved local JSON reports by scenario, repetition, and check. Flags differences in coverage or configuration that affect interpretation. |
| `/augmentworks-hosted` | Uses the separate CLI workflow to quote and run a hosted assessment with an approved target and credit ceiling. MCP execution is not available yet. |

For a first test, open the project that owns the HTTP endpoint, run `/augmentworks-setup`, and tell Cursor which endpoint receives messages and which JSON field contains the answer. Keep target credentials in your local environment. For a response-only bot, the bundled packet asks about a fictional store’s return window and checks for the literal phrase “30 days.” Change the question and expected phrase to match one of your own policies. For a workflow agent, configure the operations and observations required by its packet.

Run `/augmentworks-test` and keep the path to `report.json`. After you fix the agent, run the **same packet** again. Check that your environment variables still select the intended endpoint. The reports identify the declared config, so two different deployments can share a fingerprint. Give the two paths to `/augmentworks-compare`, baseline first. The local runner also writes `report.html` and `junit.xml`. Treat these files as private since they can contain conversations and observed application state. The plugin’s report helper returns check IDs and outcomes without printing those transcripts.

Local tests call the agent configured in your project, which may incur costs at your own providers. They use no AugmentWorks credits. If you want a shared dashboard and hosted grading, use `/augmentworks-hosted` from a signed-in workspace. [AugmentWorks agent setup](https://augmentworks.ai/docs/agent-setup) · [Local quickstart](https://augmentworks.ai/docs/local-quickstart) · [Hosted quickstart](https://augmentworks.ai/docs/quickstart)

## Connect your workspace with browser sign-in

The plugin registers one remote **workspace** MCP connection at `https://augmentworks.ai/mcp`. Cursor manages OAuth and stores the connection credentials. You do not create an API key, set an environment variable, or sign in with the CLI for this connection.

1. Open **Customize → MCPs**, find the AugmentWorks plugin's **workspace** connection, and enable it.
2. Choose Cursor's **Authenticate** or **Connect** control (the label varies by version). Cursor opens the AugmentWorks sign-in page in your browser.
3. Sign in, choose the workspace you want Cursor to access, and select **Allow read access**. The callback returns you to Cursor; use **Return to Cursor** if the browser shows that link.
4. In Agent chat, ask **“List my AugmentWorks applications and pinned baselines.”** The connection is verified when `list_applications` succeeds. A successful empty list is valid for a workspace without applications.

`/augmentworks-connect` guides you through the same flow. A website or CLI message saying “auth succeeded” does not by itself verify MCP access. Saved-result reads continue through MCP in chat; the agent never needs your OAuth token or API key.

The hosted MCP service must be enabled by the AugmentWorks deployment operator. If it returns 404 or no authentication control appears, the service is unavailable or misconfigured. Creating an API key or running CLI login will not repair that connection. See [deployment readiness](#deployment-readiness) for the operator checks.

The current OAuth grant lasts one hour and does not include a refresh token. Cursor will ask you to sign in again after expiry. To revoke access, open [MCP connections](https://augmentworks.ai/portal/mcp/grants) in AugmentWorks. Signing back in lets you choose a different workspace.

### What you can do after sign-in

| MCP tool | What you can ask |
| --- | --- |
| `list_applications` | “Which applications, environments and baselines are saved in this workspace?” Each pin includes its source run ID. |
| `get_run_report` | “Show me the outcome, coverage and known failed checks for run `<run UUID>`.” Pending results stay pending. Older reports can omit failure IDs. |
| `compare_runs` | “Compare candidate `<run UUID>` with baseline `<baseline UUID>`. Which required checks regressed?” You can also supply an earlier run UUID as the baseline. |

Find an unpinned candidate's UUID in the [runs dashboard](https://augmentworks.ai/portal/runs) or existing CLI output. The tools return summaries and identifiers, omit transcripts, and use no assessment credits. Open the saved run in the dashboard for details beyond the summary.

**Current boundary:** MCP can read saved results. It cannot quote, start or dispatch an assessment yet. `/augmentworks-hosted` remains an explicitly separate CLI workflow with its own sign-in and credit approval. Browser MCP sign-in does not sign in the CLI, and CLI sign-in does not connect MCP. Local demo/tests need neither workspace connection.

### Upgrade from 0.2.0

Version 0.2.0 registered a local **workspace** server that required `AUGMENTWORKS_API_KEY`. Version 0.3.0 replaces that same plugin entry with the remote OAuth server.

1. For the local installation shown above, update it with `git -C ~/.cursor/plugins/local/augmentworks pull --ff-only`. For a Git-imported installation, refresh that installation in Cursor.
2. Run **Developer: Reload Window**. In **Customize → MCPs**, verify the plugin's **workspace** connection uses `https://augmentworks.ai/mcp`. It should no longer run `node …/mcp/server.mjs`. If Cursor keeps the old process, fully quit and reopen the app.
3. Disable any older manually added AugmentWorks API-key or staging connections. Keep the plugin enabled and one intended AugmentWorks MCP connection active. If you previously installed both a marketplace/Git copy and a local copy, update the active copy and remove the duplicate installation through Cursor.
4. Authenticate through the remote connection, then verify with `list_applications`.

An `AUGMENTWORKS_API_KEY` error means a local API-key adapter is still being called. Check which server returned it; do not paste a key into chat or run CLI login as a workaround. Keep unrelated MCP entries and credentials unchanged. Existing API-key users who deliberately want that mode can use the optional profile below.

### Optional staging connection

Use staging only when your operator provides an enabled HTTPS MCP endpoint. A deployment behind a separate hosting-provider login cannot complete Cursor sign-in.

Disable the plugin's **workspace** MCP connection while keeping the plugin enabled. Merge only the `augmentworks-staging` entry from [examples/hosted-mcp.json](examples/hosted-mcp.json) into your personal `~/.cursor/mcp.json`, preserving other servers. Set its `url` to the operator's exact HTTPS URL ending in `/mcp`, or set `AUGMENTWORKS_MCP_URL` in the environment that launches Cursor. Keep the public client ID `augmentworks-cursor` unless the operator supplies a different registered ID. No API key or client secret belongs in the profile.

Reload, enable **augmentworks-staging**, and use its browser authentication control. Verify `list_applications` against the selected staging workspace. To return to production, disable staging before re-enabling the plugin's **workspace** connection. Revoking a staging grant uses `/portal/mcp/grants` on that staging portal.

### Optional API-key connection

This is an explicitly selected compatibility mode for users who want a local stdio server. The default plugin never enables it or falls back to it after an OAuth failure.

1. Disable the plugin's **workspace** MCP connection and other AugmentWorks entries, keeping the plugin itself enabled.
2. Create a **Report inspection** key in [workspace API keys](https://augmentworks.ai/portal/settings/api-keys).
3. Merge only the `augmentworks-api-key` entry from [examples/api-key-mcp.json](examples/api-key-mcp.json) into your personal `~/.cursor/mcp.json`, preserving other entries.
4. Provide `AUGMENTWORKS_PLUGIN_ROOT` (the absolute path to the plugin checkout) and `AUGMENTWORKS_API_KEY` to the **Cursor application process** through your secret manager or launch environment. The adapter requires Node.js 22.12+. For example, fully quit Cursor, open **Bash** in your project, then run:

   ```bash
   export AUGMENTWORKS_PLUGIN_ROOT="$HOME/.cursor/plugins/local/augmentworks"
   read -rsp 'AugmentWorks workspace key: ' AUGMENTWORKS_API_KEY && echo
   export AUGMENTWORKS_API_KEY
   cursor .
   ```

5. Enable **augmentworks-api-key** and verify `list_applications`. Disable it before switching back to browser OAuth. This profile does not use CLI login or browser OAuth credentials. Never place a key in chat, Git, or project config.

The compatibility server and runtime remain bundled at `mcp/server.mjs`; no build or separate service is needed. Other stdio clients can launch it by absolute path with the same key environment variable.

### Deployment readiness

Changing the plugin config does not activate the hosted service. Before releasing the default OAuth connection, the platform operator must:

- Confirm `20261106120001_hosted_mcp_read_grants.sql` is applied, and existing platform authentication, service database access and `IP_HASH_SALT` are configured.
- Enable `AUGMENTWORKS_HOSTED_MCP_ENABLED=true`, set `MCP_PUBLIC_ORIGIN=https://augmentworks.ai` and `MCP_PORTAL_ORIGIN=https://augmentworks.ai`, and use the registered public client ID `augmentworks-cursor` (`MCP_CURSOR_CLIENT_ID`). Deploy the reviewed configuration. GitHub App flags and GitHub migrations do not enable MCP OAuth.
- Verify anonymous `GET /mcp` returns **401** with a `WWW-Authenticate` challenge pointing to `/.well-known/oauth-protected-resource/mcp`. Both that resource metadata and `/.well-known/oauth-authorization-server` must return **200 JSON**, reference the intended origins, and advertise `mcp:read` and PKCE S256 as appropriate. A 404, hosting-provider login, or HTML response is not ready.
- Rehearse actual Cursor desktop sign-in → workspace consent → return to Cursor → `list_applications` → known report. Test denial, expiry/revocation and workspace isolation. Keep only the chosen MCP connection enabled during the rehearsal.

The registered Cursor callbacks are `http://localhost:8787/callback` and `https://www.cursor.com/agents/mcp/oauth/callback`. Cursor owns the callback listener and token storage; never use the CLI loopback flow to substitute for this verification. Automated profile and SDK tests do not prove the live endpoint is enabled or the desktop handoff succeeded.

[Cursor MCP authentication and configuration](https://cursor.com/docs/mcp) · [Managing MCP servers](https://cursor.com/docs/plugins#managing-installed-plugins)

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


### Shared MCP read contracts

The plugin bundles the read module from [the CLI repository](https://github.com/augmentworks-org/augmentworks-cli/tree/5247760ae00661e8ca2e18dd38572c69e34a03dd/packages/mcp-contracts) so installing the plugin requires no separate contracts package or build. The tool names and saved-result formats are shared with other AugmentWorks adapters. Each adapter handles its own transport and authentication.

Maintainers can check the bundle and fixtures offline with `npm run check:mcp`. CI also compares the exact bytes with the public source revision using `node scripts/check-read-contract.mjs --upstream`. To update, copy the reviewed revision's `packages/mcp-contracts/index.mjs` and `fixtures/read-v1.json` into `mcp/vendor/read-contract.mjs` and `test/fixtures/read-v1.json`. Record the CLI commit and both SHA-256 hashes in `mcp/vendor/read-contract.lock.json`, update the source link, and run both checks and `npm test`.
