# 402bot

`402bot` is a product CLI for `402.bot`, backed by [`x402-proxy`](https://github.com/cascade-protocol/x402-proxy).

It keeps wallet setup, x402 payment handling, MCP proxying, and spend history from `x402-proxy`, but adds higher-level commands for discovery, inspection, recipes, docs crawls, wallet dossiers, market workflows, and agent setup.

## Discovery And Agent Operations

```bash
402bot setup
402bot status
402bot wallet

402bot mcp --campaign-id defi-agent-alpha

402bot discover "find the best live Base wallet-intelligence or risk API for an autonomous trading agent"
402bot inspect weather-alpha
402bot inspect 0x1111111111111111111111111111111111111111
402bot compare "find the best live Base treasury monitoring API"

402bot recipe list
402bot recipe search "polymarket"

402bot prompt "find the best live Base wallet risk API"
402bot plan "monitor this wallet for treasury and prediction-market risk"

402bot init agent
402bot init agent codex --campaign-id codex-mcp-setup
```

## Paid Execution Wrappers

```bash
402bot wallet dossier 0x1111111111111111111111111111111111111111
402bot wallet dossier 0x1111111111111111111111111111111111111111 --profile polymarket --days 14

402bot docs crawl https://docs.uniswap.org

402bot trade polymarket 12345 --side buy --size 5
402bot trade polymarket 12345 --side sell --amount 10 --kind market

402bot run wallet-research 0x1111111111111111111111111111111111111111
402bot run protocol-diligence https://docs.uniswap.org --question "What are the obvious diligence gaps?"
402bot run market-briefing "Polymarket election odds" --min-likes 5

402bot recipe run wallet-intel-brief --body '{"input":{"walletAddress":"0x1111111111111111111111111111111111111111"}}'
402bot route --body '{"capability":"wallet-intelligence","network":"eip155:8453","strategy":"balanced","limit":3}'
402bot fetch-transform --body '{"sourceId":"cloudflare_crawl","params":{"url":"https://docs.uniswap.org"}}'
```

## Notes

- `mcp` routes to `https://api.402.bot/mcp`
- read-only discovery and analytics commands hit the public `402.bot` HTTP APIs directly
- paid execution commands still settle through `x402-proxy`
- `BOT402_API_URL` and `BOT402_MCP_URL` can override the defaults
