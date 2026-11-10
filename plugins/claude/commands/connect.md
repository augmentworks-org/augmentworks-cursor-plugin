---
name: connect
description: Connect Claude Code to an AugmentWorks workspace through browser sign-in and verify saved-result access.
---

Use the installed `augmentworks:augmentworks-regression` skill's **Connect to saved workspace results** workflow. Use the plugin's **workspace** MCP connection. Claude Code owns the browser authorization flow and credentials. Guide the developer to `/mcp` and the workspace server's authentication control if needed, then verify access with `list_applications` after they return.

Report success only after the MCP tool succeeds; an empty applications list is valid. Do not run CLI login, request an API key, edit credentials, start an assessment, or treat website/CLI authentication as proof that MCP is connected. If the hosted endpoint is unavailable, report that deployment problem without switching authentication methods.
