# 402.bot MCP Install

`402.bot` is a public, read-only remote MCP server for live agent API discovery, endpoint inspection, and x402 ecosystem visibility.

- Runtime: `https://api.402.bot/mcp`
- Setup guide: `https://api.402.bot/mcp/setup`
- Setup markdown: `https://api.402.bot/mcp/setup.md`
- Homepage: `https://402.bot`
- Registry listing: `bot.402/discovery-oracle`

## What It Does

- `discover_endpoints`: search ranked live endpoints by capability, network, discovery source, and strategy
- `inspect_endpoint`: inspect endpoint trust, probe freshness, payment activity, and routing telemetry
- `inspect_agent`: inspect wallet-level routing and payment analytics

## Transport

- Remote MCP
- `streamable-http`
- Public, stateless, read-only
- No API key required in v1

## Install

### Claude Desktop

```json
{
  "mcpServers": {
    "discovery_oracle": {
      "type": "http",
      "url": "https://api.402.bot/mcp"
    }
  }
}
```

### Claude Code

```bash
claude mcp add-json discovery_oracle '{"type":"http","url":"https://api.402.bot/mcp"}'
```

### Cursor

```json
{
  "mcpServers": {
    "discovery_oracle": {
      "url": "https://api.402.bot/mcp"
    }
  }
}
```

### Codex CLI

```bash
codex mcp add discovery_oracle --url https://api.402.bot/mcp
```

```toml
[mcp_servers.discovery_oracle]
url = "https://api.402.bot/mcp"
```

### Gemini CLI

```json
{
  "mcpServers": {
    "discovery_oracle": {
      "httpUrl": "https://api.402.bot/mcp",
      "timeout": 20000
    }
  }
}
```

### Generic Remote MCP JSON

```json
{
  "mcpServers": {
    "discovery_oracle": {
      "type": "http",
      "url": "https://api.402.bot/mcp"
    }
  }
}
```

## Notes

- Paid x402 execution stays on `POST /v1/route` and `POST /v1/alchemist/transform`
- Use an MCP client that supports remote `streamable-http`
- Do not open `/mcp` directly in a browser tab; MCP clients negotiate the protocol over `POST`
