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
      jsonOutput: true,
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
  });
});
