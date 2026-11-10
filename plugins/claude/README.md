# AugmentWorks for Claude Code

Test an HTTP agent locally, catch a regression, and compare the evidence after a fix. Connect your AugmentWorks workspace separately to inspect saved reports from Claude Code.

This plugin targets **Claude Code 2.1.281 or newer**. Local tests require **Node.js 22.12 or newer** and npm. The browser sign-in configuration uses a local callback and does not establish support for Claude web, mobile, or Cowork.

## Install

In your terminal, add the AugmentWorks marketplace and install this plugin:

```sh
claude plugin marketplace add augmentworks-org/augmentworks-cursor-plugin
claude plugin install augmentworks@augmentworks-tools
```

Restart Claude Code after installation, or apply the reload requested by its plugin interface. Open a project and run `/augmentworks:demo`. The repository retains its original name because it distributes both Cursor and Claude Code packages. This installation selects the Claude Code package at `plugins/claude`.

To test a checkout before publication, run `claude --plugin-dir /absolute/path/to/plugins/claude` from your project directory. Do not enable both a checkout and a marketplace installation of the same plugin.

## Try the failure and correction

`/augmentworks:demo` runs the published `@augmentworks/cli@0.4.2` using `npx`. The first run downloads the package from npm. The demo then starts fictional refund agents on loopback: one issues an $80 refund against a $50 limit, and the corrected version respects the limit. It needs no AugmentWorks account or model-provider key.

The demo writes JSON, HTML, and JUnit reports under your project's `.augmentworks/demo/`. The command checks both results and cleanup, and uses the bundled report helper to identify the check that changed. The expected inner run exit codes are 10 for the failure and 0 for the correction; an error or incomplete cleanup is not a successful demo.

## Commands

| Command | Purpose |
| --- | --- |
| `/augmentworks:demo` | Run the fictional failing and corrected refund agents. |
| `/augmentworks:connect` | Sign in through Claude Code and verify access to saved workspace results. |
| `/augmentworks:setup` | Connect your workspace, or configure local tests when you specify an HTTP target. |
| `/augmentworks:test` | Run a local packet against your authorized target and inspect its failed checks. |
| `/augmentworks:compare` | Compare two local JSON reports, baseline first, while checking coverage and comparability. |
| `/augmentworks:hosted` | Quote and, with an approved credit ceiling, run a hosted assessment through the separate CLI workflow. |

The `augmentworks:augmentworks-regression` skill supplies these workflows. Local testing requires a running HTTP target, a connector configuration, and a compatible test packet. It does not automatically deploy a connected repository. Keep the packet stable when checking a fix; confirm that both runs reached the intended deployments.

For your own endpoint, open its project and use `/augmentworks:setup` with the route, request shape, and answer field. The response-only starter uses a fictional store's return policy; adapt its question and expected answer before treating it as a test of your product. Local target requests can perform actions and incur charges at your own model providers. Local tests use no AugmentWorks assessment credits.

