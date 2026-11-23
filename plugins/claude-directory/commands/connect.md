---
name: connect
description: Connect a workspace and list its applications and pinned test baselines.
---

Use only the declared AugmentWorks workspace MCP server. If it needs authorization, ask the user to open the native Claude Code `/mcp` menu, select the AugmentWorks workspace server, and complete browser sign-in. After they return, use `list_applications` to verify access and list the applications, environments, and pinned baselines. An empty result is a successful connection. If sign-in fails, explain the error and stop. Leave credential entry to the native sign-in flow.
