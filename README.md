# 402.bot Discovery Oracle

Public metadata and install companion for the live `402.bot` MCP server.

This repository is intentionally minimal. It exists so MCP directories and agent marketplaces can review a public repository without exposing the private implementation codebase.

## Live Server

- Runtime: `https://api.402.bot/mcp`
- Setup page: `https://api.402.bot/mcp/setup`
- Setup markdown: `https://api.402.bot/mcp/setup.md`
- Homepage: `https://402.bot`
- `llms.txt`: `https://402.bot/llms.txt`
- Official MCP Registry: `bot.402/discovery-oracle`
- Smithery: `https://smithery.ai/servers/bot402/discovery-oracle`

## Description

Discover and inspect live agent APIs. Search ranked endpoints, inspect trust and payment telemetry, and analyze agent usage through a read-only MCP surface built for x402 and agent API discovery.

## Tools

- `discover_endpoints`: search ranked live endpoints by capability, network, discovery source, and strategy
- `inspect_endpoint`: inspect endpoint trust, probe freshness, payment activity, and routing telemetry
- `inspect_agent`: inspect wallet-level routing and payment analytics

## Resources

- `https://api.402.bot/mcp/resources/agent-metadata`
- `https://api.402.bot/mcp/resources/capability-catalog`
- `https://api.402.bot/mcp/resources/top-capabilities`
- `https://api.402.bot/mcp/resources/example-queries`
- `https://api.402.bot/mcp/resources/paid-surfaces`
- `https://api.402.bot/mcp/resources/setup-notes`

## Transport

- Remote MCP
- `streamable-http`
- Public, stateless, read-only
- No API key required in v1

## Install

See [llms-install.md](./llms-install.md) for copy-paste setup snippets for Claude Desktop, Claude Code, Cursor, Codex CLI, Gemini CLI, OpenClaw guidance, and generic remote MCP JSON.

## Repo Scope

This repo is documentation and directory metadata only. The production runtime remains hosted at `https://api.402.bot/mcp`.
