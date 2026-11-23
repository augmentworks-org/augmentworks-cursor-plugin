# AugmentWorks for Claude Code

See why a test failed and what changed after a fix. The AugmentWorks directory plugin reads saved test results from a workspace you authorize. It can list applications and pinned baselines, summarize a saved run, and compare two runs. It also guides you to the steps to run a test yourself.

## Get started

Install the plugin in Claude Code 2.1.281 or later. Open the native `/mcp` menu, select the plugin’s **workspace** server, and choose its authentication control. Sign in to AugmentWorks, select the workspace you want to inspect, and allow read access. Then ask “Which applications and pinned baselines are in my workspace?”

| Command | What you can ask |
| --- | --- |
| `/augmentworks:connect` | “List my applications and pinned baselines.” |
| `/augmentworks:report` | “Summarize the failed checks for this saved run.” |
| `/augmentworks:compare` | “Compare this candidate run with the pinned baseline for my support agent.” |
| `/augmentworks:cli-guide` | “How do I try the refund demo or run tests on my own agent?” |

For a saved run, supply its ID from your AugmentWorks dashboard. The comparison identifies the candidate and the baseline separately, including differences in coverage that affect interpretation. For a first test, follow the [local quickstart](https://augmentworks.ai/docs/local-quickstart) in your own terminal. For a new hosted assessment, follow the [hosted quickstart](https://augmentworks.ai/docs/quickstart) and review the quote yourself.

## Connection and data

The plugin declares one HTTPS server at `https://augmentworks.ai/mcp`. The server returns saved application and environment names, pinned baselines, report summaries and comparisons from the workspace you authorized. Requests carry the workspace credential managed by Claude Code and identifiers such as the run or baseline ID. Results enter your Claude conversation. These reads spend no assessment credits. The plugin runs no executables and does not read local files. CLI examples in the linked guides are steps for you to run separately.

Claude Code manages the OAuth exchange through the public native client `augmentworks-claude-code` with a fixed loopback callback at `http://localhost:8788/callback`. The current grant lasts one hour. Reconnect through the native control after expiry. Revoke access in [MCP connections](https://augmentworks.ai/portal/mcp/grants).

See the [privacy policy](https://augmentworks.ai/privacy) for hosted data handling and retention, the [terms of service](https://augmentworks.ai/terms), and [AugmentWorks support](https://augmentworks.ai/contact) for help or deletion requests. Claude conversations are subject to your Anthropic account settings and policies.

[Apache 2.0 license](LICENSE)
