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

## Verify a checkout

```sh
npm test
```

The tests check plugin discovery files, inspect and compare local reports, and exercise the published CLI against two loopback agents. They cover a refund-policy violation and a response-only FAQ that changes from failing to passing. The tests use temporary project directories and require no AugmentWorks credentials. To run only those end-to-end cases, use `npm run test:e2e`.

If the commands do not appear, check that `.cursor-plugin/plugin.json` sits directly inside the cloned plugin directory, reload the window, and check **Customize** again. Use a real checkout in that directory. Enterprise workspaces also need **Allow Local Plugin Imports** enabled. [Cursor plugin installation](https://cursor.com/docs/plugins)

[Apache 2.0 license](LICENSE)
