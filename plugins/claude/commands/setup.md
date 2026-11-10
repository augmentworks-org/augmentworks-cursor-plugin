---
name: setup
description: Configure an HTTP agent for local tests or connect Claude Code to saved AugmentWorks results.
---

For sign-in, workspace connection, authentication troubleshooting, or setup without a specified local HTTP target, use the installed `augmentworks:augmentworks-regression` skill's **Connect to saved workspace results** workflow and stop after verifying the connection. This is the same flow as `/augmentworks:connect`. Do not use CLI login or ask for an API key to connect the default MCP server.

For local test setup, use the skill's **Set up a target** workflow. Work in the selected project. Reuse an existing AugmentWorks connector when present. Otherwise choose the response-only starter for a chat endpoint or the workflow starter for a target with fixture lifecycle and state inspection.

Adapt the mapping to a known route or a developer-supplied example. Run the local configuration check, and preview the mapping when a matching synthetic response fixture exists. Return the config path, any environment variable names the developer needs to set locally, and a packet suitable for `/augmentworks:test`. Stop after setup.
