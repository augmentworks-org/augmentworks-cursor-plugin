---
name: augmentworks-setup
description: Configure an HTTP agent for local tests or connect Cursor to saved AugmentWorks results.
---

If the developer explicitly asks for MCP or workspace sign-in to read saved results, use the installed `augmentworks-regression` skill’s **Connect to saved workspace results** workflow and stop after verifying the connection.

For local test setup, use the skill's **Set up a target** workflow. Work in the selected project. Reuse an existing AugmentWorks connector when present. Otherwise choose the response-only starter for a chat endpoint or the workflow starter for a target with fixture lifecycle and state inspection.

Adapt the mapping to a known route or a developer-supplied example. Run the local configuration check, and preview the mapping when a matching synthetic response fixture exists. Return the config path, any environment variable names the developer needs to set locally, and a packet suitable for `/augmentworks-test`. Stop after setup.