[Local quickstart](https://augmentworks.ai/docs/local-quickstart) · [Agent setup](https://augmentworks.ai/docs/agent-setup) · [Hosted quickstart](https://augmentworks.ai/docs/quickstart)

## Connect your workspace

1. Open `/mcp` in Claude Code and select the plugin's **workspace** server (`plugin:augmentworks:workspace`).
2. Choose its authentication control. Claude Code opens AugmentWorks in your browser.
3. Sign in, select the intended workspace, and choose **Allow read access**. The callback returns to Claude Code on `http://localhost:8788/callback`.
4. Ask **“List my AugmentWorks applications and pinned baselines.”** Connection is verified only after `list_applications` succeeds. An empty list is valid.

Claude Code owns the OAuth exchange and credential storage. No API key or client secret is required. The public client ID is `augmentworks-claude-code`; the fixed callback port is 8788. If another process occupies that port, resolve that conflict and retry. Do not change the callback unless the deployment operator also registers it.

The current grant lasts one hour and has no refresh token. Use `/mcp` to sign in again after expiry. Revoke access under [MCP connections](https://augmentworks.ai/portal/mcp/grants). Signing in again lets you choose another workspace.

The service must be deployed with the Claude Code client registered. An unknown-client error, redirect mismatch, 404, or unavailable discovery endpoint is a configuration problem, not a reason to create an API key. A website or CLI message saying “auth succeeded” does not establish an MCP connection. Keep one intended AugmentWorks MCP connection active; tools requiring `AUGMENTWORKS_API_KEY` belong to a different adapter.

### Saved-result tools

| Tool | Reads |
| --- | --- |
| `list_applications` | Application/environment names and pinned baselines, including source run IDs. |
| `get_run_report` | A known run's status, coverage, and available failed-check summary. |
| `compare_runs` | A candidate run compared with a saved baseline or earlier run. |

These tools read saved results and spend no assessment credits. They omit transcripts from their summaries; pending judgments remain pending. Find an unpinned run's UUID in the [runs dashboard](https://augmentworks.ai/portal/runs) or prior CLI output.

**MCP cannot quote, start, or dispatch an assessment.** `/augmentworks:hosted` uses a separate CLI sign-in, target authorization, and numeric credit ceiling. MCP browser sign-in does not sign in the CLI, and CLI sign-in does not connect MCP. The local demo needs neither connection.

## What runs and where data goes

- **Installation:** Claude Code fetches this plugin from GitHub. The package contains instructions, a remote MCP configuration, a local report helper, a sample packet, and the license/icon. It has no install hooks or local MCP server and no package install on plugin load.
- **Local commands:** the first `npx --yes @augmentworks/cli@0.4.2` invocation may download the CLI and its dependencies from npm. Demo agents run on loopback. Tests of your agent send the configured test requests to the endpoint you selected, which may use other providers. Local reports stay in your project unless you choose another workflow or share them.
- **Report inspection:** the bundled Node.js helper reads the report files you identify and prints check IDs and outcomes rather than transcripts. Its output enters the Claude Code conversation and is therefore handled by Anthropic under your Claude account's terms and settings. Do not commit private reports or secrets.
- **Saved workspace reads:** Claude Code authenticates to `https://augmentworks.ai/mcp` and sends tool arguments and the granted credential there. AugmentWorks returns saved workspace summaries to Claude Code. The grant is restricted to the selected workspace and read operations; revoking it stops further access but does not remove already saved reports or conversations.
- **Hosted CLI assessments:** an explicitly selected hosted workflow sends the configured assessment inputs and permitted evidence to AugmentWorks for grading and shared reports. Review the workspace, target, data scope, and quoted credits before starting. This is separate from local testing and MCP reads.

## Privacy and support

[AugmentWorks privacy policy](https://augmentworks.ai/privacy) explains hosted data handling and retention. [Terms](https://augmentworks.ai/terms) apply to the service. Local generated reports may contain conversations and observed application state; their lifetime is controlled by files in your project. Claude conversations and Claude-managed credentials are governed by Anthropic's policies and your account settings. For setup or deletion requests, use [AugmentWorks support](https://augmentworks.ai/contact).

## Maintainer verification and release

This directory is generated from shared command/skill sources plus Claude-specific templates. Edit those sources, then run `npm run build:claude` at the repository root and commit the generated files. `npm run check:claude` checks that the package has not drifted.

Before submitting a release, validate this exact directory with `claude plugin validate plugins/claude`, then test a fresh Claude Code installation: demo failure → correction → comparison; browser authorization → workspace listing → known report; denial, expiry/revocation, and workspace isolation. Local schema tests do not prove the deployed browser handoff works.

In the [Claude developer portal](https://claude.ai/directory/manage), submit the repository with plugin path **`plugins/claude`**. Run the portal's own validation, complete data-handling disclosures, and address review findings. A pinned npm launcher may still be held for review; local validation is not directory approval.

[Apache 2.0 license](LICENSE)
