import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildProxyInvocation,
  buildUsage,
  DEFAULT_API_BASE_URL,
  DEFAULT_MCP_URL,
  DEFAULT_NETWORK,
  isEntrypoint,
} from "../index.js";

describe("402bot CLI wrapper", () => {
  test("prints help with no args", () => {
    const invocation = buildProxyInvocation([]);
    expect(invocation.type).toBe("help");
    if (invocation.type === "help") {
      expect(invocation.text).toContain("Usage: 402bot <command> [options]");
    }
  });

  test("treats a symlinked global bin as the entrypoint", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "402bot-entrypoint-"));
    const symlinkPath = join(tempDir, "402bot");
    const entrypointPath = fileURLToPath(new URL("../index.js", import.meta.url));

    try {
      symlinkSync(entrypointPath, symlinkPath);
      expect(isEntrypoint(["node", symlinkPath])).toBe(true);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  test("forwards wallet history to x402-proxy", () => {
    expect(buildProxyInvocation(["wallet", "history"])).toEqual({
      type: "proxy",
      proxyArgs: ["wallet", "history"],
    });
  });

  test("maps wallet dossier profiles to recipe wrappers", () => {
    expect(buildProxyInvocation(["wallet", "dossier", "0xabc"])).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"walletAddress":"0xabc"}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/wallet-intel-brief/run`,
      ],
    });

    expect(buildProxyInvocation(["wallet", "dossier", "0xabc", "--profile", "treasury"])).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"walletAddress":"0xabc"}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/treasury-risk-watch/run`,
      ],
    });

    expect(buildProxyInvocation(["wallet", "dossier", "0xabc", "--profile", "defi-risk"])).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"walletAddress":"0xabc"}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/wallet-stablecoin-liquidity-brief/run`,
      ],
    });

    expect(
      buildProxyInvocation(["wallet", "dossier", "0xabc", "--profile", "counterparty-map", "--days", "1"]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"walletAddress":"0xabc","window":"24h"}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/wallet-counterparty-map/run`,
      ],
    });

    expect(
      buildProxyInvocation(["wallet", "dossier", "0xabc", "--profile", "prediction-markets", "--days", "14"]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"walletAddress":"0xabc","days":14}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/polymarket-wallet-dossier/run`,
      ],
    });
  });

  test("routes mcp to the 402.bot MCP server", () => {
    expect(buildProxyInvocation(["mcp"])).toEqual({
      type: "proxy",
      proxyArgs: ["mcp", DEFAULT_MCP_URL],
    });
  });

  test("adds campaign attribution to mcp", () => {
    expect(buildProxyInvocation(["mcp", "--campaign-id", "codex-mcp-setup"])).toEqual({
      type: "proxy",
      proxyArgs: ["mcp", `${DEFAULT_MCP_URL}?campaignId=codex-mcp-setup`],
    });
  });

  test("maps route to the paid route API", () => {
    expect(buildProxyInvocation(["route", "--body", '{"goal":"weather"}'])).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"goal":"weather"}',
        `${DEFAULT_API_BASE_URL}/v1/route`,
      ],
    });
  });

  test("does not duplicate content-type headers", () => {
    expect(
      buildProxyInvocation([
        "materialize",
        "--header",
        "Content-Type: application/json",
        "--body",
        "{}",
      ]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        "{}",
        `${DEFAULT_API_BASE_URL}/v1/alchemist/materialize`,
      ],
    });
  });

  test("builds discover as a filtered local action", () => {
    expect(
      buildProxyInvocation([
        "discover",
        "find",
        "the",
        "best",
        "wallet",
        "risk",
        "API",
        "--limit",
        "7",
        "--budget",
        "0.02",
        "--max-price",
        "0.01",
        "--freshness",
        "6h",
        "--trust",
        "observed",
        "--requires-mcp",
        "--asset",
        "USDC",
      ]),
    ).toEqual({
      type: "local",
      action: "discover_goal",
      baseUrl: DEFAULT_API_BASE_URL,
      goal: "find the best wallet risk API",
      network: DEFAULT_NETWORK,
      useConfiguredNetworkDefault: true,
      strategy: "balanced",
      limit: 7,
      budgetUsdc: 0.02,
      filters: {
        maxPriceUsdc: 0.01,
        freshness: "6h",
        trust: "observed",
        provider: undefined,
        requiresMcp: true,
        asset: "USDC",
      },
    });
  });

  test("supports --json on discovery and inspection commands", () => {
    expect(
      buildProxyInvocation(["--json", "discover", "find", "the", "best", "wallet", "risk", "API"]),
    ).toEqual({
      type: "local",
      action: "discover_goal",
      jsonOutput: true,
      baseUrl: DEFAULT_API_BASE_URL,
      goal: "find the best wallet risk API",
      network: DEFAULT_NETWORK,
      useConfiguredNetworkDefault: true,
      strategy: "balanced",
      limit: 5,
      budgetUsdc: undefined,
      filters: {
        maxPriceUsdc: undefined,
        freshness: undefined,
        trust: undefined,
        provider: undefined,
        requiresMcp: undefined,
        asset: undefined,
      },
    });

    expect(buildProxyInvocation(["inspect", "weather-alpha", "--json"])).toEqual({
      type: "local",
      action: "inspect_endpoint",
      jsonOutput: true,
      baseUrl: DEFAULT_API_BASE_URL,
      endpointId: "weather-alpha",
      days: 30,
    });
  });

  test("builds AG0 search, inspect, and dossier requests", () => {
    expect(buildProxyInvocation(["ag0", "search", "wallet-risk", "--network", "eip155:8453", "--limit", "7"])).toEqual({
      type: "http",
      url: `${DEFAULT_API_BASE_URL}/v1/ag0/search?capability=wallet-risk&network=eip155%3A8453&limit=7`,
      method: "GET",
      format: "ag0_search",
      meta: {
        capability: "wallet-risk",
        agentId: null,
      },
    });

    expect(buildProxyInvocation(["ag0", "inspect", "42"])).toEqual({
      type: "http",
      url: `${DEFAULT_API_BASE_URL}/v1/ag0/inspect/42`,
      method: "GET",
      format: "ag0_inspect",
      meta: {
        agentId: "42",
      },
    });

    expect(buildProxyInvocation(["ag0", "dossier", "42", "--json"])).toEqual({
      type: "http",
      jsonOutput: true,
      url: `${DEFAULT_API_BASE_URL}/v1/ag0/dossier/42`,
      method: "GET",
      format: "ag0_dossier",
      meta: {
        agentId: "42",
      },
    });
  });

  test("builds endpoint and agent inspection requests as local actions", () => {
    expect(buildProxyInvocation(["inspect", "weather-alpha", "--days", "14"])).toEqual({
      type: "local",
      action: "inspect_endpoint",
      baseUrl: DEFAULT_API_BASE_URL,
      endpointId: "weather-alpha",
      days: 14,
    });

    expect(
      buildProxyInvocation([
        "inspect",
        "0x1111111111111111111111111111111111111111",
        "--days",
        "7",
        "--network",
        "eip155:8453",
      ]),
    ).toEqual({
      type: "local",
      action: "inspect_agent",
      baseUrl: DEFAULT_API_BASE_URL,
      address: "0x1111111111111111111111111111111111111111",
      days: 7,
      network: "eip155:8453",
      useConfiguredNetworkDefault: false,
    });
  });

  test("builds compare, prompt, and plan as local actions", () => {
    expect(buildProxyInvocation(["compare", "wallet", "intelligence", "--days", "21"])).toEqual({
      type: "local",
      action: "compare_goal",
      baseUrl: DEFAULT_API_BASE_URL,
      goal: "wallet intelligence",
      network: DEFAULT_NETWORK,
      useConfiguredNetworkDefault: true,
      strategy: "balanced",
      limit: 3,
      budgetUsdc: undefined,
      days: 21,
    });

    expect(buildProxyInvocation(["prompt", "find", "a", "wallet", "risk", "API"])).toEqual({
      type: "local",
      action: "prompt_goal",
      baseUrl: DEFAULT_API_BASE_URL,
      goal: "find a wallet risk API",
      network: DEFAULT_NETWORK,
      useConfiguredNetworkDefault: true,
      strategy: "balanced",
      limit: 5,
      budgetUsdc: undefined,
    });

    expect(buildProxyInvocation(["plan", "monitor", "this", "wallet", "for", "treasury", "risk", "--json"])).toEqual({
      type: "local",
      action: "plan_goal",
      jsonOutput: true,
      baseUrl: DEFAULT_API_BASE_URL,
      goal: "monitor this wallet for treasury risk",
      network: DEFAULT_NETWORK,
      useConfiguredNetworkDefault: true,
      strategy: "balanced",
      limit: 3,
      budgetUsdc: undefined,
      days: 30,
    });
  });

  test("lists and searches recipes over the public recipe directory", () => {
    expect(buildProxyInvocation(["recipe", "list", "--cluster", "Wallet Intelligence", "--limit", "20"])).toEqual({
      type: "http",
      method: "GET",
      format: "recipes",
      meta: {
        mode: "list",
      },
      url: `${DEFAULT_API_BASE_URL}/v1/recipes?limit=20&cluster=Wallet+Intelligence&sort=quality`,
    });

    expect(buildProxyInvocation(["recipe", "search", "polymarket", "--max-price", "0.02", "--json"])).toEqual({
      type: "http",
      method: "GET",
      format: "recipes",
      jsonOutput: true,
      meta: {
        mode: "search",
        query: "polymarket",
      },
      url: `${DEFAULT_API_BASE_URL}/v1/recipes/search?q=polymarket&limit=12&sort=quality&maxPriceUsdc=0.02`,
    });
  });

  test("keeps recipe run as a direct proxy-backed paid surface", () => {
    expect(
      buildProxyInvocation(["recipe", "run", "wallet-intel-brief", "--body", '{"input":{"walletAddress":"0xabc"}}']),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"walletAddress":"0xabc"}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/wallet-intel-brief/run`,
      ],
    });

    expect(
      buildProxyInvocation([
        "recipe",
        "run",
        "wallet-intel-brief",
        "--from-file",
        "./input.json",
        "--wait",
        "--open",
        "--save",
        "./output.json",
      ]),
    ).toEqual({
      type: "local",
      action: "recipe_run",
      baseUrl: DEFAULT_API_BASE_URL,
      slug: "wallet-intel-brief",
      forwardedArgs: [],
      wait: true,
      open: true,
      savePath: "./output.json",
      fromFile: "./input.json",
    });
  });

  test("builds recipe inspect and recommend commands", () => {
    expect(buildProxyInvocation(["recipe", "inspect", "dune-onchain-brief", "--json"])).toEqual({
      type: "http",
      method: "GET",
      format: "recipe_detail",
      jsonOutput: true,
      meta: {
        slug: "dune-onchain-brief",
      },
      url: `${DEFAULT_API_BASE_URL}/v1/recipes/dune-onchain-brief`,
    });

    expect(buildProxyInvocation(["recipe", "recommend", "best", "treasury", "watch", "workflow"])).toEqual({
      type: "local",
      action: "recipe_recommend",
      baseUrl: DEFAULT_API_BASE_URL,
      goal: "best treasury watch workflow",
    });
  });

  test("builds provider directory commands", () => {
    expect(buildProxyInvocation(["providers", "list", "--limit", "5"])).toEqual({
      type: "local",
      action: "providers_directory",
      baseUrl: DEFAULT_API_BASE_URL,
      mode: "list",
      query: null,
      limit: 5,
      recommendation: null,
    });

    expect(buildProxyInvocation(["providers", "search", "dune", "--json"])).toEqual({
      type: "local",
      action: "providers_directory",
      jsonOutput: true,
      baseUrl: DEFAULT_API_BASE_URL,
      mode: "search",
      query: "dune",
      limit: 20,
      recommendation: null,
    });

    expect(buildProxyInvocation(["providers", "inspect", "dune"])).toEqual({
      type: "http",
      method: "GET",
      format: "provider_detail",
      meta: {
        slug: "dune",
      },
      url: `${DEFAULT_API_BASE_URL}/v1/providers/dune`,
    });
  });

  test("builds CoinGecko market companion commands", () => {
    expect(buildProxyInvocation(["market", "doctor", "--json"])).toEqual({
      type: "local",
      action: "market_doctor",
      command: "cg",
      jsonOutput: true,
    });

    expect(buildProxyInvocation(["--json", "market", "price", "--ids", "bitcoin"])).toEqual({
      type: "local",
      action: "market_passthrough",
      command: "cg",
      marketAction: "price",
      forwardedArgs: ["price", "--ids", "bitcoin"],
      jsonOutput: true,
    });

    expect(buildProxyInvocation(["market", "commands"])).toEqual({
      type: "local",
      action: "market_passthrough",
      command: "cg",
      marketAction: "commands",
      forwardedArgs: ["commands"],
    });

    expect(buildProxyInvocation(["market", "tui", "--json"])).toEqual({
      type: "error",
      message: "market tui does not support --json.",
    });
  });

  test("wraps docs crawl with scoped crawl defaults", () => {
    expect(buildProxyInvocation(["docs", "crawl", "https://docs.uniswap.org"])).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"sourceId":"cloudflare_crawl","deliveryFormat":"json","params":{"url":"https://docs.uniswap.org","pageFormat":"markdown","depth":1,"limit":6,"includeExternalLinks":false,"includeSubdomains":false}}',
        `${DEFAULT_API_BASE_URL}/v1/alchemist/fetch-transform`,
      ],
    });

    expect(
      buildProxyInvocation([
        "docs",
        "crawl",
        "https://docs.uniswap.org",
        "--profile",
        "integration-notes",
        "--scope",
        "subdomains",
        "--depth",
        "4",
        "--limit",
        "25",
      ]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"sourceId":"cloudflare_crawl","deliveryFormat":"json","params":{"url":"https://docs.uniswap.org","pageFormat":"markdown","depth":4,"limit":25,"includeExternalLinks":false,"includeSubdomains":true}}',
        `${DEFAULT_API_BASE_URL}/v1/alchemist/fetch-transform`,
      ],
    });
  });

  test("wraps polymarket trading into a local resolution action", () => {
    expect(
      buildProxyInvocation([
        "trade",
        "polymarket",
        "12345",
        "--side",
        "buy",
        "--size",
        "5",
        "--kind",
        "limit",
        "--price",
        "0.42",
      ]),
    ).toEqual({
      type: "local",
      action: "trade_polymarket",
      baseUrl: DEFAULT_API_BASE_URL,
      marketRef: "12345",
      outcome: undefined,
      side: "BUY",
      orderKind: "limit",
      price: 0.42,
      size: 5,
      amount: undefined,
      timeInForce: undefined,
      postOnly: false,
    });
  });

  test("builds config, doctor, spend, history, and completion commands", () => {
    expect(buildProxyInvocation(["config", "get"])).toEqual({
      type: "local",
      action: "config_get",
      key: null,
    });

    expect(buildProxyInvocation(["config", "set", "campaign-id", "codex-mcp-setup", "--json"])).toEqual({
      type: "local",
      action: "config_set",
      jsonOutput: true,
      key: "campaignId",
      value: "codex-mcp-setup",
    });

    expect(buildProxyInvocation(["doctor", "--json"])).toEqual({
      type: "local",
      action: "doctor",
      fix: false,
      jsonOutput: true,
    });

    expect(buildProxyInvocation(["doctor", "--fix"])).toEqual({
      type: "local",
      action: "doctor",
      fix: true,
    });

    expect(buildProxyInvocation(["spend", "--since", "7d"])).toEqual({
      type: "local",
      action: "spend",
      since: "7d",
    });

    expect(buildProxyInvocation(["history", "--since", "7d", "--limit", "50", "--json"])).toEqual({
      type: "local",
      action: "history",
      jsonOutput: true,
      since: "7d",
      limit: 50,
    });

    const completion = buildProxyInvocation(["completion", "zsh", "--json"]);
    expect(completion.type).toBe("print");
    if (completion.type === "print") {
      expect(completion.jsonOutput).toBe(true);
      expect(completion.data).toMatchObject({
        schema: "402bot/completion/v1",
        shell: "zsh",
      });
    }
  });

  test("builds init agent as a local action", () => {
    expect(buildProxyInvocation(["init", "agent", "codex", "--campaign-id", "codex-mcp-setup", "--json"])).toEqual({
      type: "local",
      action: "init_agent",
      jsonOutput: true,
      client: "codex",
      campaignId: "codex-mcp-setup",
      baseUrl: DEFAULT_API_BASE_URL,
      remoteMcpBaseUrl: DEFAULT_MCP_URL,
    });

    expect(buildProxyInvocation(["init", "automation", "github-actions"])).toEqual({
      type: "local",
      action: "init_automation",
      scaffoldTarget: "github-actions",
      baseUrl: DEFAULT_API_BASE_URL,
      remoteMcpBaseUrl: DEFAULT_MCP_URL,
    });
  });

  test("builds catalog, watch, export, and changelog commands", () => {
    expect(buildProxyInvocation(["catalog", "update", "--json"])).toEqual({
      type: "local",
      action: "catalog_update",
      jsonOutput: true,
      baseUrl: DEFAULT_API_BASE_URL,
    });

    expect(buildProxyInvocation(["recipes", "sync"])).toEqual({
      type: "local",
      action: "catalog_update",
      baseUrl: DEFAULT_API_BASE_URL,
    });

    expect(buildProxyInvocation(["watch", "provider", "dune", "--once", "--webhook-url", "https://example.com/hook"])).toEqual({
      type: "local",
      action: "watch",
      baseUrl: DEFAULT_API_BASE_URL,
      targetType: "provider",
      targetValue: "dune",
      interval: "30s",
      since: null,
      timeout: "5m",
      once: true,
      webhookUrl: "https://example.com/hook",
      exitOnChange: false,
    });

    expect(buildProxyInvocation(["export", "mcp-config", "codex"])).toEqual({
      type: "local",
      action: "export_mcp_config",
      client: "codex",
      baseUrl: DEFAULT_API_BASE_URL,
      remoteMcpBaseUrl: DEFAULT_MCP_URL,
    });

    expect(buildProxyInvocation(["export", "openapi"])).toEqual({
      type: "local",
      action: "export_openapi",
      baseUrl: DEFAULT_API_BASE_URL,
      mcpUrl: DEFAULT_MCP_URL,
    });

    expect(buildProxyInvocation(["whats-new"])).toEqual({
      type: "local",
      action: "changelog",
      baseUrl: DEFAULT_API_BASE_URL,
    });
  });

  test("maps named workflows to recipe runs", () => {
    expect(buildProxyInvocation(["run", "wallet-research", "0xabc"])).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"walletAddress":"0xabc"}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/wallet-intel-brief/run`,
      ],
    });

    expect(
      buildProxyInvocation([
        "run",
        "protocol-diligence",
        "https://docs.uniswap.org",
        "--question",
        "What are the obvious diligence gaps?",
      ]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"url":"https://docs.uniswap.org","question":"What are the obvious diligence gaps?"}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/site-due-diligence-pack/run`,
      ],
    });

    expect(buildProxyInvocation(["run", "market-briefing", "Polymarket", "election", "odds", "--min-likes", "5"])).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"query":"Polymarket election odds","minLikes":5}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/prediction-market-topic-radar/run`,
      ],
    });

    expect(
      buildProxyInvocation([
        "run",
        "swap-route",
        "0x4200000000000000000000000000000000000006",
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        "1000000000000000000",
        "--src-decimals",
        "18",
        "--dest-decimals",
        "6",
        "--network",
        "8453",
      ]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"srcToken":"0x4200000000000000000000000000000000000006","destToken":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913","amount":"1000000000000000000","srcDecimals":18,"destDecimals":6,"network":8453}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/paraswap-route-brief/run`,
      ],
    });

    expect(
      buildProxyInvocation([
        "run",
        "jupiter-route",
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "1000000000",
        "--slippage-bps",
        "50",
        "--swap-mode",
        "ExactIn",
      ]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"inputMint":"So11111111111111111111111111111111111111112","outputMint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"1000000000","slippageBps":50,"swapMode":"ExactIn"}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/jupiter-route-brief/run`,
      ],
    });

    expect(
      buildProxyInvocation([
        "run",
        "staking-scorecard",
        "Compare",
        "liquid",
        "staking",
        "options",
        "--protocols",
        "lido,rocket-pool",
        "--limit",
        "5",
      ]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"goal":"Compare liquid staking options","protocols":["lido","rocket-pool"],"limit":5}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/liquid-staking-scorecard/run`,
      ],
    });

    expect(
      buildProxyInvocation([
        "run",
        "lst-rates",
        "--assets",
        "wsteth,reth",
        "--question",
        "Which rates matter most?",
      ]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"assets":["wsteth","reth"],"question":"Which rates matter most?"}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/lst-exchange-rate-watch/run`,
      ],
    });

    expect(
      buildProxyInvocation([
        "run",
        "lst-premium",
        "Which",
        "LSTs",
        "look",
        "mature",
        "--assets",
        "wsteth,reth,weeth",
        "--protocols",
        "lido,rocket-pool,ether.fi",
      ]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"goal":"Which LSTs look mature","assets":["wsteth","reth","weeth"],"protocols":["lido","rocket-pool","ether.fi"]}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/lst-premium-vs-yield-brief/run`,
      ],
    });

    expect(
      buildProxyInvocation([
        "run",
        "cex-dislocation",
        "BTC",
        "--quote-asset",
        "USDT",
        "--include-funding",
      ]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"baseAsset":"BTC","quoteAsset":"USDT","includeFunding":true}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/cex-dislocation-watch/run`,
      ],
    });

    expect(
      buildProxyInvocation([
        "run",
        "crosschain-execution",
        "SOL",
        "USDC",
        "1000000000",
        "SOL",
        "--quote-asset",
        "USDT",
        "--include-funding",
        "--slippage-bps",
        "50",
      ]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"solana":{"inputQuery":"SOL","outputQuery":"USDC","amount":"1000000000","slippageBps":50},"cex":{"baseAsset":"SOL","quoteAsset":"USDT","includeFunding":true}}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/crosschain-execution-board/run`,
      ],
    });

    expect(
      buildProxyInvocation([
        "run",
        "paraswap-vs-jupiter",
        "0x4200000000000000000000000000000000000006",
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        "1000000000000000000",
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "1000000000",
        "--paraswap-src-decimals",
        "18",
        "--paraswap-dest-decimals",
        "6",
        "--jupiter-slippage-bps",
        "50",
      ]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"paraswap":{"srcToken":"0x4200000000000000000000000000000000000006","destToken":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913","amount":"1000000000000000000","srcDecimals":18,"destDecimals":6},"jupiter":{"inputMint":"So11111111111111111111111111111111111111112","outputMint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"1000000000","slippageBps":50}}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/paraswap-vs-jupiter-execution-brief/run`,
      ],
    });
  });

  test("supports env overrides for raw public surfaces", () => {
    expect(
      buildProxyInvocation(["fetch-sources"], {
        BOT402_API_URL: "https://staging.api.402.bot",
      }),
    ).toEqual({
      type: "proxy",
      proxyArgs: ["https://staging.api.402.bot/v1/alchemist/fetch-sources"],
    });
  });

  test("returns targeted errors for malformed higher-level commands", () => {
    expect(buildProxyInvocation(["recipe", "run"])).toEqual({
      type: "error",
      message: "recipe run requires a <slug>.",
    });

    expect(buildProxyInvocation(["trade", "polymarket", "12345", "--size", "1"])).toEqual({
      type: "error",
      message: "trade polymarket requires --side buy|sell.",
    });

    expect(buildProxyInvocation(["config", "set", "unknown", "value"])).toEqual({
      type: "error",
      message: "Unknown config key: unknown",
    });
  });

  test("usage documents the new operator and agent flows", () => {
    const usage = buildUsage();
    expect(usage).toContain("402bot config get");
    expect(usage).toContain("402bot doctor");
    expect(usage).toContain("402bot spend --since 7d");
    expect(usage).toContain("402bot completion zsh");
    expect(usage).toContain("402bot discover");
    expect(usage).toContain("402bot inspect <endpoint-id-or-agent-address>");
    expect(usage).toContain("402bot wallet dossier <address> --profile treasury");
    expect(usage).toContain("402bot docs crawl https://docs.uniswap.org --profile integration-notes --scope subdomains --depth 2");
    expect(usage).toContain("402bot trade polymarket https://polymarket.com/event/example --outcome yes --side buy --size 5");
    expect(usage).toContain("402bot init agent codex --campaign-id codex-mcp-setup");
    expect(usage).toContain("402bot providers list");
    expect(usage).toContain("402bot market doctor");
    expect(usage).toContain("402bot --json market markets --category layer-2 --total 25");
    expect(usage).toContain("402bot catalog update");
    expect(usage).toContain("402bot watch provider dune --once");
    expect(usage).toContain("402bot export mcp-config codex");
    expect(usage).toContain("402bot init automation github-actions");
    expect(usage).toContain("402bot run swap-route");
    expect(usage).toContain("402bot run jupiter-route So11111111111111111111111111111111111111112 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 1000000000 --slippage-bps 50");
    expect(usage).toContain('402bot run staking-scorecard "Compare liquid staking options for a conservative ETH treasury"');
    expect(usage).toContain("402bot run lst-rates --assets wsteth,reth,cbeth,weeth,sfrxeth --question 'Which LST exchange rates deserve monitoring?'");
    expect(usage).toContain('402bot run lst-premium "Which ETH LSTs look mature enough for treasury collateral?" --assets wsteth,reth,cbeth,weeth,sfrxeth');
    expect(usage).toContain("402bot run cex-dislocation BTC --quote-asset USDT --include-funding");
    expect(usage).toContain("402bot run paraswap-vs-jupiter 0x4200000000000000000000000000000000000006 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 1000000000000000000 So11111111111111111111111111111111111111112 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 1000000000 --paraswap-src-decimals 18 --paraswap-dest-decimals 6");
    expect(usage).toContain("402bot run crosschain-execution SOL USDC 1000000000 SOL --quote-asset USDT --include-funding");
  });
});
