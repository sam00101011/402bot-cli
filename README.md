# 402bot CLI

Public npm package and release repo for the `402bot` CLI.

`402bot` is a product wrapper around [`x402-proxy`](https://github.com/cascade-protocol/x402-proxy). It gives users a direct CLI for the public `402.bot` MCP and paid HTTP surfaces without requiring them to memorize raw URLs.

## Install

```bash
npx 402bot
```

## Commands

```bash
402bot setup
402bot status
402bot wallet

402bot mcp
402bot mcp --campaign-id codex-mcp-setup

402bot route --body '{"goal":"find a weather api on Base"}'
402bot materialize --body '{"templateId":"wallet_portfolio","parameters":{"wallet":"0x..."}}'
402bot fetch-transform --body '{"sourceId":"openweather_current","params":{"city":"Tokyo"}}'

402bot recipes
402bot recipe run wallet-intel-brief --body '{}'

402bot polymarket performance 0x1234...
402bot polymarket order --body '{"market":"..."}'
```

## Public 402.bot surfaces

- MCP runtime: `https://api.402.bot/mcp`
- MCP setup page: `https://api.402.bot/mcp/setup`
- HTTP API base: `https://api.402.bot`
- Homepage: `https://402.bot`

See [llms-install.md](./llms-install.md) for the copy-paste MCP installation snippets for desktop and CLI clients.

## Publish

This repo publishes the npm package `402bot`.

- GitHub Actions workflow: `.github/workflows/publish.yml`
- npm secret required: `NPM_TOKEN`
- tag format: `v<package-version>`

Example:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Repo Scope

This repo is the public home for the CLI package only. The full `402.bot` product/runtime remains private.
