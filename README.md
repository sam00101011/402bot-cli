# 402bot

`402bot` is a product CLI for `402.bot`, backed by [`x402-proxy`](https://github.com/cascade-protocol/x402-proxy).

It keeps wallet setup, x402 payment handling, MCP proxying, and spend history from `x402-proxy`, but adds higher-level commands for discovery, inspection, config defaults, docs crawls, wallet dossiers, market workflows, and agent setup.

## Setup, Config, And History

```bash
402bot setup
402bot status
402bot doctor
402bot wallet
402bot config get
402bot config set campaign-id codex-mcp-setup
402bot config set spend-cap 2
402bot spend --since 7d
402bot history --since 7d --json
402bot completion zsh
```

## Discovery And Agent Operations

```bash

402bot mcp --campaign-id defi-agent-alpha

402bot discover "find the best live Base wallet-intelligence or risk API for an autonomous trading agent"
402bot discover "best Base treasury API" --max-price 0.02 --freshness 6h --trust observed --requires-mcp
402bot inspect weather-alpha
402bot inspect 0x1111111111111111111111111111111111111111
402bot compare "find the best live Base treasury monitoring API"

402bot recipe list
402bot recipe search "polymarket"
402bot recipe inspect dune-onchain-brief
402bot recipe inspect crypto-market-opening-bell
402bot recipe inspect category-opening-bell
402bot recipe inspect sector-rotation-watch
402bot recipe inspect defi-yield-shortlist
402bot recipe inspect hyperliquid-funding-crowding-watch
402bot recipe inspect snapshot-governance-watch
402bot recipe inspect paraswap-route-brief
402bot recipe inspect jupiter-route-brief
402bot recipe inspect liquid-staking-scorecard
402bot recipe inspect lst-exchange-rate-watch
402bot recipe inspect lst-premium-vs-yield-brief
402bot recipe inspect cex-dislocation-watch
402bot recipe inspect paraswap-vs-jupiter-execution-brief
402bot recipe inspect crosschain-execution-board
402bot recipe recommend "best treasury watch workflow"
402bot providers list
402bot providers search "dune"
402bot providers inspect dune
402bot market doctor
402bot market price --ids bitcoin
402bot --json market markets --category layer-2 --total 25
402bot market history bitcoin --days 30
402bot market watch --ids bitcoin,ethereum
402bot market commands
402bot catalog update
402bot changelog
402bot watch provider dune --once
402bot export mcp-config codex
402bot export openapi

402bot prompt "find the best live Base wallet risk API"
402bot plan "monitor this wallet for treasury and prediction-market risk"

402bot init agent
402bot init agent codex --campaign-id codex-mcp-setup
```

## Paid Execution Wrappers

```bash
402bot wallet dossier 0x1111111111111111111111111111111111111111
402bot wallet dossier 0x1111111111111111111111111111111111111111 --profile treasury
402bot wallet dossier 0x1111111111111111111111111111111111111111 --profile defi-risk
402bot wallet dossier 0x1111111111111111111111111111111111111111 --profile counterparty-map --days 1
402bot wallet dossier 0x1111111111111111111111111111111111111111 --profile prediction-markets --days 14

402bot docs crawl https://docs.uniswap.org
402bot docs crawl https://docs.uniswap.org --profile integration-notes --scope subdomains --depth 2

402bot trade polymarket https://polymarket.com/event/example --outcome yes --side buy --size 5
402bot trade polymarket us-recession-in-2026 --outcome no --side sell --amount 10 --kind market

402bot run wallet-research 0x1111111111111111111111111111111111111111
402bot run protocol-diligence https://docs.uniswap.org --question "What are the obvious diligence gaps?"
402bot run market-briefing "Polymarket election odds" --min-likes 5
402bot run swap-route 0x4200000000000000000000000000000000000006 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 1000000000000000000 --src-decimals 18 --dest-decimals 6 --network 8453
402bot run jupiter-route So11111111111111111111111111111111111111112 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 1000000000 --slippage-bps 50
402bot run staking-scorecard "Compare liquid staking options for a conservative ETH treasury"
402bot run lst-rates --assets wsteth,reth,cbeth,weeth,sfrxeth --question "Which LST exchange rates deserve monitoring?"
402bot run lst-premium "Which ETH LSTs look mature enough for treasury collateral?" --assets wsteth,reth,cbeth,weeth,sfrxeth
402bot run cex-dislocation BTC --quote-asset USDT --include-funding
402bot run paraswap-vs-jupiter 0x4200000000000000000000000000000000000006 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 1000000000000000000 So11111111111111111111111111111111111111112 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 1000000000 --paraswap-src-decimals 18 --paraswap-dest-decimals 6
402bot run crosschain-execution SOL USDC 1000000000 SOL --quote-asset USDT --include-funding
402bot recipe run crypto-market-opening-bell --body '{"input":{"vsCurrency":"usd","limit":5}}'
402bot recipe run category-opening-bell --body '{"input":{"category":"layer-2","vsCurrency":"usd","limit":5}}'
402bot recipe run sector-rotation-watch --body '{"input":{"categories":["artificial-intelligence","layer-2","real-world-assets-rwa"],"vsCurrency":"usd","limitPerCategory":5}}'
402bot recipe run defi-yield-shortlist --body '{"input":{"goal":"Find the best low-risk Base USDC parking opportunities.","chain":"base","stablecoinOnly":true,"minTvlUsd":10000000,"limit":5}}'
402bot recipe run hyperliquid-funding-crowding-watch --body '{"input":{"coins":["BTC","ETH"],"sortBy":"fundingRate","limit":6}}'
402bot recipe run snapshot-governance-watch --body '{"input":{"question":"What governance votes should a DeFi operator monitor this week?","spaceIds":["aave.eth","lido-snapshot.eth"],"state":"active","limit":6}}'
402bot recipe run paraswap-route-brief --body '{"input":{"network":8453,"srcToken":"0x4200000000000000000000000000000000000006","destToken":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913","amount":"1000000000000000000","srcDecimals":18,"destDecimals":6,"side":"SELL"}}'
402bot recipe run jupiter-route-brief --body '{"input":{"inputMint":"So11111111111111111111111111111111111111112","outputMint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"1000000000","slippageBps":50}}'
402bot recipe run liquid-staking-scorecard --body '{"input":{"goal":"Compare liquid staking options for a conservative ETH treasury.","protocols":["lido","rocket-pool","coinbase-wrapped-staked-eth","ether.fi"],"minTvlUsd":50000000,"limit":8}}'
402bot recipe run lst-exchange-rate-watch --body '{"input":{"question":"Which LST exchange rates deserve monitoring?","assets":["wsteth","reth","cbeth","weeth","sfrxeth"]}}'
402bot recipe run lst-premium-vs-yield-brief --body '{"input":{"goal":"Which ETH LSTs look mature enough for treasury collateral?","assets":["wsteth","reth","cbeth","weeth","sfrxeth"],"protocols":["lido","rocket-pool","coinbase-wrapped-staked-eth","ether.fi","frax-ether"],"minTvlUsd":50000000,"limit":10}}'
402bot recipe run cex-dislocation-watch --body '{"input":{"baseAsset":"BTC","quoteAsset":"USDT","includeFunding":true}}'
402bot recipe run paraswap-vs-jupiter-execution-brief --body '{"input":{"paraswap":{"network":8453,"srcToken":"0x4200000000000000000000000000000000000006","destToken":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913","amount":"1000000000000000000","srcDecimals":18,"destDecimals":6},"jupiter":{"inputMint":"So11111111111111111111111111111111111111112","outputMint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"1000000000","slippageBps":50}}}'
402bot recipe run crosschain-execution-board --body '{"input":{"goal":"Decide whether SOL execution currently looks cleaner on Jupiter or major CEX venues.","solana":{"inputQuery":"SOL","outputQuery":"USDC","amount":"1000000000","slippageBps":50},"cex":{"baseAsset":"SOL","quoteAsset":"USDT","includeFunding":true}}}'

402bot recipe run wallet-intel-brief --body '{"input":{"walletAddress":"0x1111111111111111111111111111111111111111"}}'
402bot recipe run wallet-intel-brief --from-file ./input.json --wait --save ./output.json
402bot route --body '{"capability":"wallet-intelligence","network":"eip155:8453","strategy":"balanced","limit":3}'
402bot fetch-transform --body '{"sourceId":"cloudflare_crawl","params":{"url":"https://docs.uniswap.org"}}'
```

## Notes

- `mcp` routes to `https://api.402.bot/mcp`
- `config` persists `campaignId`, preferred network, spend caps, favorite wallet, and favorite recipe under `~/.config/402bot`
- read-only discovery and analytics commands hit the public `402.bot` HTTP APIs directly
- `discover`, `inspect`, `compare`, `doctor`, `spend`, `history`, and `completion` support stable `--json` output
- `recipe inspect`, `providers inspect`, `catalog update`, `watch`, `export`, and `changelog` support stable `--json` output
- `market` delegates to a local `cg` install from https://github.com/coingecko/coingecko-cli and respects global `--json` where the upstream command supports JSON output
- paid execution commands still settle through `x402-proxy`
- `BOT402_API_URL`, `BOT402_MCP_URL`, and `BOT402_CG_BIN` can override the defaults
