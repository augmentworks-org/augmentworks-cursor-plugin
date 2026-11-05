---
name: augmentworks-setup
description: Configure a JSON HTTP agent for local regression testing and validate its request and response mapping.
---

Use the installed `augmentworks-regression` skill's **Set up a target** workflow. Work in the selected project. Reuse an existing AugmentWorks connector when present. Otherwise choose the response-only starter for a chat endpoint or the workflow starter for a target with fixture lifecycle and state inspection.

Adapt the mapping to a known route or a developer-supplied example. Run the local configuration check, and preview the mapping when a matching synthetic response fixture exists. Return the config path, any environment variable names the developer needs to set locally, and a packet suitable for `/augmentworks-test`. Stop after setup.
